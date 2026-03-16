import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactFlow, {
  Background, Controls,
  useNodesState, useEdgesState, addEdge,
  MarkerType,
  ReactFlowProvider,
} from 'reactflow'
import { useExperiments } from '../../store/experimentStore'
import { experimentsToNodes, experimentsToEdges, getNodeStyle } from './graphUtils'
import { applyDagreLayout, NODE_WIDTH, NODE_HEIGHT, RANKSEP, GRID_SNAP_X, GRID_SNAP_Y } from './dagreLayout'
import ExperimentNode from './ExperimentNode'
import OutcomePopup from './OutcomePopup'
import GraphContextMenu from './GraphContextMenu'
import GraphSidePanel from './GraphSidePanel'
import GroupListPanel from './GroupListPanel'
import GroupOverlay from './GroupOverlay'
import { useGraphGroups } from './GraphGroupProvider'
import {
  resolveGroupNodeIds, generateGroupId, GROUP_COLORS,
  migrateGroupEndNodes, migrateGroupData, isEndNode,
} from './graphGroups'

const nodeTypes = {
  experimentNode: ExperimentNode,
}

// ── 그룹 미포함 노드 밀어내기 (순수 함수, useEffect 외부) ─────────
function applyPushOut(nodeList, groupList, fullData, isLR) {
  if (nodeList.length === 0 || groupList.length === 0) return nodeList
  const PADDING = 24
  const fullList = Object.values(fullData)

  // 그리드 스냅 헬퍼
  const snapX = (v) => Math.round(v / GRID_SNAP_X) * GRID_SNAP_X
  const snapY = (v) => Math.round(v / GRID_SNAP_Y) * GRID_SNAP_Y

  // 충돌 회피: 목표 위치에 다른 노드가 있으면 같은 방향으로 한 칸씩 더 이동
  const avoidX = (nx, ny, nodeId, dir) => {
    let tx = nx
    while (nodeList.some((n) => n.id !== nodeId &&
        Math.abs(n.position.x - tx) < 1 && Math.abs(n.position.y - ny) < 1)) {
      tx += dir * GRID_SNAP_X
    }
    return tx
  }
  const avoidY = (nx, ny, nodeId, dir) => {
    let ty = ny
    while (nodeList.some((n) => n.id !== nodeId &&
        Math.abs(n.position.x - nx) < 1 && Math.abs(n.position.y - ty) < 1)) {
      ty += dir * GRID_SNAP_Y
    }
    return ty
  }

  const groupBoxes = groupList.map((group) => {
    const ids = resolveGroupNodeIds(group, fullList)
    const groupNodes = nodeList.filter((n) => ids.has(n.id))
    if (groupNodes.length === 0) return null
    return {
      ids,
      minX: Math.min(...groupNodes.map((n) => n.position.x)) - PADDING,
      minY: Math.min(...groupNodes.map((n) => n.position.y)) - PADDING,
      maxX: Math.max(...groupNodes.map((n) => n.position.x + NODE_WIDTH)) + PADDING,
      maxY: Math.max(...groupNodes.map((n) => n.position.y + NODE_HEIGHT)) + PADDING,
    }
  }).filter(Boolean)
  if (groupBoxes.length === 0) return nodeList

  let anyChange = false
  const updated = nodeList.map((node) => {
    let { x, y } = node.position
    const exp = fullData[node.id]
    const preceding = new Set(exp?.connections?.precedingExperiments ?? [])
    const following = new Set(exp?.connections?.followingExperiments ?? [])

    for (const box of groupBoxes) {
      if (box.ids.has(node.id)) continue
      const overlapX = Math.min(x + NODE_WIDTH, box.maxX) - Math.max(x, box.minX)
      const overlapY = Math.min(y + NODE_HEIGHT, box.maxY) - Math.max(y, box.minY)
      if (overlapX <= 0 || overlapY <= 0) continue

      const parentIds  = [...preceding].filter((id) => box.ids.has(id))
      const isFollower = parentIds.length > 0
      const isPreceder = [...following].some((id) => box.ids.has(id))

      if (isFollower && !isPreceder) {
        const parentInGroupFollowers = parentIds.flatMap(
          (pid) => fullData[pid]?.connections?.followingExperiments ?? []
        ).filter((id) => box.ids.has(id))

        if (parentInGroupFollowers.length >= 2) {
          // 분기점 제외 노드
          const parentNode   = nodeList.find((n) => n.id === parentIds[0])
          const siblingNodes = parentInGroupFollowers
            .map((sid) => nodeList.find((n) => n.id === sid)).filter(Boolean)
          if (isLR) {
            const newY = snapY(box.maxY + GRID_SNAP_Y)
            y = avoidY(x, newY, node.id, 1)
            if (siblingNodes.length > 0)
              x = snapX(siblingNodes.reduce((s, n) => s + n.position.x, 0) / siblingNodes.length)
            else if (parentNode)
              x = snapX(parentNode.position.x + GRID_SNAP_X)
          } else {
            const newX = snapX(box.maxX + GRID_SNAP_X)
            x = avoidX(newX, y, node.id, 1)
            if (siblingNodes.length > 0)
              y = snapY(siblingNodes.reduce((s, n) => s + n.position.y, 0) / siblingNodes.length)
            else if (parentNode)
              y = snapY(parentNode.position.y + GRID_SNAP_Y)
          }
        } else {
          // 단순 제외
          const parentNode = nodeList.find((n) => n.id === parentIds[0])
          if (isLR) {
            const base = parentNode ? snapX(parentNode.position.x + GRID_SNAP_X) : snapX(box.maxX + GRID_SNAP_X)
            x = avoidX(base, y, node.id, 1)
          } else {
            const base = parentNode ? snapY(parentNode.position.y + GRID_SNAP_Y) : snapY(box.maxY + GRID_SNAP_Y)
            y = avoidY(x, base, node.id, 1)
          }
        }
      } else if (isPreceder && !isFollower) {
        const childInGroupId = [...following].find((id) => box.ids.has(id))
        const childNode = childInGroupId ? nodeList.find((n) => n.id === childInGroupId) : null
        if (isLR) {
          const base = childNode ? snapX(childNode.position.x - GRID_SNAP_X) : snapX(box.minX - GRID_SNAP_X)
          x = avoidX(base, y, node.id, -1)
        } else {
          const base = childNode ? snapY(childNode.position.y - GRID_SNAP_Y) : snapY(box.minY - GRID_SNAP_Y)
          y = avoidY(x, base, node.id, -1)
        }
      } else if (isFollower && isPreceder) {
        // 그룹 관통 노드: 선행(부모)과 후행(자식) 모두 그룹 안에 있음.
        // follower 방향(오른쪽/아래)으로 밀어내기 — 그룹 다음 위치에 배치.
        const parentNode = parentIds.length > 0 ? nodeList.find((n) => n.id === parentIds[0]) : null
        if (isLR) {
          const base = parentNode ? snapX(parentNode.position.x + GRID_SNAP_X) : snapX(box.maxX + GRID_SNAP_X)
          x = avoidX(base, y, node.id, 1)
        } else {
          const base = parentNode ? snapY(parentNode.position.y + GRID_SNAP_Y) : snapY(box.maxY + GRID_SNAP_Y)
          y = avoidY(x, base, node.id, 1)
        }
      } else {
        // 연결 없는 노드 → 좌표 기반 fallback (가장 짧은 탈출 방향)
        if (overlapX <= overlapY) {
          const goRight = (x + NODE_WIDTH / 2) >= (box.minX + box.maxX) / 2
          const base = goRight ? snapX(box.maxX + GRID_SNAP_X) : snapX(box.minX - GRID_SNAP_X)
          x = avoidX(base, y, node.id, goRight ? 1 : -1)
        } else {
          const goDown = (y + NODE_HEIGHT / 2) >= (box.minY + box.maxY) / 2
          const base = goDown ? snapY(box.maxY + GRID_SNAP_Y) : snapY(box.minY - GRID_SNAP_Y)
          y = avoidY(x, base, node.id, goDown ? 1 : -1)
        }
      }
      anyChange = true
    }
    if (x === node.position.x && y === node.position.y) return node
    return { ...node, position: { x, y } }
  })
  return anyChange ? updated : nodeList
}

export default function GraphView() {
  const navigate = useNavigate()
  const { experiments, isReady, getExperiment, updateExperiment, createExperiment, deleteExperiment } = useExperiments()
  const { groups, addGroup, updateGroup } = useGraphGroups()

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [layoutDir, setLayoutDir] = useState('LR')
  const [selectedExp, setSelectedExp]   = useState(null)
  const [contextMenu, setContextMenu]   = useState(null)
  const [outcomePopup, setOutcomePopup] = useState(null)
  const [toast, setToast]               = useState(null)  // { message, type }

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // ── 노드 추가 모드 ──────────────────────────────────────────
  const [isAddNodeMode, setIsAddNodeMode] = useState(false)

  useEffect(() => {
    if (!isAddNodeMode) return
    function onKeyDown(e) {
      if (e.key === 'Escape') setIsAddNodeMode(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isAddNodeMode])

  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [deleteConfirmPopup, setDeleteConfirmPopup] = useState(null) // { nodes: rfNode[] }

  useEffect(() => {
    if (!isDeleteMode) return
    function onKeyDown(e) {
      if (e.key === 'Escape') { setIsDeleteMode(false); setDeleteConfirmPopup(null) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isDeleteMode])

  // ── 드래그 그룹 선택 상태 ────────────────────────────────────
  const [isSelectMode, setIsSelectMode]         = useState(false)
  const [selectedForGroup, setSelectedForGroup] = useState([])
  const [groupCreatePopup, setGroupCreatePopup] = useState(false)
  const [groupCreateName, setGroupCreateName]   = useState('')
  const [groupCreateColor, setGroupCreateColor] = useState(GROUP_COLORS[0].value)
  const [groupCreateTarget, setGroupCreateTarget] = useState('new') // 'new' | groupId
  const latestSelectionRef = useRef([])

  const fullDataRef        = useRef({})
  const layoutDirRef       = useRef('LR')
  const rfInstanceRef      = useRef(null)
  const groupsRef          = useRef(groups)
  const migrationDoneRef   = useRef(false)
  const experimentsLoadedRef = useRef(false)
  const isLayoutingRef     = useRef(false)
  const isCreatingNodeRef  = useRef(false)
  const onDeleteRef        = useRef(null)

  useEffect(() => { groupsRef.current = groups }, [groups])
  useEffect(() => { layoutDirRef.current = layoutDir }, [layoutDir])

  // ── 그룹 노드 ID 맵 (GroupOverlay에 전달) ─────────────────────
  const groupNodeIdsMap = useMemo(() => {
    const fullList = Object.values(fullDataRef.current)
    return new Map(groups.map((g) => [g.id, resolveGroupNodeIds(g, fullList)]))
  }, [groups, nodes])

  // ── 그룹 핀 정보 부여 ─────────────────────────────────────────
  function annotateGroupMarkers(nodeList) {
    const startIds = new Set(groups.flatMap((g) => g.startNodeIds ?? (g.startNodeId ? [g.startNodeId] : [])))
    const fullList = Object.values(fullDataRef.current)
    const endIds   = new Set()
    for (const group of groups) {
      const groupNodeIds = resolveGroupNodeIds(group, fullList)
      for (const id of group.endNodeIds ?? []) {
        if (isEndNode(id, group, groupNodeIds)) endIds.add(id)
      }
    }
    return nodeList.map((n) => ({
      ...n,
      data: {
        ...n.data,
        isGroupStart: startIds.has(n.id),
        isGroupEnd:   endIds.has(n.id),
        onDelete: (id) => onDeleteRef.current?.(id),
      },
    }))
  }

  // ── 레이아웃 계산 ─────────────────────────────────────────────
  const rebuildLayout = useCallback((fullDataMap, dir) => {
    const fullList = Object.values(fullDataMap)
    if (fullList.length === 0) return
    const rawNodes = experimentsToNodes(fullList).map((n) => ({
      ...n,
      data: { ...n.data, layoutDirection: dir },
    }))
    const rawEdges = experimentsToEdges(fullList)
    // groupsRef.current 대신 클로저의 groups 사용: useCallback([groups])이므로
    // 항상 최신 그룹 상태를 반영. ref는 useEffect 후 갱신되므로 stale할 수 있음.
    const groupNodeSets = groups.map((g) => resolveGroupNodeIds(g, fullList))
    isLayoutingRef.current = true
    const laidOut    = applyDagreLayout(rawNodes, rawEdges, dir, groupNodeSets)
    const pushedOut  = applyPushOut(laidOut, groups, fullDataMap, dir === 'LR')

    setNodes(annotateGroupMarkers(pushedOut))
    setEdges(rawEdges)
    isLayoutingRef.current = false
  }, [groups])

  // groups 변경 시 기존 노드에 핀 정보 재주입
  useEffect(() => {
    setNodes((prev) => annotateGroupMarkers(prev))
  }, [groups])

  // ── 전체 실험 데이터 로드 ─────────────────────────────────────
  useEffect(() => {
    if (!isReady || experiments.length === 0) return
    // 노드 직접 추가 직후 experiments 변경 → rebuildLayout 건너뜀
    if (isCreatingNodeRef.current) {
      isCreatingNodeRef.current = false
      return
    }
    Promise.all(experiments.map((e) => getExperiment(e.id).then((full) => full ?? e)))
      .then((fullList) => {
        const map = Object.fromEntries(fullList.map((e) => [e.id, e]))
        // followingExperiments 역산
        for (const exp of fullList) {
          for (const precId of exp.connections?.precedingExperiments ?? []) {
            const src = map[precId]
            if (!src) continue
            const prev = src.connections?.followingExperiments ?? []
            if (!prev.includes(exp.id)) {
              map[precId] = {
                ...src,
                connections: {
                  ...(src.connections ?? {}),
                  followingExperiments: [...prev, exp.id],
                },
              }
            }
          }
        }
        fullDataRef.current = map
        // 구형 데이터 마이그레이션 (1회):
        // 1단계: endNodeIds → blockedEdges/terminalNodeIds (migrateGroupEndNodes)
        // 2단계: startNodeIds 선행 → openEdges, 나머지 필드 보정 (migrateGroupData)
        if (!migrationDoneRef.current) {
          migrationDoneRef.current = true
          const fullList = Object.values(map)
          const stage1 = migrateGroupEndNodes(groupsRef.current, fullList)
          stage1.forEach((g, i) => {
            if (g !== groupsRef.current[i]) updateGroup(g.id, g)
          })
          for (const group of stage1) {
            const migrated = migrateGroupData(group, map)
            if (migrated) updateGroup(group.id, migrated)
          }
        }
        experimentsLoadedRef.current = true
        rebuildLayout(map, layoutDirRef.current)
      })
      .catch(console.error)
  }, [isReady, experiments, getExperiment, rebuildLayout])

  // ── 레이아웃 조작 ─────────────────────────────────────────────
  function handleRelayout() { rebuildLayout(fullDataRef.current, layoutDirRef.current) }

  function toggleDirection() {
    const next = layoutDir === 'TB' ? 'LR' : 'TB'
    setLayoutDir(next)
    rebuildLayout(fullDataRef.current, next)
  }

  // ── setCenter / getZoom 래퍼 ──────────────────────────────────
  const rfSetCenter = useCallback((x, y, opts) => {
    rfInstanceRef.current?.setCenter(x, y, opts)
  }, [])

  const rfGetZoom = useCallback(() => {
    return rfInstanceRef.current?.getZoom() ?? 1
  }, [])

  // ── 그룹 드래그 이동 + 밀어내기 ─────────────────────────────
  const onNodeDragStop = useCallback((event, draggedNode) => {
    if (event.shiftKey) return

    const fullList    = Object.values(fullDataRef.current)
    const affectedGroups = groups.filter((g) => {
      const ids = resolveGroupNodeIds(g, fullList)
      return ids.has(draggedNode.id)
    })

    setNodes((prev) => {
      let result = prev

      // 그룹 드래그: 같은 그룹 내 다른 노드 함께 이동
      if (affectedGroups.length > 0) {
        const prevNode = prev.find((n) => n.id === draggedNode.id)
        if (prevNode) {
          const dx = draggedNode.position.x - prevNode.position.x
          const dy = draggedNode.position.y - prevNode.position.y
          if (dx !== 0 || dy !== 0) {
            const moveIds = new Set()
            affectedGroups.forEach((g) => {
              resolveGroupNodeIds(g, fullList).forEach((id) => moveIds.add(id))
            })
            moveIds.delete(draggedNode.id)
            result = prev.map((n) => {
              if (!moveIds.has(n.id)) return n
              return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
            })
          }
        }
      }

      // 밀어내기: 그룹과 겹치는 비포함 노드 이동
      return applyPushOut(result, groups, fullDataRef.current, layoutDirRef.current === 'LR')
    })
  }, [groups])

  // ── 드래그 박스 선택 ──────────────────────────────────────────
  const onSelectionChange = useCallback(({ nodes: selNodes }) => {
    if (isSelectMode || isDeleteMode) latestSelectionRef.current = selNodes
  }, [isSelectMode, isDeleteMode])

  function handleContainerMouseUp() {
    if (groupCreatePopup) return
    const sel = latestSelectionRef.current
    if (isSelectMode && sel.length > 0) {
      setSelectedForGroup(sel)
      setGroupCreatePopup(true)
    } else if (isDeleteMode && sel.length > 0) {
      setDeleteConfirmPopup({ nodes: sel })
      latestSelectionRef.current = []
    }
  }

  function handleGroupCreate() {
    const selectedIds = new Set(selectedForGroup.map((n) => n.id))

    const roots = selectedForGroup.filter((n) => {
      const exp = fullDataRef.current[n.id]
      return (exp?.connections?.precedingExperiments ?? []).every((id) => !selectedIds.has(id))
    })

    const startNodeIds = roots.length > 0 ? roots.map((n) => n.id) : [selectedForGroup[0].id]

    const blockedEdges = []
    for (const node of selectedForGroup) {
      const exp = fullDataRef.current[node.id]
      for (const followerId of exp?.connections?.followingExperiments ?? []) {
        if (!selectedIds.has(followerId)) {
          blockedEdges.push({ from: node.id, to: followerId })
        }
      }
    }

    const terminalNodeIds = selectedForGroup
      .filter((n) => (fullDataRef.current[n.id]?.connections?.followingExperiments ?? []).length === 0)
      .map((n) => n.id)

    // openEdges: 각 시작 노드의 선행 중 선택 범위 밖에 있는 노드 → 엣지 등록
    const openEdges = []
    for (const startId of startNodeIds) {
      const exp = fullDataRef.current[startId]
      for (const precId of exp?.connections?.precedingExperiments ?? []) {
        if (!selectedIds.has(precId)) openEdges.push({ from: precId, to: startId })
      }
    }

    // endNodeIds: blockedEdges.from + terminalNodeIds
    const endNodeIds = [...new Set([...blockedEdges.map((e) => e.from), ...terminalNodeIds])]

    if (groupCreateTarget === 'new') {
      if (!groupCreateName.trim()) return
      addGroup({
        id: generateGroupId(groups),
        name: groupCreateName.trim(),
        color: groupCreateColor,
        startNodeIds,
        endNodeIds,
        openEdges,
        blockedEdges,
        terminalNodeIds,
      })
    } else {
      updateGroup(groupCreateTarget, { startNodeIds, endNodeIds, openEdges, blockedEdges, terminalNodeIds })
    }

    setGroupCreatePopup(false)
    setSelectedForGroup([])
    setGroupCreateName('')
    setGroupCreateTarget('new')
    setIsSelectMode(false)
    latestSelectionRef.current = []
  }

  // ── 새 실험 노트 생성 ─────────────────────────────────────────
  function generateExpId(expList) {
    const now = new Date()
    const prefix = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const nums = expList.map((e) => { const m = e.id.match(/^(?:exp_)?(\d{6})[_-](\d{3})$/); return m?.[1] === prefix ? parseInt(m[2], 10) : 0 }).filter(Boolean)
    return `${prefix}-${String(nums.length > 0 ? Math.max(...nums) + 1 : 1).padStart(3, '0')}`
  }

  // position: { x, y } flow 좌표, precedingId: 선행 실험 id or null
  const handleCreateAtPosition = useCallback(async (position, precedingId) => {
    setIsAddNodeMode(false)
    try {
      const base = '새 실험 노트'
      const titles = new Set(experiments.map((e) => e.title))
      let title = base
      if (titles.has(base)) { let n = 2; while (titles.has(`${base} (${n})`)) n++; title = `${base} (${n})` }
      const newExp = {
        id: generateExpId(experiments),
        projectId: null,
        title,
        createdAt: new Date().toISOString(),
        dataReceivedAt: null,
        status: 'in_progress',
        outcome: 'unknown',
        goal: '',
        tags: [],
        procedure: { common: null, conditionTable: {}, observations: {} },
        dataBlocks: [],
        conclusion: null,
        connections: {
          precedingExperiments: precedingId ? [precedingId] : [],
          followingExperiments: [],
          references: [],
        },
      }
      isCreatingNodeRef.current = true
      const saved = await createExperiment(newExp)

      // fullDataRef에 즉시 등록
      fullDataRef.current[saved.id] = saved

      // 선행 실험 followingExperiments 업데이트
      if (precedingId) {
        const precFull = fullDataRef.current[precedingId] ?? await getExperiment(precedingId)
        if (precFull) {
          const prevFollowing = precFull.connections?.followingExperiments ?? []
          if (!prevFollowing.includes(saved.id)) {
            const updatedPrec = {
              ...precFull,
              connections: {
                ...(precFull.connections ?? {}),
                followingExperiments: [...prevFollowing, saved.id],
              },
            }
            fullDataRef.current[precedingId] = updatedPrec
            await updateExperiment(updatedPrec)
          }
        }
      }

      // 그래프에 즉시 노드 추가
      const newRfNode = experimentsToNodes([saved]).map((n) => ({
        ...n,
        position,
        data: { ...n.data, layoutDirection: layoutDirRef.current },
      }))[0]
      setNodes((prev) => annotateGroupMarkers([...prev, newRfNode]))

      // 선행 엣지 추가
      if (precedingId) {
        setEdges((prev) => [...prev, {
          id: `${precedingId}-${saved.id}`,
          source: precedingId,
          target: saved.id,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
        }])
      }
    } catch (err) {
      isCreatingNodeRef.current = false
      console.error('새 실험 노트 생성 실패:', err)
      setToast({ message: err?.message ?? '새 실험 노트 생성에 실패했습니다.', type: 'error' })
    }
  }, [experiments, createExperiment, getExperiment, updateExperiment])

  // ── ReactFlow 이벤트 ──────────────────────────────────────────
  const onNodeClick = useCallback((_, node) => {
    if (isAddNodeMode) {
      const pos = layoutDir === 'LR'
        ? { x: node.position.x + NODE_WIDTH + 80, y: node.position.y }
        : { x: node.position.x, y: node.position.y + NODE_HEIGHT + 80 }
      handleCreateAtPosition(pos, node.id)
      return
    }
    if (!isSelectMode) {
      setSelectedExp(node.data.experiment)
      setContextMenu(null)
    }
  }, [isSelectMode, isAddNodeMode, layoutDir, handleCreateAtPosition])

  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, experiment: node.data.experiment })
  }, [])

  const onPaneClick = useCallback((event) => {
    setContextMenu(null)
    if (isAddNodeMode) {
      const pos = rfInstanceRef.current?.screenToFlowPosition({
        x: event.clientX, y: event.clientY,
      }) ?? { x: 0, y: 0 }
      handleCreateAtPosition(pos, null)
      return
    }
    if (isSelectMode) latestSelectionRef.current = []
  }, [isSelectMode, isAddNodeMode, handleCreateAtPosition])

  const onConnect = useCallback(async (params) => {
    const { source: precedingId, target: currentId } = params
    try {
      const currentFull = fullDataRef.current[currentId] ?? await getExperiment(currentId)
      if (!currentFull) return
      const prevPreceding = currentFull.connections?.precedingExperiments ?? []
      if (prevPreceding.includes(precedingId)) return

      const updated = {
        ...currentFull,
        connections: {
          ...(currentFull.connections ?? {}),
          precedingExperiments: [...prevPreceding, precedingId],
        },
      }
      fullDataRef.current[currentId] = updated
      await updateExperiment(updated)

      const sourceFull = fullDataRef.current[precedingId]
      if (sourceFull) {
        const prevFollowing = sourceFull.connections?.followingExperiments ?? []
        if (!prevFollowing.includes(currentId)) {
          fullDataRef.current[precedingId] = {
            ...sourceFull,
            connections: {
              ...(sourceFull.connections ?? {}),
              followingExperiments: [...prevFollowing, currentId],
            },
          }
        }
      }

      setEdges((eds) => addEdge(
        { ...params, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
        eds,
      ))
    } catch (err) {
      console.error('Connect failed:', err)
    }
  }, [getExperiment, updateExperiment])

  // ── 그룹 외부 노드 밀어내기 (제외 직후 호출용) ──────────────
  function pushNodesOutOfGroups(currentGroups, currentExperiments) {
    if (isLayoutingRef.current) return
    if (currentGroups.length === 0) return

    const isLR   = layoutDirRef.current === 'LR'
    const PADDING = 24
    const expMap  = Object.fromEntries(currentExperiments.map((e) => [e.id, e]))

    setNodes((currentNodes) => {
      if (currentNodes.length === 0) return currentNodes

      const groupBoundsArr = currentGroups.flatMap((group) => {
        const groupNodeIds = resolveGroupNodeIds(group, currentExperiments)
        const groupNodes   = currentNodes.filter(
          (n) => groupNodeIds.has(n.id) && n.type !== 'groupBackground'
        )
        if (groupNodes.length === 0) return []
        return [{
          groupNodeIds,
          minX: Math.min(...groupNodes.map((n) => n.position.x)) - PADDING,
          minY: Math.min(...groupNodes.map((n) => n.position.y)) - PADDING,
          maxX: Math.max(...groupNodes.map((n) => n.position.x + NODE_WIDTH)) + PADDING,
          maxY: Math.max(...groupNodes.map((n) => n.position.y + NODE_HEIGHT)) + PADDING,
        }]
      })
      if (groupBoundsArr.length === 0) return currentNodes

      let hasChange = false
      const updatedNodes = currentNodes.map((node) => {
        if (node.type === 'groupBackground') return node

        let { x, y } = node.position

        for (const { groupNodeIds, minX, minY, maxX, maxY } of groupBoundsArr) {
          if (groupNodeIds.has(node.id)) continue

          const overlaps = x < maxX && x + NODE_WIDTH > minX &&
                           y < maxY && y + NODE_HEIGHT > minY
          if (!overlaps) continue

          const preceding = expMap[node.id]?.connections?.precedingExperiments ?? []
          const following = expMap[node.id]?.connections?.followingExperiments ?? []

          const parentInGroup = preceding.find((id) => groupNodeIds.has(id))
          const childInGroup  = following.find((id) => groupNodeIds.has(id))

          if (parentInGroup) {
            const parentNode = currentNodes.find((n) => n.id === parentInGroup)
            const parentFollowersInGroup = (expMap[parentInGroup]?.connections?.followingExperiments ?? [])
              .filter((id) => groupNodeIds.has(id))

            if (parentFollowersInGroup.length >= 2) {
              // 분기 케이스: 형제 x 평균, 그룹 아래로
              const siblingNodes = parentFollowersInGroup
                .map((id) => currentNodes.find((n) => n.id === id)).filter(Boolean)
              if (isLR) {
                x = siblingNodes.length > 0
                  ? siblingNodes.reduce((s, n) => s + n.position.x, 0) / siblingNodes.length
                  : (parentNode ? parentNode.position.x + NODE_WIDTH + GRID_SNAP_X : maxX + GRID_SNAP_X)
                y = maxY + GRID_SNAP_Y
              } else {
                y = siblingNodes.length > 0
                  ? siblingNodes.reduce((s, n) => s + n.position.y, 0) / siblingNodes.length
                  : (parentNode ? parentNode.position.y + NODE_HEIGHT + GRID_SNAP_Y : maxY + GRID_SNAP_Y)
                x = maxX + GRID_SNAP_X
              }
            } else {
              // 단순 후행 노드
              if (isLR) {
                x = parentNode ? parentNode.position.x + NODE_WIDTH + GRID_SNAP_X : maxX + GRID_SNAP_X
                y = parentNode ? parentNode.position.y : y
              } else {
                y = parentNode ? parentNode.position.y + NODE_HEIGHT + GRID_SNAP_Y : maxY + GRID_SNAP_Y
                x = parentNode ? parentNode.position.x : x
              }
            }
          } else if (childInGroup) {
            const childNode = currentNodes.find((n) => n.id === childInGroup)
            if (isLR) {
              x = childNode ? childNode.position.x - NODE_WIDTH - GRID_SNAP_X : minX - NODE_WIDTH - GRID_SNAP_X
              y = childNode ? childNode.position.y : y
            } else {
              y = childNode ? childNode.position.y - NODE_HEIGHT - GRID_SNAP_Y : minY - NODE_HEIGHT - GRID_SNAP_Y
              x = childNode ? childNode.position.x : x
            }
          } else {
            // 둘 다 해당하거나 둘 다 없음: 겹침 최소 축으로 이동
            const overlapX = Math.min(x + NODE_WIDTH, maxX) - Math.max(x, minX)
            const overlapY = Math.min(y + NODE_HEIGHT, maxY) - Math.max(y, minY)
            if (overlapX <= overlapY) {
              const goRight = (x + NODE_WIDTH / 2) >= (minX + maxX) / 2
              x = goRight ? maxX : minX - NODE_WIDTH
            } else {
              const goDown = (y + NODE_HEIGHT / 2) >= (minY + maxY) / 2
              y = goDown ? maxY : minY - NODE_HEIGHT
            }
          }

          hasChange = true
        }

        if (x === node.position.x && y === node.position.y) return node
        return { ...node, position: { x, y } }
      })

      return hasChange ? updatedNodes : currentNodes
    })
  }

  // ── 그룹에서 노드 제외 ────────────────────────────────────────
  function handleExcludeFromGroup(experimentId, groupId) {
    const group = groups.find((g) => g.id === groupId)
    if (!group) return

    const fullList       = Object.values(fullDataRef.current)
    const currentNodeIds = resolveGroupNodeIds(group, fullList)
    const startNodeIds   = group.startNodeIds ?? (group.startNodeId ? [group.startNodeId] : [])
    const expX           = fullDataRef.current[experimentId]
    const followers      = expX?.connections?.followingExperiments ?? []

    // ── Case 1: X는 시작 노드 ──────────────────────────────────
    if (startNodeIds.includes(experimentId)) {
      let newBlockedEdges    = [...(group.blockedEdges    ?? [])]
      let newTerminalNodeIds = [...(group.terminalNodeIds ?? [])]

      // X의 followingExperiments → blockedEdges 추가
      for (const followId of followers) {
        if (!newBlockedEdges.some((e) => e.from === experimentId && e.to === followId)) {
          newBlockedEdges.push({ from: experimentId, to: followId })
        }
      }
      // followingExperiments 없으면 terminalNodeIds에 X 추가
      if (followers.length === 0 && !newTerminalNodeIds.includes(experimentId)) {
        newTerminalNodeIds.push(experimentId)
      }

      // 후속 노드 승격: startNodeIds에서 X 제거, X의 in-group followers 추가
      const inGroupFollowers = followers.filter((id) => currentNodeIds.has(id))
      const newStartNodeIds = [
        ...startNodeIds.filter((id) => id !== experimentId),
        ...inGroupFollowers.filter((id) => !startNodeIds.includes(id)),
      ]

      // openEdges에서 to===X 제거
      const newOpenEdges = (group.openEdges ?? []).filter((e) => e.to !== experimentId)

      // endNodeIds에서 X 제거, blockedEdges에서 from===X 제거
      newBlockedEdges = newBlockedEdges.filter((e) => e.from !== experimentId)
      const newEndNodeIds = (group.endNodeIds ?? []).filter((id) => id !== experimentId)

      const patch = { startNodeIds: newStartNodeIds, openEdges: newOpenEdges, blockedEdges: newBlockedEdges, terminalNodeIds: newTerminalNodeIds, endNodeIds: newEndNodeIds }
      updateGroup(groupId, patch)
      pushNodesOutOfGroups(
        groups.map((g) => g.id === groupId ? { ...group, ...patch } : g),
        fullList,
      )
      return
    }

    // ── Case 2: X는 시작 노드 아님 ─────────────────────────────
    const groupParents = (expX?.connections?.precedingExperiments ?? [])
      .filter((id) => currentNodeIds.has(id))
    if (groupParents.length === 0) return

    const expMap = Object.fromEntries(fullList.map((e) => [e.id, e]))

    // X에서 BFS: X 이후 도달 가능 노드 세트 (X 포함)
    const xReachable = new Set()
    const xQueue = [experimentId]
    while (xQueue.length > 0) {
      const cur = xQueue.shift()
      if (xReachable.has(cur)) continue
      xReachable.add(cur)
      for (const nid of expMap[cur]?.connections?.followingExperiments ?? []) {
        if (!xReachable.has(nid)) xQueue.push(nid)
      }
    }

    // P = 첫 번째 그룹 내 부모
    const parentId = groupParents[0]
    const expP = expMap[parentId]
    const pInGroupFollowers = (expP?.connections?.followingExperiments ?? [])
      .filter((id) => currentNodeIds.has(id))

    let newBlockedEdges    = [...(group.blockedEdges    ?? [])]
    let newTerminalNodeIds = [...(group.terminalNodeIds ?? [])]
    let newEndNodeIds      = (group.endNodeIds ?? []).filter((id) => id !== experimentId)

    if (pInGroupFollowers.length >= 2) {
      // 분기 후 첫 노드: P → X 차단, 새 끝점 없음
      for (const pid of groupParents) {
        if (!newBlockedEdges.some((e) => e.from === pid && e.to === experimentId)) {
          newBlockedEdges.push({ from: pid, to: experimentId })
        }
      }
      // X 이후 도달 가능 노드의 blockedEdges.from / terminalNodeIds 제거
      newBlockedEdges    = newBlockedEdges.filter((e) => !xReachable.has(e.from))
      newTerminalNodeIds = newTerminalNodeIds.filter((id) => !xReachable.has(id))
    } else {
      // 단일 경로 중간 노드: P를 새 끝점으로 자동 지정
      const pFollowers = expP?.connections?.followingExperiments ?? []
      for (const followId of pFollowers) {
        if (!newBlockedEdges.some((e) => e.from === parentId && e.to === followId)) {
          newBlockedEdges.push({ from: parentId, to: followId })
        }
      }
      if (pFollowers.length === 0 && !newTerminalNodeIds.includes(parentId)) {
        newTerminalNodeIds.push(parentId)
      }
      if (!newEndNodeIds.includes(parentId)) newEndNodeIds = [...newEndNodeIds, parentId]

      // X 이후 도달 가능 노드의 blockedEdges.from / terminalNodeIds 제거
      newBlockedEdges    = newBlockedEdges.filter((e) => !xReachable.has(e.from))
      newTerminalNodeIds = newTerminalNodeIds.filter((id) => !xReachable.has(id))
    }

    const patch = { blockedEdges: newBlockedEdges, terminalNodeIds: newTerminalNodeIds, endNodeIds: newEndNodeIds }
    updateGroup(groupId, patch)
    pushNodesOutOfGroups(
      groups.map((g) => g.id === groupId ? { ...group, ...patch } : g),
      fullList,
    )
  }

  // ── 실험 노트 삭제 ─────────────────────────────────────────────
  async function doDeleteExperiment(experimentId) {
    const exp = fullDataRef.current[experimentId]
    // 선행 실험의 followingExperiments에서 제거
    for (const precId of exp?.connections?.precedingExperiments ?? []) {
      const precFull = fullDataRef.current[precId]
      if (!precFull) continue
      const updated = {
        ...precFull,
        connections: {
          ...(precFull.connections ?? {}),
          followingExperiments: (precFull.connections?.followingExperiments ?? []).filter((id) => id !== experimentId),
        },
      }
      fullDataRef.current[precId] = updated
      await updateExperiment(updated)
    }
    // 후속 실험의 precedingExperiments에서 제거
    for (const followId of exp?.connections?.followingExperiments ?? []) {
      const followFull = fullDataRef.current[followId]
      if (!followFull) continue
      const updated = {
        ...followFull,
        connections: {
          ...(followFull.connections ?? {}),
          precedingExperiments: (followFull.connections?.precedingExperiments ?? []).filter((id) => id !== experimentId),
        },
      }
      fullDataRef.current[followId] = updated
      await updateExperiment(updated)
    }
    // 그룹에서 제거
    for (const group of groupsRef.current) {
      const inStart    = (group.startNodeIds    ?? []).includes(experimentId)
      const inBlocked  = (group.blockedEdges    ?? []).some((e) => e.from === experimentId || e.to === experimentId)
      const inTerminal = (group.terminalNodeIds ?? []).includes(experimentId)
      if (inStart || inBlocked || inTerminal) {
        updateGroup(group.id, {
          startNodeIds:    (group.startNodeIds    ?? []).filter((id) => id !== experimentId),
          blockedEdges:    (group.blockedEdges    ?? []).filter((e) => e.from !== experimentId && e.to !== experimentId),
          terminalNodeIds: (group.terminalNodeIds ?? []).filter((id) => id !== experimentId),
        })
      }
    }
    delete fullDataRef.current[experimentId]
    await deleteExperiment(experimentId)
  }

  async function handleDeleteNode(experimentId) {
    const confirmed = window.confirm('이 실험 노트를 삭제하시겠습니까? 복구할 수 없습니다.')
    if (!confirmed) return
    try {
      await doDeleteExperiment(experimentId)
      setNodes((prev) => prev.filter((n) => n.id !== experimentId))
      setEdges((prev) => prev.filter((e) => e.source !== experimentId && e.target !== experimentId))
      if (selectedExp?.id === experimentId) setSelectedExp(null)
    } catch (err) {
      console.error('삭제 실패:', err)
      setToast({ message: err?.message ?? '삭제에 실패했습니다.', type: 'error' })
    }
  }
  onDeleteRef.current = handleDeleteNode

  async function handleBulkDelete(experimentIds) {
    const idSet = new Set(experimentIds)
    try {
      for (const id of experimentIds) {
        await doDeleteExperiment(id)
      }
      setNodes((prev) => prev.filter((n) => !idSet.has(n.id)))
      setEdges((prev) => prev.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)))
      if (selectedExp && idSet.has(selectedExp.id)) setSelectedExp(null)
    } catch (err) {
      console.error('일괄 삭제 실패:', err)
      setToast({ message: err?.message ?? '삭제에 실패했습니다.', type: 'error' })
    }
  }

  // ── Outcome 선택 ──────────────────────────────────────────────
  async function handleOutcomeSelect(outcome) {
    const exp = outcomePopup?.experiment
    if (!exp) return
    const full = fullDataRef.current[exp.id] ?? await getExperiment(exp.id)
    if (!full) return

    const updated = { ...full, status: 'completed', outcome }
    fullDataRef.current[exp.id] = updated
    await updateExperiment(updated)

    const newStyle = getNodeStyle(updated)
    setNodes((nds) => nds.map((n) =>
      n.id === exp.id
        ? { ...n, data: { ...n.data, experiment: updated, style: newStyle, statusLabel: newStyle.statusLabel } }
        : n
    ))
    if (selectedExp?.id === exp.id) setSelectedExp(updated)
    setOutcomePopup(null)
  }

  // ── Status 변경 ────────────────────────────────────────────────
  async function handleStatusChange(experimentId, newStatus, outcome) {
    const full = fullDataRef.current[experimentId] ?? await getExperiment(experimentId)
    if (!full) return
    const updated = { ...full, status: newStatus }
    if (newStatus !== 'completed') updated.outcome = 'unknown'
    if (outcome !== undefined) updated.outcome = outcome
    fullDataRef.current[experimentId] = updated
    await updateExperiment(updated)

    const newStyle = getNodeStyle(updated)
    setNodes((nds) => nds.map((n) =>
      n.id === experimentId
        ? { ...n, data: { ...n.data, experiment: updated, style: newStyle, statusLabel: newStyle.statusLabel } }
        : n
    ))
    if (selectedExp?.id === experimentId) setSelectedExp(updated)
  }


  // ── 렌더 ──────────────────────────────────────────────────────
  return (
    <div className="w-full h-full relative" onMouseUp={handleContainerMouseUp} style={isAddNodeMode ? { cursor: 'crosshair' } : undefined}>

      {/* ReactFlowProvider로 GroupOverlay와 ReactFlow의 store 공유 */}
      <ReactFlowProvider>
        {/* GroupOverlay: ReactFlow보다 DOM에서 먼저 → 노드 아래 렌더 */}
        <GroupOverlay groups={groups} groupNodeIdsMap={groupNodeIdsMap} />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodeContextMenu={onNodeContextMenu}
          onConnect={onConnect}
          onPaneClick={onPaneClick}
          onNodeDragStop={onNodeDragStop}
          onSelectionChange={onSelectionChange}
          onInit={(instance) => { rfInstanceRef.current = instance }}
          selectionOnDrag={isSelectMode || isDeleteMode}
          panOnDrag={!isSelectMode && !isDeleteMode}
          fitView
          connectOnClick={false}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </ReactFlowProvider>

      {/* 그룹 목록 패널 */}
      <GroupListPanel
        experiments={experiments}
        allNodes={nodes}
        setCenter={rfSetCenter}
        getZoom={rfGetZoom}
        getFullExperiments={() => Object.values(fullDataRef.current)}
      />

      {/* 툴바 */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 pointer-events-auto">
        <span className="text-xs text-gray-500 bg-white/90 px-2 py-1 rounded-lg shadow border border-gray-200">
          {experiments.length}개 실험
        </span>
        {isAddNodeMode ? (
          <span className="text-xs text-blue-600 bg-blue-50 border border-blue-300 px-2.5 py-1 rounded-lg shadow">
            빈 공간 또는 노드를 클릭하세요 (ESC 취소)
          </span>
        ) : (
          <button
            onClick={() => setIsAddNodeMode(true)}
            className="text-xs bg-blue-500 text-white hover:bg-blue-600 px-2.5 py-1 rounded-lg shadow transition-colors"
          >
            + 새 실험 노트
          </button>
        )}
        <button
          onClick={toggleDirection}
          className="text-xs bg-white/90 hover:bg-white border border-gray-200 px-2.5 py-1 rounded-lg shadow text-gray-600 transition-colors"
        >
          {layoutDir === 'LR' ? 'LR → TB' : 'TB → LR'}
        </button>
        <button
          onClick={handleRelayout}
          className="text-xs bg-white/90 hover:bg-white border border-gray-200 px-2.5 py-1 rounded-lg shadow text-gray-600 transition-colors"
        >
          레이아웃 재정렬
        </button>
        <button
          onClick={() => {
            const next = !isSelectMode
            setIsSelectMode(next)
            latestSelectionRef.current = []
            if (!next) {
              setGroupCreatePopup(false)
              setSelectedForGroup([])
              setGroupCreateName('')
            }
          }}
          className={`text-xs px-2.5 py-1 rounded-lg shadow border transition-colors ${
            isSelectMode
              ? 'bg-blue-500 text-white border-blue-400 hover:bg-blue-600'
              : 'bg-white/90 hover:bg-white border-gray-200 text-gray-600'
          }`}
        >
          {isSelectMode ? '선택 모드 ON' : '범위로 그룹 지정'}
        </button>
        <button
          onClick={() => {
            const next = !isDeleteMode
            setIsDeleteMode(next)
            latestSelectionRef.current = []
            if (!next) setDeleteConfirmPopup(null)
          }}
          className={`text-xs px-2.5 py-1 rounded-lg shadow border transition-colors ${
            isDeleteMode
              ? 'bg-red-500 text-white border-red-400 hover:bg-red-600'
              : 'bg-white/90 hover:bg-white border-gray-200 text-gray-600'
          }`}
        >
          {isDeleteMode ? '삭제 모드 ON' : '범위 삭제'}
        </button>
      </div>

      {/* 드래그 선택 그룹 생성 팝업 */}
      {groupCreatePopup && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <div
            className="bg-white rounded-xl shadow-xl border border-gray-200 p-4 space-y-3 w-64 pointer-events-auto"
            onMouseUp={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-gray-700">그룹 지정</div>
            <div className="text-xs text-gray-400">{selectedForGroup.length}개 노드 선택됨</div>

            <select
              value={groupCreateTarget}
              onChange={(e) => setGroupCreateTarget(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 bg-white"
            >
              <option value="new">새 그룹 생성</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>

            {groupCreateTarget === 'new' && (
              <>
                <input
                  autoFocus
                  value={groupCreateName}
                  onChange={(e) => setGroupCreateName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleGroupCreate() }}
                  placeholder="그룹명"
                  className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 outline-none focus:border-blue-400"
                />
                <div className="flex gap-1.5">
                  {GROUP_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setGroupCreateColor(c.value)}
                      style={{ backgroundColor: c.value }}
                      className={`w-5 h-5 rounded-full transition-transform ${groupCreateColor === c.value ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : ''}`}
                    />
                  ))}
                </div>
              </>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleGroupCreate}
                disabled={groupCreateTarget === 'new' && !groupCreateName.trim()}
                className="flex-1 text-sm bg-blue-500 text-white rounded px-3 py-1.5 hover:bg-blue-600 disabled:opacity-40"
              >
                확인
              </button>
              <button
                onClick={() => {
                  setGroupCreatePopup(false)
                  setSelectedForGroup([])
                  setGroupCreateName('')
                  setGroupCreateTarget('new')
                  setIsSelectMode(false)
                  latestSelectionRef.current = []
                }}
                className="text-sm text-gray-400 hover:text-gray-600 px-2"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 범위 삭제 확인 모달 */}
      {deleteConfirmPopup && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <div
            className="bg-white rounded-xl shadow-xl border border-gray-200 p-4 space-y-3 w-72 pointer-events-auto"
            onMouseUp={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-gray-700">실험 노트 삭제</div>
            <div className="text-xs text-gray-500">
              {deleteConfirmPopup.nodes.length}개의 실험 노트를 삭제하시겠습니까?
            </div>
            <div className="text-xs text-gray-400 max-h-32 overflow-y-auto space-y-0.5">
              {deleteConfirmPopup.nodes.map((n) => (
                <div key={n.id} className="truncate">• {n.data.experiment?.title ?? n.id}</div>
              ))}
            </div>
            <div className="text-xs text-red-500">삭제된 실험 노트는 복구할 수 없습니다.</div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={async () => {
                  const ids = deleteConfirmPopup.nodes.map((n) => n.id)
                  setDeleteConfirmPopup(null)
                  setIsDeleteMode(false)
                  await handleBulkDelete(ids)
                }}
                className="flex-1 text-sm bg-red-500 text-white rounded px-3 py-1.5 hover:bg-red-600"
              >
                삭제
              </button>
              <button
                onClick={() => { setDeleteConfirmPopup(null); setIsDeleteMode(false) }}
                className="text-sm text-gray-400 hover:text-gray-600 px-2"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 컨텍스트 메뉴 */}
      {contextMenu && (
        <GraphContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          experiment={contextMenu.experiment}
          experiments={Object.values(fullDataRef.current)}
          onOpen={() => navigate(`/experiments/${contextMenu.experiment.id}`)}
          onComplete={() => setOutcomePopup({ mode: 'complete', experiment: contextMenu.experiment })}
          onChangeOutcome={() => setOutcomePopup({ mode: 'change', experiment: contextMenu.experiment })}
          onExclude={handleExcludeFromGroup}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* 사이드패널 */}
      {selectedExp && (
        <GraphSidePanel
          experiment={fullDataRef.current[selectedExp.id] ?? selectedExp}
          allExperiments={experiments}
          onClose={() => setSelectedExp(null)}
          onNavigate={(id) => {
            const exp = fullDataRef.current[id] ?? experiments.find((e) => e.id === id)
            if (exp) setSelectedExp(exp)
          }}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* 에러 토스트 */}
      {toast && (
        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-sm text-white pointer-events-none ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.message}
        </div>
      )}

      {/* Outcome 팝업 */}
      {outcomePopup && (
        <OutcomePopup
          mode={outcomePopup.mode}
          currentOutcome={outcomePopup.experiment.outcome}
          onSelect={handleOutcomeSelect}
          onCancel={() => setOutcomePopup(null)}
        />
      )}
    </div>
  )
}

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
import { applyDagreLayout, NODE_WIDTH, NODE_HEIGHT, RANKSEP } from './dagreLayout'
import ExperimentNode from './ExperimentNode'
import OutcomePopup from './OutcomePopup'
import GraphContextMenu from './GraphContextMenu'
import GraphSidePanel from './GraphSidePanel'
import GroupListPanel from './GroupListPanel'
import GroupOverlay from './GroupOverlay'
import { useGraphGroups } from './GraphGroupProvider'
import {
  resolveGroupNodeIds, generateGroupId, GROUP_COLORS,
  getGroupEndpointNodeIds, migrateGroupEndNodes, isEndNode,
} from './graphGroups'

const nodeTypes = {
  experimentNode: ExperimentNode,
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
      for (const nodeId of groupNodeIds) {
        if (isEndNode(nodeId, group, groupNodeIds, fullList)) endIds.add(nodeId)
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
    const groupNodeSets = groupsRef.current.map((g) => resolveGroupNodeIds(g, fullList))
    isLayoutingRef.current = true
    const laidOut  = applyDagreLayout(rawNodes, rawEdges, dir, groupNodeSets)

    setNodes(annotateGroupMarkers(laidOut))
    setEdges(rawEdges)
    isLayoutingRef.current = false
  }, [groups])

  // groups 변경 시 기존 노드에 핀 정보 재주입
  useEffect(() => {
    setNodes((prev) => annotateGroupMarkers(prev))
  }, [groups])

  // ── 그룹 미포함 노드 자동 밀어내기 ───────────────────────────
  useEffect(() => {
    if (isLayoutingRef.current) return
    if (nodes.length === 0 || groups.length === 0) return
    const PADDING = 24, MARGIN = 16
    const isLR = layoutDir === 'LR'
    const fullList = Object.values(fullDataRef.current)
    const groupBoxes = groups.map((group) => {
      const ids = resolveGroupNodeIds(group, fullList)
      const groupNodes = nodes.filter((n) => ids.has(n.id))
      if (groupNodes.length === 0) return null
      return {
        ids,
        minX: Math.min(...groupNodes.map((n) => n.position.x)) - PADDING,
        minY: Math.min(...groupNodes.map((n) => n.position.y)) - PADDING,
        maxX: Math.max(...groupNodes.map((n) => n.position.x + NODE_WIDTH)) + PADDING,
        maxY: Math.max(...groupNodes.map((n) => n.position.y + NODE_HEIGHT)) + PADDING,
      }
    }).filter(Boolean)
    if (groupBoxes.length === 0) return

    let anyChange = false
    const updated = nodes.map((node) => {
      let { x, y } = node.position
      const exp = fullDataRef.current[node.id]
      const preceding  = new Set(exp?.connections?.precedingExperiments  ?? [])
      const following  = new Set(exp?.connections?.followingExperiments  ?? [])

      for (const box of groupBoxes) {
        if (box.ids.has(node.id)) continue
        const overlapX = Math.min(x + NODE_WIDTH, box.maxX) - Math.max(x, box.minX)
        const overlapY = Math.min(y + NODE_HEIGHT, box.maxY) - Math.max(y, box.minY)
        if (overlapX <= 0 || overlapY <= 0) continue

        const parentIds  = [...preceding].filter((id) => box.ids.has(id))
        const isFollower = parentIds.length > 0
        const isPreceder = [...following].some((id) => box.ids.has(id))

        if (isFollower && !isPreceder) {
          // N은 그룹의 후행 실험
          // P의 그룹 내 후행 실험 수로 분기 여부 판단
          const parentInGroupFollowers = parentIds.flatMap(
            (pid) => fullDataRef.current[pid]?.connections?.followingExperiments ?? []
          ).filter((id) => box.ids.has(id))

          if (parentInGroupFollowers.length >= 2) {
            // 분기점 제외 노드 → LR: 그룹 아래 + 형제 x평균, TB: 그룹 오른쪽 + 형제 y평균
            const parentNode = nodes.find((n) => n.id === parentIds[0])
            const siblingNodes = parentInGroupFollowers
              .map((sid) => nodes.find((n) => n.id === sid))
              .filter(Boolean)
            if (isLR) {
              y = box.maxY + MARGIN
              if (siblingNodes.length > 0) {
                x = siblingNodes.reduce((sum, n) => sum + n.position.x, 0) / siblingNodes.length
              } else if (parentNode) {
                x = parentNode.position.x + NODE_WIDTH + MARGIN
              }
            } else {
              x = box.maxX + MARGIN
              if (siblingNodes.length > 0) {
                y = siblingNodes.reduce((sum, n) => sum + n.position.y, 0) / siblingNodes.length
              } else if (parentNode) {
                y = parentNode.position.y + NODE_HEIGHT + MARGIN
              }
            }
          } else {
            // 단순 제외 → LR: 오른쪽, TB: 아래쪽
            if (isLR) {
              const parentNode = nodes.find((n) => n.id === parentIds[0])
              x = parentNode ? parentNode.position.x + NODE_WIDTH + RANKSEP : box.maxX + MARGIN
            } else {
              const parentNode = nodes.find((n) => n.id === parentIds[0])
              y = parentNode ? parentNode.position.y + NODE_HEIGHT + RANKSEP : box.maxY + MARGIN
            }
          }
        } else if (isPreceder && !isFollower) {
          // N은 그룹의 선행 실험 → LR: 왼쪽, TB: 위쪽
          const childInGroupId = [...following].find((id) => box.ids.has(id))
          const childNode = childInGroupId ? nodes.find((n) => n.id === childInGroupId) : null
          if (isLR) x = childNode ? childNode.position.x - NODE_WIDTH - RANKSEP : box.minX - NODE_WIDTH - MARGIN
          else      y = childNode ? childNode.position.y - NODE_HEIGHT - RANKSEP : box.minY - NODE_HEIGHT - MARGIN
        } else {
          // 연결 없거나 양방향 → 최소 이동 거리 fallback
          if (overlapX <= overlapY) {
            x = (x + NODE_WIDTH / 2) < (box.minX + box.maxX) / 2
              ? box.minX - NODE_WIDTH - MARGIN
              : box.maxX + MARGIN
          } else {
            y = (y + NODE_HEIGHT / 2) < (box.minY + box.maxY) / 2
              ? box.minY - NODE_HEIGHT - MARGIN
              : box.maxY + MARGIN
          }
        }
        anyChange = true
      }
      if (x === node.position.x && y === node.position.y) return node
      return { ...node, position: { x, y } }
    })
    if (anyChange) setNodes(updated)
  }, [nodes, groups])

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
        // 구형 endNodeIds → blockedEdges/terminalNodeIds 마이그레이션 (1회)
        if (!migrationDoneRef.current) {
          migrationDoneRef.current = true
          for (const group of groupsRef.current) {
            if (!group.endNodeIds?.length) continue
            const migrated = migrateGroupEndNodes(group, map)
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

  // ── 그룹 드래그 이동 ──────────────────────────────────────────
  const onNodeDragStop = useCallback((event, draggedNode) => {
    if (event.shiftKey) return

    const fullList = Object.values(fullDataRef.current)
    const affectedGroups = groups.filter((g) => {
      const ids = resolveGroupNodeIds(g, fullList)
      return ids.has(draggedNode.id)
    })
    if (affectedGroups.length === 0) return

    setNodes((prev) => {
      const prevNode = prev.find((n) => n.id === draggedNode.id)
      if (!prevNode) return prev

      const dx = draggedNode.position.x - prevNode.position.x
      const dy = draggedNode.position.y - prevNode.position.y
      if (dx === 0 && dy === 0) return prev

      const moveIds = new Set()
      affectedGroups.forEach((g) => {
        resolveGroupNodeIds(g, fullList).forEach((id) => moveIds.add(id))
      })
      moveIds.delete(draggedNode.id)

      return prev.map((n) => {
        if (!moveIds.has(n.id)) return n
        return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
      })
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

    if (groupCreateTarget === 'new') {
      if (!groupCreateName.trim()) return
      addGroup({
        id: generateGroupId(groups),
        name: groupCreateName.trim(),
        color: groupCreateColor,
        startNodeIds,
        blockedEdges,
        terminalNodeIds,
      })
    } else {
      updateGroup(groupCreateTarget, { startNodeIds, blockedEdges, terminalNodeIds })
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

  // ── 그룹에서 노드 제외 ────────────────────────────────────────
  function handleExcludeFromGroup(experimentId, groupId) {
    const group = groups.find((g) => g.id === groupId)
    if (!group) return

    const fullList       = Object.values(fullDataRef.current)
    const currentNodeIds = resolveGroupNodeIds(group, fullList)
    const startNodeIds   = group.startNodeIds ?? (group.startNodeId ? [group.startNodeId] : [])
    const expX           = fullDataRef.current[experimentId]
    const followers      = expX?.connections?.followingExperiments ?? []

    let blockedEdges    = [...(group.blockedEdges    ?? [])]
    let terminalNodeIds = [...(group.terminalNodeIds ?? [])]

    if (startNodeIds.includes(experimentId)) {
      // X의 그룹 내 후속 노드들을 새 시작점으로 승격
      const inGroupFollowers = followers.filter((id) => currentNodeIds.has(id))
      const newStartNodeIds = [
        ...startNodeIds.filter((id) => id !== experimentId),
        ...inGroupFollowers.filter((id) => !startNodeIds.includes(id)),
      ]
      const newBlockedEdges = blockedEdges.filter((e) => e.from !== experimentId)
      const newTerminalNodeIds = terminalNodeIds.filter((id) => id !== experimentId)
      updateGroup(groupId, {
        startNodeIds: newStartNodeIds,
        blockedEdges: newBlockedEdges,
        terminalNodeIds: newTerminalNodeIds,
      })
      return
    }

    const groupParents = (expX?.connections?.precedingExperiments ?? [])
      .filter((id) => currentNodeIds.has(id))
    if (groupParents.length === 0) return

    for (const parentId of groupParents) {
      if (!blockedEdges.some((e) => e.from === parentId && e.to === experimentId)) {
        blockedEdges.push({ from: parentId, to: experimentId })
      }
    }

    blockedEdges    = blockedEdges.filter((e) => e.from !== experimentId)
    terminalNodeIds = terminalNodeIds.filter((id) => id !== experimentId)

    updateGroup(groupId, { blockedEdges, terminalNodeIds })
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

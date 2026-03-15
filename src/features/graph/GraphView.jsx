import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactFlow, {
  Background, Controls,
  useNodesState, useEdgesState, addEdge,
  MarkerType,
} from 'reactflow'
import { useExperiments } from '../../store/experimentStore'
import { experimentsToNodes, experimentsToEdges, getNodeStyle } from './graphUtils'
import { applyDagreLayout } from './dagreLayout'
import ExperimentNode from './ExperimentNode'
import GroupBackgroundNode from './GroupBackgroundNode'
import OutcomePopup from './OutcomePopup'
import GraphContextMenu from './GraphContextMenu'
import GraphSidePanel from './GraphSidePanel'
import GroupListPanel from './GroupListPanel'
import { useGraphGroups } from './GraphGroupProvider'
import { resolveGroupNodeIds, getGroupBounds, generateGroupId, GROUP_COLORS } from './graphGroups'

const nodeTypes = {
  experimentNode:  ExperimentNode,
  groupBackground: GroupBackgroundNode,
}

export default function GraphView() {
  const navigate = useNavigate()
  const { experiments, isReady, getExperiment, updateExperiment } = useExperiments()
  const { groups, addGroup, updateGroup } = useGraphGroups()

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [layoutDir, setLayoutDir] = useState('LR')
  const [selectedExp, setSelectedExp]   = useState(null)
  const [contextMenu, setContextMenu]   = useState(null)
  const [outcomePopup, setOutcomePopup] = useState(null)

  // ── 드래그 그룹 선택 상태 ────────────────────────────────────
  const [isSelectMode, setIsSelectMode]         = useState(false)
  const [selectedForGroup, setSelectedForGroup] = useState([])
  const [groupCreatePopup, setGroupCreatePopup] = useState(false)
  const [groupCreateName, setGroupCreateName]   = useState('')
  const [groupCreateColor, setGroupCreateColor] = useState(GROUP_COLORS[0].value)
  const [groupCreateTarget, setGroupCreateTarget] = useState('new') // 'new' | groupId
  const latestSelectionRef = useRef([])

  const fullDataRef   = useRef({})
  const layoutDirRef  = useRef('LR')
  const rfInstanceRef = useRef(null)

  useEffect(() => { layoutDirRef.current = layoutDir }, [layoutDir])

  // ── 그룹 핀 정보 부여 ─────────────────────────────────────────
  function annotateGroupMarkers(nodeList) {
    const startIds = new Set(groups.flatMap((g) => g.startNodeIds ?? (g.startNodeId ? [g.startNodeId] : [])))
    const endIds   = new Set(groups.flatMap((g) => g.endNodeIds ?? []))
    return nodeList.map((n) => ({
      ...n,
      data: {
        ...n.data,
        isGroupStart: startIds.has(n.id),
        isGroupEnd:   endIds.has(n.id),
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
    const laidOut  = applyDagreLayout(rawNodes, rawEdges, dir)

    setNodes(annotateGroupMarkers(laidOut))
    setEdges(rawEdges)
  }, [groups])

  // groups 변경 시 기존 노드에 핀 정보 재주입
  useEffect(() => {
    setNodes((prev) => annotateGroupMarkers(
      prev.filter((n) => n.type !== 'groupBackground')
    ))
  }, [groups])

  // ── 전체 실험 데이터 로드 ─────────────────────────────────────
  useEffect(() => {
    if (!isReady || experiments.length === 0) return
    Promise.all(experiments.map((e) => getExperiment(e.id).then((full) => full ?? e)))
      .then((fullList) => {
        const map = Object.fromEntries(fullList.map((e) => [e.id, e]))
        // followingExperiments 역산: Drive에는 precedingExperiments만 저장되므로
        // 로드 후 precedingExperiments를 뒤집어 followingExperiments를 재구성
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
        rebuildLayout(map, layoutDirRef.current)
      })
      .catch(console.error)
  }, [isReady, experiments, getExperiment, rebuildLayout])

  // ── 배경 노드 계산 ────────────────────────────────────────────
  const expNodes = useMemo(
    () => nodes.filter((n) => n.type !== 'groupBackground'),
    [nodes]
  )

  const bgNodes = useMemo(() => {
    const fullList = Object.values(fullDataRef.current)
    return groups.map((group) => {
      const nodeIds = resolveGroupNodeIds(group, fullList)
      const bounds  = getGroupBounds(nodeIds, expNodes)
      if (!bounds) return null
      return {
        id:   `group-bg-${group.id}`,
        type: 'groupBackground',
        position: { x: bounds.x, y: bounds.y },
        style: { width: bounds.width, height: bounds.height, zIndex: -10 },
        data: { name: group.name, color: group.color },
        draggable:   false,
        selectable:  false,
        connectable: false,
        zIndex: -10,
      }
    }).filter(Boolean)
  }, [groups, expNodes])

  const displayNodes = useMemo(() => [...bgNodes, ...expNodes], [bgNodes, expNodes])

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
    if (draggedNode.type === 'groupBackground') return
    if (event.shiftKey) return

    const fullList = Object.values(fullDataRef.current)
    const affectedGroups = groups.filter((g) => {
      const ids = resolveGroupNodeIds(g, fullList)
      return ids.has(draggedNode.id)
    })
    if (affectedGroups.length === 0) return

    setNodes((prev) => {
      const expPrev = prev.filter((n) => n.type !== 'groupBackground')
      const prevNode = expPrev.find((n) => n.id === draggedNode.id)
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
        if (n.type === 'groupBackground') return n
        if (!moveIds.has(n.id)) return n
        return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
      })
    })
  }, [groups])

  // ── 드래그 박스 선택 ──────────────────────────────────────────
  const onSelectionChange = useCallback(({ nodes: selNodes }) => {
    if (!isSelectMode) return
    latestSelectionRef.current = selNodes.filter((n) => n.type !== 'groupBackground')
  }, [isSelectMode])

  function handleContainerMouseUp() {
    if (!isSelectMode || groupCreatePopup) return
    const sel = latestSelectionRef.current
    if (sel.length > 0) {
      setSelectedForGroup(sel)
      setGroupCreatePopup(true)
    }
  }

  function handleGroupCreate() {
    const selectedIds = new Set(selectedForGroup.map((n) => n.id))

    // 루트: 선택 범위 내에 선행 실험이 없는 노드
    const roots = selectedForGroup.filter((n) => {
      const exp = fullDataRef.current[n.id]
      return (exp?.connections?.precedingExperiments ?? []).every((id) => !selectedIds.has(id))
    })

    // 리프: 선택 범위 내에 후속 실험이 없는 노드
    const leaves = selectedForGroup.filter((n) => {
      const exp = fullDataRef.current[n.id]
      return (exp?.connections?.followingExperiments ?? []).every((id) => !selectedIds.has(id))
    })

    const startNodeIds = roots.length > 0 ? roots.map((n) => n.id) : [selectedForGroup[0].id]
    const endNodeIds   = leaves.map((n) => n.id)

    if (groupCreateTarget === 'new') {
      if (!groupCreateName.trim()) return
      addGroup({
        id: generateGroupId(groups),
        name: groupCreateName.trim(),
        color: groupCreateColor,
        startNodeIds,
        endNodeIds,
      })
    } else {
      updateGroup(groupCreateTarget, { startNodeIds, endNodeIds })
    }

    setGroupCreatePopup(false)
    setSelectedForGroup([])
    setGroupCreateName('')
    setGroupCreateTarget('new')
    setIsSelectMode(false)
    latestSelectionRef.current = []
  }

  // ── ReactFlow 이벤트 ──────────────────────────────────────────
  const onNodeClick = useCallback((_, node) => {
    if (node.type === 'groupBackground') return
    if (!isSelectMode) {
      setSelectedExp(node.data.experiment)
      setContextMenu(null)
    }
  }, [isSelectMode])

  const onNodeContextMenu = useCallback((event, node) => {
    if (node.type === 'groupBackground') return
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, experiment: node.data.experiment })
  }, [])

  const onPaneClick = useCallback(() => {
    setContextMenu(null)
    if (isSelectMode) latestSelectionRef.current = []
  }, [isSelectMode])

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

  // ── onNodesChange: 배경 노드 변경 무시 ────────────────────────
  const handleNodesChange = useCallback((changes) => {
    const filtered = changes.filter((c) => !c.id?.startsWith('group-bg-'))
    if (filtered.length > 0) onNodesChange(filtered)
  }, [onNodesChange])

  // ── 렌더 ──────────────────────────────────────────────────────
  return (
    <div className="w-full h-full relative" onMouseUp={handleContainerMouseUp}>
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        onNodeDragStop={onNodeDragStop}
        onSelectionChange={onSelectionChange}
        onInit={(instance) => { rfInstanceRef.current = instance }}
        selectionOnDrag={isSelectMode}
        panOnDrag={!isSelectMode}
        fitView
        connectOnClick={false}
      >
        <Background />
        <Controls />
      </ReactFlow>

      {/* 그룹 목록 패널 */}
      <GroupListPanel
        experiments={experiments}
        allNodes={expNodes}
        setCenter={rfSetCenter}
        getZoom={rfGetZoom}
      />

      {/* 툴바 */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 pointer-events-auto">
        <span className="text-xs text-gray-500 bg-white/90 px-2 py-1 rounded-lg shadow border border-gray-200">
          {experiments.length}개 실험
        </span>
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

            {/* 새 그룹 / 기존 그룹 선택 */}
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

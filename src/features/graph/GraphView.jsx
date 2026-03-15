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
import { useGraphGroups, resolveGroupNodeIds, getGroupBounds } from './graphGroups'

const nodeTypes = {
  experimentNode:  ExperimentNode,
  groupBackground: GroupBackgroundNode,
}

export default function GraphView() {
  const navigate = useNavigate()
  const { experiments, isReady, getExperiment, updateExperiment } = useExperiments()
  const { groups } = useGraphGroups()

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [layoutDir, setLayoutDir] = useState('LR')
  const [selectedExp, setSelectedExp]   = useState(null)
  const [contextMenu, setContextMenu]   = useState(null)  // { x, y, experiment }
  const [outcomePopup, setOutcomePopup] = useState(null)  // { mode, experiment }

  const fullDataRef  = useRef({}) // id → full experiment data
  const layoutDirRef = useRef('LR')
  const rfInstanceRef = useRef(null)

  useEffect(() => { layoutDirRef.current = layoutDir }, [layoutDir])

  // ── 그룹 핀 정보 부여 ─────────────────────────────────────────
  function annotateGroupMarkers(nodeList) {
    const startIds = new Set(groups.map((g) => g.startNodeId))
    const endIds   = new Set(groups.map((g) => g.endNodeId).filter(Boolean))
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

    // LR 모드에서 같은 rank(x 좌표)의 노드 간 엣지는 직선으로
    let finalEdges = rawEdges
    if (dir === 'LR') {
      const xByNode = Object.fromEntries(laidOut.map((n) => [n.id, n.position.x]))
      finalEdges = rawEdges.map((e) => {
        const sx = xByNode[e.source]
        const tx = xByNode[e.target]
        if (sx !== undefined && tx !== undefined && sx === tx) {
          return { ...e, type: 'straight' }
        }
        return e
      })
    }

    setNodes(annotateGroupMarkers(laidOut))
    setEdges(finalEdges)
  }, [groups]) // groups 변경 시 핀 재계산

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
        style: { width: bounds.width, height: bounds.height, zIndex: -1 },
        data: { name: group.name, color: group.color },
        draggable:   false,
        selectable:  false,
        connectable: false,
        zIndex: -1,
      }
    }).filter(Boolean)
  }, [groups, expNodes])

  // 배경 노드를 일반 노드 앞에 배치 (ReactFlow는 배열 순서대로 렌더)
  const displayNodes = useMemo(() => [...bgNodes, ...expNodes], [bgNodes, expNodes])

  // ── 레이아웃 조작 ─────────────────────────────────────────────
  function handleRelayout() { rebuildLayout(fullDataRef.current, layoutDirRef.current) }

  function toggleDirection() {
    const next = layoutDir === 'TB' ? 'LR' : 'TB'
    setLayoutDir(next)
    rebuildLayout(fullDataRef.current, next)
  }

  // ── 그룹 드래그 이동 ──────────────────────────────────────────
  const onNodeDragStop = useCallback((event, draggedNode) => {
    if (draggedNode.type === 'groupBackground') return
    if (event.shiftKey) return // Shift: 개별 이동

    const fullList = Object.values(fullDataRef.current)
    // draggedNode가 속한 그룹 찾기
    const affectedGroups = groups.filter((g) => {
      const ids = resolveGroupNodeIds(g, fullList)
      return ids.has(draggedNode.id)
    })
    if (affectedGroups.length === 0) return

    // 드래그 delta 계산 (draggedNode의 이전 위치는 nodes 상태 기준)
    setNodes((prev) => {
      const expPrev = prev.filter((n) => n.type !== 'groupBackground')
      const prevNode = expPrev.find((n) => n.id === draggedNode.id)
      if (!prevNode) return prev

      const dx = draggedNode.position.x - prevNode.position.x
      const dy = draggedNode.position.y - prevNode.position.y
      if (dx === 0 && dy === 0) return prev

      // 이동할 노드 ID 집합
      const moveIds = new Set()
      affectedGroups.forEach((g) => {
        resolveGroupNodeIds(g, fullList).forEach((id) => moveIds.add(id))
      })
      moveIds.delete(draggedNode.id) // 드래그한 노드는 ReactFlow가 이미 이동

      return prev.map((n) => {
        if (n.type === 'groupBackground') return n
        if (!moveIds.has(n.id)) return n
        return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
      })
    })
  }, [groups])

  // ── ReactFlow 이벤트 ──────────────────────────────────────────
  const onNodeClick = useCallback((_, node) => {
    if (node.type === 'groupBackground') return
    setSelectedExp(node.data.experiment)
    setContextMenu(null)
  }, [])

  const onNodeContextMenu = useCallback((event, node) => {
    if (node.type === 'groupBackground') return
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, experiment: node.data.experiment })
  }, [])

  const onPaneClick = useCallback(() => { setContextMenu(null) }, [])

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

  // ── 그룹 패널 fitBounds ───────────────────────────────────────
  const handleFitBounds = useCallback((bounds) => {
    rfInstanceRef.current?.fitBounds(bounds, { padding: 0.1 })
  }, [])

  // ── onNodesChange: 배경 노드 변경 무시 ────────────────────────
  const handleNodesChange = useCallback((changes) => {
    const filtered = changes.filter((c) => !c.id?.startsWith('group-bg-'))
    if (filtered.length > 0) onNodesChange(filtered)
  }, [onNodesChange])

  // ── 렌더 ──────────────────────────────────────────────────────
  return (
    <div className="w-full h-full relative">
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
        onInit={(instance) => { rfInstanceRef.current = instance }}
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
        onFitBounds={handleFitBounds}
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
      </div>

      {/* 컨텍스트 메뉴 */}
      {contextMenu && (
        <GraphContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          experiment={contextMenu.experiment}
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

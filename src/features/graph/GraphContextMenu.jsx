import { useEffect, useRef, useState } from 'react'
import { useGraphGroups } from './GraphGroupProvider'
import { generateGroupId, GROUP_COLORS, resolveGroupNodeIds, isGroupEndpoint } from './graphGroups'

const MENU_WIDTH = 200

export default function GraphContextMenu({
  x, y, experiment, experiments, onOpen, onComplete, onChangeOutcome, onExclude, onClose,
}) {
  const menuRef = useRef(null)
  const { groups, addGroup, updateGroup, removeGroup } = useGraphGroups()

  // null | 'newGroup' | 'addStart' | 'removeStart' | 'endTarget' | 'removeEnd' | 'excludeFrom'
  const [subMode, setSubMode] = useState(null)
  const [newGroupName, setNewGroupName]   = useState('')
  const [newGroupColor, setNewGroupColor] = useState(GROUP_COLORS[0].value)

  useEffect(() => {
    function onMouseDown(e) { if (!menuRef.current?.contains(e.target)) onClose() }
    function onKeyDown(e)    { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown',   onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown',   onKeyDown)
    }
  }, [onClose])

  const left = x + MENU_WIDTH > window.innerWidth ? x - MENU_WIDTH : x

  const getStartIds = (g) => g.startNodeIds ?? (g.startNodeId ? [g.startNodeId] : [])

  const groupsWithThisStart  = groups.filter((g) => getStartIds(g).includes(experiment.id))
  const isStart               = groupsWithThisStart.length > 0
  const isEnd                 = groups.some((g) => isGroupEndpoint(g, experiment.id))
  const eligibleGroups        = groups.filter((g) => !isGroupEndpoint(g, experiment.id))
  const groupsWithThisEnd     = groups.filter((g) => isGroupEndpoint(g, experiment.id))
  const eligibleStartGroups   = groups.filter((g) => !getStartIds(g).includes(experiment.id))
  const groupsContainingNode  = groups.filter((g) =>
    resolveGroupNodeIds(g, experiments ?? []).has(experiment.id)
  )

  // 실험의 followingExperiments (fullDataRef에서 재구성된 데이터 사용)
  const expFull     = (experiments ?? []).find((e) => e.id === experiment.id) ?? experiment
  const followers   = expFull.connections?.followingExperiments ?? []

  function handleAddGroup() {
    if (!newGroupName.trim()) return
    addGroup({
      id: generateGroupId(groups),
      name: newGroupName.trim(),
      color: newGroupColor,
      startNodeIds: [experiment.id],
      blockedEdges: [],
      terminalNodeIds: [],
    })
    onClose()
  }

  // 끝점 지정: followingExperiments 유무에 따라 blockedEdges / terminalNodeIds 분기
  // 설정 전 역방향 BFS로 경로 위의 기존 blockedEdges를 제거
  function handleSetEnd(groupId) {
    const g = groups.find((g) => g.id === groupId)
    if (!g) return

    const startIds = new Set(g.startNodeIds ?? (g.startNodeId ? [g.startNodeId] : []))
    const expMap   = Object.fromEntries((experiments ?? []).map((e) => [e.id, e]))

    // 역방향 BFS: X에서 startNodeIds 방향으로 거슬러 올라가며
    // 경로 위에 있는 blockedEdges를 수집하여 제거
    const visited      = new Set()
    const queue        = [experiment.id]
    const edgesToRemove = new Set() // "from→to" 문자열

    while (queue.length > 0) {
      const nodeId = queue.shift()
      if (visited.has(nodeId)) continue
      visited.add(nodeId)
      if (startIds.has(nodeId)) continue

      const exp = expMap[nodeId]
      for (const precId of exp?.connections?.precedingExperiments ?? []) {
        if (visited.has(precId)) continue
        if ((g.blockedEdges ?? []).some((e) => e.from === precId && e.to === nodeId)) {
          edgesToRemove.add(`${precId}→${nodeId}`)
        }
        queue.push(precId)
      }
    }

    const filteredBlockedEdges = (g.blockedEdges ?? []).filter(
      (e) => !edgesToRemove.has(`${e.from}→${e.to}`)
    )

    if (followers.length > 0) {
      const newEdges = [...filteredBlockedEdges]
      for (const followerId of followers) {
        if (!newEdges.some((e) => e.from === experiment.id && e.to === followerId)) {
          newEdges.push({ from: experiment.id, to: followerId })
        }
      }
      updateGroup(groupId, { blockedEdges: newEdges })
    } else {
      const existing = g.terminalNodeIds ?? []
      updateGroup(groupId, {
        blockedEdges: filteredBlockedEdges,
        terminalNodeIds: existing.includes(experiment.id) ? existing : [...existing, experiment.id],
      })
    }
    onClose()
  }

  // 끝점 해제: blockedEdges(from === X) 전부 제거 + terminalNodeIds에서 제거
  function handleUnsetEnd(groupId) {
    const g = groups.find((g) => g.id === groupId)
    if (!g) return
    updateGroup(groupId, {
      blockedEdges:    (g.blockedEdges    ?? []).filter((e) => e.from !== experiment.id),
      terminalNodeIds: (g.terminalNodeIds ?? []).filter((id) => id !== experiment.id),
    })
    onClose()
  }

  function handleAddStart(groupId) {
    const g = groups.find((g) => g.id === groupId)
    if (!g) return
    const existing = getStartIds(g)
    if (!existing.includes(experiment.id)) {
      updateGroup(groupId, { startNodeIds: [...existing, experiment.id] })
    }
    onClose()
  }

  function handleUnsetStart(groupId) {
    const g = groups.find((g) => g.id === groupId)
    if (!g) return
    const newIds = getStartIds(g).filter((id) => id !== experiment.id)
    if (newIds.length === 0) {
      removeGroup(g.id)
    } else {
      updateGroup(g.id, { startNodeIds: newIds })
    }
    onClose()
  }

  return (
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: y, left, zIndex: 50, minWidth: MENU_WIDTH }}
      className="bg-white border border-gray-200 rounded-lg shadow-xl py-1"
    >
      <button
        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        onClick={() => { onOpen(); onClose() }}
      >
        실험 노트 열기
      </button>

      {experiment.status !== 'completed' && (
        <button
          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          onClick={() => { onComplete(); onClose() }}
        >
          완료로 전환
        </button>
      )}

      <button
        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        onClick={() => { onChangeOutcome(); onClose() }}
      >
        결과(Outcome) 변경
      </button>

      <div className="my-1 border-t border-gray-100" />

      {/* 새 그룹의 시작점으로 지정 */}
      {!isStart && (
        subMode === 'newGroup' ? (
          <div className="px-3 py-2 space-y-2">
            <input
              autoFocus
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddGroup() }}
              placeholder="그룹명"
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
            />
            <div className="flex gap-1.5">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setNewGroupColor(c.value)}
                  style={{ backgroundColor: c.value }}
                  className={`w-5 h-5 rounded-full transition-transform ${newGroupColor === c.value ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : ''}`}
                />
              ))}
            </div>
            <div className="flex gap-1.5">
              <button onClick={handleAddGroup} className="flex-1 text-xs bg-blue-500 text-white rounded px-2 py-1 hover:bg-blue-600">확인</button>
              <button onClick={() => setSubMode(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2">취소</button>
            </div>
          </div>
        ) : (
          <button
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={() => setSubMode('newGroup')}
          >
            새 그룹의 시작점으로 지정
          </button>
        )
      )}

      {/* 기존 그룹에 시작점 추가 */}
      {eligibleStartGroups.length > 0 && (
        subMode === 'addStart' ? (
          <div className="px-3 py-2 space-y-1">
            <div className="text-xs text-gray-400 mb-1">시작점 추가할 그룹:</div>
            {eligibleStartGroups.map((g) => (
              <button
                key={g.id}
                onClick={() => handleAddStart(g.id)}
                className="w-full text-left flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-gray-50"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                <span className="truncate">{g.name}</span>
              </button>
            ))}
            <button onClick={() => setSubMode(null)} className="text-xs text-gray-400 hover:text-gray-600 mt-1">취소</button>
          </div>
        ) : (
          <button
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={() => setSubMode('addStart')}
          >
            기존 그룹에 시작점 추가
          </button>
        )
      )}

      {/* 그룹 끝점으로 지정 */}
      {eligibleGroups.length > 0 && (
        subMode === 'endTarget' ? (
          <div className="px-3 py-2 space-y-1">
            <div className="text-xs text-gray-400 mb-1">끝점으로 지정할 그룹:</div>
            {eligibleGroups.map((g) => (
              <button
                key={g.id}
                onClick={() => handleSetEnd(g.id)}
                className="w-full text-left flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-gray-50"
                title={followers.length === 0 ? '후속 실험 연결 시에도 이 노드에서 차단됩니다' : undefined}
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                <span className="truncate">{g.name}</span>
                {followers.length === 0 && <span className="text-gray-300 text-xs ml-auto shrink-0">말단</span>}
              </button>
            ))}
            <button onClick={() => setSubMode(null)} className="text-xs text-gray-400 hover:text-gray-600 mt-1">취소</button>
          </div>
        ) : (
          <button
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={() => setSubMode('endTarget')}
          >
            그룹 끝점으로 지정
          </button>
        )
      )}

      {/* 시작점 해제 */}
      {isStart && (
        subMode === 'removeStart' ? (
          <div className="px-3 py-2 space-y-1">
            <div className="text-xs text-gray-400 mb-1">시작점 해제할 그룹:</div>
            {groupsWithThisStart.map((g) => (
              <button
                key={g.id}
                onClick={() => handleUnsetStart(g.id)}
                className="w-full text-left flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-red-50"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                <span className="truncate">{g.name}</span>
              </button>
            ))}
            <button onClick={() => setSubMode(null)} className="text-xs text-gray-400 hover:text-gray-600 mt-1">취소</button>
          </div>
        ) : groupsWithThisStart.length === 1 ? (
          <button
            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
            onClick={() => handleUnsetStart(groupsWithThisStart[0].id)}
          >
            그룹 시작점 해제{getStartIds(groupsWithThisStart[0]).length === 1 ? ' (그룹 삭제)' : ''}
          </button>
        ) : (
          <button
            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
            onClick={() => setSubMode('removeStart')}
          >
            그룹 시작점 해제
          </button>
        )
      )}

      {/* 끝점 해제 */}
      {isEnd && (
        subMode === 'removeEnd' ? (
          <div className="px-3 py-2 space-y-1">
            <div className="text-xs text-gray-400 mb-1">끝점 해제할 그룹:</div>
            {groupsWithThisEnd.map((g) => (
              <button
                key={g.id}
                onClick={() => handleUnsetEnd(g.id)}
                className="w-full text-left flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-orange-50"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                <span className="truncate">{g.name}</span>
              </button>
            ))}
            <button onClick={() => setSubMode(null)} className="text-xs text-gray-400 hover:text-gray-600 mt-1">취소</button>
          </div>
        ) : groupsWithThisEnd.length === 1 ? (
          <button
            className="w-full text-left px-4 py-2 text-sm text-orange-500 hover:bg-orange-50 transition-colors"
            onClick={() => handleUnsetEnd(groupsWithThisEnd[0].id)}
          >
            그룹 끝점 해제
          </button>
        ) : (
          <button
            className="w-full text-left px-4 py-2 text-sm text-orange-500 hover:bg-orange-50 transition-colors"
            onClick={() => setSubMode('removeEnd')}
          >
            그룹 끝점 해제
          </button>
        )
      )}

      {/* 그룹에서 제외 */}
      {groupsContainingNode.length > 0 && (
        subMode === 'excludeFrom' ? (
          <div className="px-3 py-2 space-y-1">
            <div className="text-xs text-gray-400 mb-1">제외할 그룹:</div>
            {groupsContainingNode.map((g) => (
              <button
                key={g.id}
                onClick={() => { onExclude(experiment.id, g.id); onClose() }}
                className="w-full text-left flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-red-50"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                <span className="truncate">{g.name}</span>
              </button>
            ))}
            <button onClick={() => setSubMode(null)} className="text-xs text-gray-400 hover:text-gray-600 mt-1">취소</button>
          </div>
        ) : (
          <button
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={() => setSubMode('excludeFrom')}
          >
            이 노드를 그룹에서 제외
          </button>
        )
      )}
    </div>
  )
}

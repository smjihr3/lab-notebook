import { useEffect, useRef, useState } from 'react'
import { useGraphGroups } from './GraphGroupProvider'
import { generateGroupId, GROUP_COLORS } from './graphGroups'

const MENU_WIDTH = 200

export default function GraphContextMenu({
  x, y, experiment, onOpen, onComplete, onChangeOutcome, onClose,
}) {
  const menuRef = useRef(null)
  const { groups, addGroup, updateGroup, removeGroup } = useGraphGroups()

  // null | 'newGroup' | 'endTarget' | 'removeEnd'
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

  const isStart = groups.some((g) => g.startNodeId === experiment.id)
  const isEnd   = groups.some((g) => (g.endNodeIds ?? []).includes(experiment.id))
  // 이 노드를 끝점으로 추가할 수 있는 그룹 (이미 끝점 아닌 것)
  const eligibleGroups    = groups.filter((g) => !(g.endNodeIds ?? []).includes(experiment.id))
  // 이 노드가 끝점인 그룹
  const groupsWithThisEnd = groups.filter((g) => (g.endNodeIds ?? []).includes(experiment.id))

  function handleAddGroup() {
    if (!newGroupName.trim()) return
    addGroup({
      id: generateGroupId(groups),
      name: newGroupName.trim(),
      color: newGroupColor,
      startNodeId: experiment.id,
      endNodeIds: [],
    })
    onClose()
  }

  function handleSetEnd(groupId) {
    const g = groups.find((g) => g.id === groupId)
    if (!g) return
    const existing = g.endNodeIds ?? []
    if (!existing.includes(experiment.id)) {
      updateGroup(groupId, { endNodeIds: [...existing, experiment.id] })
    }
    onClose()
  }

  function handleUnsetEnd(groupId) {
    const g = groups.find((g) => g.id === groupId)
    if (!g) return
    updateGroup(groupId, { endNodeIds: (g.endNodeIds ?? []).filter((x) => x !== experiment.id) })
    onClose()
  }

  function handleUnsetStart() {
    const g = groups.find((g) => g.startNodeId === experiment.id)
    if (g) removeGroup(g.id)
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

      {/* 그룹 시작점 지정 */}
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
            그룹 시작점으로 지정
          </button>
        )
      )}

      {/* 그룹 끝점 지정 */}
      {eligibleGroups.length > 0 && (
        subMode === 'endTarget' ? (
          <div className="px-3 py-2 space-y-1">
            <div className="text-xs text-gray-400 mb-1">끝점으로 지정할 그룹:</div>
            {eligibleGroups.map((g) => (
              <button
                key={g.id}
                onClick={() => handleSetEnd(g.id)}
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
            onClick={() => setSubMode('endTarget')}
          >
            그룹 끝점으로 지정
          </button>
        )
      )}

      {/* 시작점 해제 */}
      {isStart && (
        <button
          className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
          onClick={handleUnsetStart}
        >
          그룹 시작점 해제 (그룹 삭제)
        </button>
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
    </div>
  )
}

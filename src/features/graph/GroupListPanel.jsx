import { useState, useRef, useEffect } from 'react'
import { useGraphGroups } from './GraphGroupProvider'
import { generateGroupId, resolveGroupNodeIds, getGroupBounds, getGroupEndpointNodeIds, GROUP_COLORS } from './graphGroups'

function ExperimentSearchInput({ experiments, excludeIds = [], placeholder, value, onChange }) {
  const [query, setQuery] = useState('')
  const [open, setOpen]   = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = experiments.filter((e) =>
    !excludeIds.includes(e.id) &&
    (e.id.includes(query) || (e.title ?? '').includes(query))
  ).slice(0, 8)

  const selected = value ? experiments.find((e) => e.id === value) : null

  return (
    <div ref={ref} className="relative">
      {selected ? (
        <div className="flex items-center gap-1 text-xs border border-gray-200 rounded px-2 py-1">
          <span className="font-mono text-gray-400">{selected.id}</span>
          <span className="truncate text-gray-700">{selected.title || '(제목 없음)'}</span>
          <button
            onClick={() => { onChange(null); setQuery('') }}
            className="ml-auto text-gray-300 hover:text-gray-500"
          >×</button>
        </div>
      ) : (
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
        />
      )}
      {open && !selected && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded shadow-lg mt-0.5 max-h-36 overflow-y-auto">
          {filtered.map((e) => (
            <button
              key={e.id}
              onMouseDown={() => { onChange(e.id); setQuery(''); setOpen(false) }}
              className="w-full text-left flex items-center gap-1.5 px-2 py-1.5 text-xs hover:bg-blue-50"
            >
              <span className="font-mono text-gray-400 shrink-0">{e.id}</span>
              <span className="truncate text-gray-700">{e.title || '(제목 없음)'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function NewGroupForm({ experiments, onSubmit, onCancel }) {
  const { groups } = useGraphGroups()
  const [name, setName]       = useState('')
  const [color, setColor]     = useState(GROUP_COLORS[0].value)
  const [startId, setStartId] = useState(null)
  const [endId, setEndId]     = useState(null)

  function handleSubmit() {
    if (!name.trim() || !startId) return
    onSubmit({
      id: generateGroupId(groups),
      name: name.trim(),
      color,
      startNodeIds: [startId],
      blockedEdges: [],
      terminalNodeIds: endId ? [endId] : [],
    })
  }

  return (
    <div className="px-3 py-3 space-y-2 border-b border-gray-100">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="그룹명"
        className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400"
      />
      <div className="flex gap-1.5">
        {GROUP_COLORS.map((c) => (
          <button
            key={c.value}
            onClick={() => setColor(c.value)}
            style={{ backgroundColor: c.value }}
            className={`w-5 h-5 rounded-full transition-transform ${color === c.value ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : ''}`}
          />
        ))}
      </div>
      <ExperimentSearchInput
        experiments={experiments}
        excludeIds={endId ? [endId] : []}
        placeholder="시작 실험 검색"
        value={startId}
        onChange={setStartId}
      />
      <ExperimentSearchInput
        experiments={experiments}
        excludeIds={startId ? [startId] : []}
        placeholder="끝 실험 (선택)"
        value={endId}
        onChange={setEndId}
      />
      <div className="flex gap-1.5 pt-1">
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || !startId}
          className="flex-1 text-xs bg-blue-500 text-white rounded px-2 py-1.5 hover:bg-blue-600 disabled:opacity-40"
        >
          확인
        </button>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600 px-2">
          취소
        </button>
      </div>
    </div>
  )
}

function GroupItem({ group, experiments, allNodes, setCenter, getZoom, onRemove }) {
  const { updateGroup, removeGroup } = useGraphGroups()
  const [expanded, setExpanded]       = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal]         = useState(group.name)
  const [addingEnd, setAddingEnd]     = useState(false)
  const [addingStart, setAddingStart] = useState(false)

  const startNodeIds  = group.startNodeIds ?? (group.startNodeId ? [group.startNodeId] : [])
  const endpointIds   = getGroupEndpointNodeIds(group)      // Set
  const nodeIds       = resolveGroupNodeIds(group, experiments)
  const excludeIds    = [...startNodeIds, ...endpointIds]

  function handleFit() {
    const bounds = getGroupBounds(nodeIds, allNodes)
    if (!bounds) return
    const cx = bounds.x + bounds.width  / 2
    const cy = bounds.y + bounds.height / 2
    setCenter(cx, cy, { zoom: getZoom(), duration: 400 })
  }

  function handleNameBlur() {
    if (nameVal.trim() && nameVal !== group.name) updateGroup(group.id, { name: nameVal.trim() })
    setEditingName(false)
  }

  function handleAddEnd(id) {
    if (!id || endpointIds.has(id)) return
    // 패널에서 수동 추가는 terminalNodeIds로 처리 (특정 간선 정보 불필요)
    const existing = group.terminalNodeIds ?? []
    if (!existing.includes(id)) {
      updateGroup(group.id, { terminalNodeIds: [...existing, id] })
    }
    setAddingEnd(false)
  }

  function handleRemoveEndpoint(id) {
    updateGroup(group.id, {
      blockedEdges:    (group.blockedEdges    ?? []).filter((e) => e.from !== id),
      terminalNodeIds: (group.terminalNodeIds ?? []).filter((x) => x !== id),
    })
  }

  function handleAddStart(id) {
    if (!id || startNodeIds.includes(id)) return
    updateGroup(group.id, { startNodeIds: [...startNodeIds, id] })
    setAddingStart(false)
  }

  function handleRemoveStart(id) {
    const newIds = startNodeIds.filter((x) => x !== id)
    if (newIds.length === 0) {
      removeGroup(group.id)
    } else {
      updateGroup(group.id, { startNodeIds: newIds })
    }
  }

  return (
    <div className="border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 group">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
        {editingName ? (
          <input
            autoFocus
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') handleNameBlur() }}
            className="flex-1 text-sm font-semibold border-b border-blue-400 outline-none bg-transparent"
          />
        ) : (
          <button
            className="flex-1 text-left text-sm font-semibold text-gray-700 truncate"
            onClick={handleFit}
            onDoubleClick={() => setEditingName(true)}
          >
            {group.name}
          </button>
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-gray-300 hover:text-gray-500 text-xs"
        >
          {expanded ? '▲' : '▼'}
        </button>
        <button
          onClick={onRemove}
          className="text-gray-200 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
        >
          ×
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-2 space-y-1.5">
          {/* 시작점 목록 */}
          <div className="text-xs text-gray-400">
            <div className="mb-0.5">시작점:</div>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {startNodeIds.map((id) => {
                const exp = experiments.find((e) => e.id === id)
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 bg-blue-50 rounded px-1.5 py-0.5 text-blue-700 font-mono text-xs"
                  >
                    {id}
                    {exp?.title && (
                      <span className="font-sans text-blue-500 truncate max-w-[56px]">{exp.title}</span>
                    )}
                    <button
                      onClick={() => handleRemoveStart(id)}
                      className="text-blue-300 hover:text-red-400 ml-0.5 leading-none"
                    >×</button>
                  </span>
                )
              })}
            </div>
          </div>

          {/* 시작점 추가 */}
          {addingStart ? (
            <ExperimentSearchInput
              experiments={experiments}
              excludeIds={excludeIds}
              placeholder="시작점 추가..."
              value={null}
              onChange={(id) => handleAddStart(id)}
            />
          ) : (
            <button
              onClick={() => setAddingStart(true)}
              className="text-xs text-blue-400 hover:text-blue-600"
            >
              + 시작점 추가
            </button>
          )}

          {/* 끝점 목록 */}
          <div className="text-xs text-gray-400">
            <div className="mb-0.5">끝점:</div>
            {endpointIds.size === 0 ? (
              <span className="text-gray-300 italic">열린 그룹</span>
            ) : (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {[...endpointIds].map((id) => {
                  const exp = experiments.find((e) => e.id === id)
                  const isTerminal = (group.terminalNodeIds ?? []).includes(id)
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 bg-gray-100 rounded px-1.5 py-0.5 text-gray-600 font-mono text-xs"
                      title={isTerminal ? '말단 노드 — 후속 실험 연결 시에도 차단 유지' : undefined}
                    >
                      {id}
                      {exp?.title && (
                        <span className="font-sans text-gray-500 truncate max-w-[56px]">{exp.title}</span>
                      )}
                      {isTerminal && <span className="text-gray-400 font-sans">●</span>}
                      <button
                        onClick={() => handleRemoveEndpoint(id)}
                        className="text-gray-300 hover:text-red-400 ml-0.5 leading-none"
                      >×</button>
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {/* 끝점 추가 */}
          {addingEnd ? (
            <ExperimentSearchInput
              experiments={experiments}
              excludeIds={excludeIds}
              placeholder="끝점 추가..."
              value={null}
              onChange={(id) => handleAddEnd(id)}
            />
          ) : (
            <button
              onClick={() => setAddingEnd(true)}
              className="text-xs text-blue-400 hover:text-blue-600"
            >
              + 끝점 추가
            </button>
          )}

          <div className="text-xs text-gray-400">포함 실험: {nodeIds.size}개</div>
        </div>
      )}
    </div>
  )
}

export default function GroupListPanel({ experiments, allNodes, setCenter, getZoom }) {
  const { groups, addGroup, removeGroup } = useGraphGroups()
  const [collapsed, setCollapsed] = useState(false)
  const [showForm,  setShowForm]  = useState(false)

  if (collapsed) {
    return (
      <div className="absolute left-4 top-4 z-10">
        <button
          onClick={() => setCollapsed(false)}
          className="bg-white/90 border border-gray-200 rounded-lg shadow px-2.5 py-1.5 text-xs text-gray-600 hover:bg-white"
        >
          그룹 ▶
        </button>
      </div>
    )
  }

  return (
    <div className="absolute left-4 top-4 z-10 w-60 bg-white/95 border border-gray-200 rounded-xl shadow-lg flex flex-col max-h-[70vh]">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 shrink-0">
        <span className="text-xs font-semibold text-gray-600">그룹 목록</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-xs text-blue-500 hover:text-blue-700 font-medium"
          >
            + 새 그룹
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="text-gray-300 hover:text-gray-500 text-xs ml-1"
          >
            ◀
          </button>
        </div>
      </div>

      {/* 새 그룹 폼 */}
      {showForm && (
        <NewGroupForm
          experiments={experiments}
          onSubmit={(g) => { addGroup(g); setShowForm(false) }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* 그룹 목록 */}
      <div className="overflow-y-auto flex-1">
        {groups.length === 0 ? (
          <div className="px-3 py-4 text-xs text-gray-300 text-center">
            그룹 없음
          </div>
        ) : (
          groups.map((g) => (
            <GroupItem
              key={g.id}
              group={g}
              experiments={experiments}
              allNodes={allNodes}
              setCenter={setCenter}
              getZoom={getZoom}
              onRemove={() => removeGroup(g.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

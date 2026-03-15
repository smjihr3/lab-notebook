import { useState, useRef, useEffect } from 'react'
import { useGraphGroups } from './GraphGroupProvider'
import {
  generateGroupId, resolveGroupNodeIds, getGroupBounds,
  getGroupEndpointNodeIds, isEndNode, GROUP_COLORS,
} from './graphGroups'

// ── 실험 검색 입력 ────────────────────────────────────────────
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
          <button onClick={() => { onChange(null); setQuery('') }} className="ml-auto text-gray-300 hover:text-gray-500">×</button>
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

// ── 새 그룹 폼 ────────────────────────────────────────────────
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
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600 px-2">취소</button>
      </div>
    </div>
  )
}

// ── 그룹 항목 ─────────────────────────────────────────────────
function GroupItem({ group, experiments, allNodes, setCenter, getZoom, onRemove, getFullExperiments }) {
  const { updateGroup, removeGroup } = useGraphGroups()
  const [expanded, setExpanded]         = useState(false)
  const [editingName, setEditingName]   = useState(false)
  const [nameVal, setNameVal]           = useState(group.name)
  const [addingEnd, setAddingEnd]       = useState(false)
  const [addingStart, setAddingStart]   = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showNavPopover, setShowNavPopover]   = useState(false)

  const colorPickerRef  = useRef(null)
  const navBtnRef       = useRef(null)
  const navPopoverRef   = useRef(null)
  const [navPopoverPos, setNavPopoverPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    function h(e) { if (!colorPickerRef.current?.contains(e.target)) setShowColorPicker(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    function h(e) {
      if (!navBtnRef.current?.contains(e.target) && !navPopoverRef.current?.contains(e.target))
        setShowNavPopover(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const startNodeIds  = group.startNodeIds ?? (group.startNodeId ? [group.startNodeId] : [])
  const nodeIds       = resolveGroupNodeIds(group, experiments)
  const endpointIds   = new Set(
    [...getGroupEndpointNodeIds(group)].filter((id) => isEndNode(id, group, nodeIds, experiments))
  )
  const excludeIds    = [...startNodeIds, ...endpointIds]

  // 노드 중심 좌표 계산
  function getNodeCenter(nodeId) {
    const rfNode = allNodes.find((n) => n.id === nodeId)
    if (!rfNode) return null
    return {
      x: rfNode.position.x + (rfNode.width  ?? 160) / 2,
      y: rfNode.position.y + (rfNode.height ?? 60)  / 2,
    }
  }

  function navigateTo(nodeId) {
    const pos = getNodeCenter(nodeId)
    if (!pos) return
    setCenter(pos.x, pos.y, { zoom: getZoom(), duration: 400 })
    setShowNavPopover(false)
  }

  function handleNavigateToStart() {
    if (startNodeIds.length > 0) navigateTo(startNodeIds[0])
  }

  function handleNavigateToEnd() {
    if (endpointIds.size > 0) {
      navigateTo([...endpointIds][0])
      return
    }
    // 열린 그룹: 그룹 내 말단 노드(그룹 내 활성 자식 없는 노드)
    const fullExps = getFullExperiments?.() ?? experiments
    const leafIds = [...nodeIds].filter((id) => {
      const exp = fullExps.find((e) => e.id === id)
      return (exp?.connections?.followingExperiments ?? []).filter((c) => nodeIds.has(c)).length === 0
    })
    if (leafIds.length > 0) {
      const centers = leafIds.map(getNodeCenter).filter(Boolean)
      if (centers.length > 0) {
        const avgX = centers.reduce((s, p) => s + p.x, 0) / centers.length
        const avgY = centers.reduce((s, p) => s + p.y, 0) / centers.length
        setCenter(avgX, avgY, { zoom: getZoom(), duration: 400 })
        setShowNavPopover(false)
        return
      }
    }
    handleNavigateToGroupBounds()
  }

  function handleNavigateToGroupBounds() {
    const bounds = getGroupBounds(nodeIds, allNodes)
    if (!bounds) return
    setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { zoom: getZoom(), duration: 400 })
    setShowNavPopover(false)
  }

  function handleNameBlur() {
    if (nameVal.trim() && nameVal !== group.name) updateGroup(group.id, { name: nameVal.trim() })
    setEditingName(false)
  }

  function handleAddEnd(id) {
    if (!id || endpointIds.has(id)) return
    const existing = group.terminalNodeIds ?? []
    if (!existing.includes(id)) updateGroup(group.id, { terminalNodeIds: [...existing, id] })
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
    if (newIds.length === 0) { removeGroup(group.id) } else { updateGroup(group.id, { startNodeIds: newIds }) }
  }

  return (
    <div className="border-b border-gray-50 last:border-0">
      {/* 헤더 행 */}
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 group/row">

        {/* 컬러 닷 (클릭 시 팔레트 팝업) */}
        <div ref={colorPickerRef} className="relative shrink-0">
          <button
            onClick={() => setShowColorPicker((v) => !v)}
            className="w-2.5 h-2.5 rounded-full block"
            style={{ backgroundColor: group.color }}
            title="색상 변경"
          />
          {showColorPicker && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 flex gap-1">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c.value}
                  onMouseDown={() => { updateGroup(group.id, { color: c.value }); setShowColorPicker(false) }}
                  style={{ backgroundColor: c.value }}
                  className={`w-5 h-5 rounded-full transition-transform ${group.color === c.value ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'hover:scale-110'}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* 그룹명 (클릭 → 이동 팝오버, 더블클릭 → 편집) */}
        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              autoFocus
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNameBlur() }}
              className="w-full text-sm font-semibold border-b border-blue-400 outline-none bg-transparent"
            />
          ) : (
            <button
              ref={navBtnRef}
              className="w-full text-left text-sm font-semibold text-gray-700 truncate"
              onClick={() => {
                if (!showNavPopover && navBtnRef.current) {
                  const rect = navBtnRef.current.getBoundingClientRect()
                  setNavPopoverPos({ top: rect.bottom + 4, left: rect.left })
                }
                setShowNavPopover((v) => !v)
              }}
              onDoubleClick={() => { setShowNavPopover(false); setEditingName(true) }}
            >
              {group.name}
            </button>
          )}
        </div>

        {/* 이동 팝오버 (fixed 위치, overflow 클리핑 방지) */}
        {showNavPopover && (
          <div
            ref={navPopoverRef}
            style={{ position: 'fixed', top: navPopoverPos.top, left: navPopoverPos.left }}
            className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-44"
          >
            <button
              onClick={handleNavigateToStart}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              시작점으로 이동
            </button>
            <button
              onClick={handleNavigateToEnd}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              {endpointIds.size > 0 ? '끝점으로 이동' : '가장 하위 노드로 이동'}
            </button>
            <button
              onClick={handleNavigateToGroupBounds}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              그룹 전체 보기
            </button>
          </div>
        )}

        {/* 펼치기/접기 */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-gray-300 hover:text-gray-500 text-xs shrink-0"
        >
          {expanded ? '▲' : '▼'}
        </button>

        {/* 삭제 */}
        <button
          onClick={onRemove}
          className="text-gray-200 hover:text-red-400 text-xs opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0"
        >
          ×
        </button>
      </div>

      {/* 상세 정보 (펼침 시) */}
      {expanded && (
        <div className="px-4 pb-2 space-y-1.5">
          {/* 시작점 목록 */}
          <div className="text-xs text-gray-400">
            <div className="mb-0.5">시작점:</div>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {startNodeIds.map((id) => {
                const exp = experiments.find((e) => e.id === id)
                return (
                  <span key={id} className="inline-flex items-center gap-1 bg-blue-50 rounded px-1.5 py-0.5 text-blue-700 font-mono text-xs">
                    {id}
                    {exp?.title && <span className="font-sans text-blue-500 truncate max-w-[56px]">{exp.title}</span>}
                    <button onClick={() => handleRemoveStart(id)} className="text-blue-300 hover:text-red-400 ml-0.5 leading-none">×</button>
                  </span>
                )
              })}
            </div>
          </div>

          {addingStart ? (
            <ExperimentSearchInput
              experiments={experiments}
              excludeIds={excludeIds}
              placeholder="시작점 추가..."
              value={null}
              onChange={(id) => handleAddStart(id)}
            />
          ) : (
            <button onClick={() => setAddingStart(true)} className="text-xs text-blue-400 hover:text-blue-600">
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
                      {exp?.title && <span className="font-sans text-gray-500 truncate max-w-[56px]">{exp.title}</span>}
                      {isTerminal && <span className="text-gray-400 font-sans">●</span>}
                      <button onClick={() => handleRemoveEndpoint(id)} className="text-gray-300 hover:text-red-400 ml-0.5 leading-none">×</button>
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {addingEnd ? (
            <ExperimentSearchInput
              experiments={experiments}
              excludeIds={excludeIds}
              placeholder="끝점 추가..."
              value={null}
              onChange={(id) => handleAddEnd(id)}
            />
          ) : (
            <button onClick={() => setAddingEnd(true)} className="text-xs text-blue-400 hover:text-blue-600">
              + 끝점 추가
            </button>
          )}

          <div className="text-xs text-gray-400">포함 실험: {nodeIds.size}개</div>
        </div>
      )}
    </div>
  )
}

// ── 그룹 목록 패널 ────────────────────────────────────────────
export default function GroupListPanel({ experiments, allNodes, setCenter, getZoom, getFullExperiments }) {
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

      {showForm && (
        <NewGroupForm
          experiments={experiments}
          onSubmit={(g) => { addGroup(g); setShowForm(false) }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="overflow-y-auto flex-1">
        {groups.length === 0 ? (
          <div className="px-3 py-4 text-xs text-gray-300 text-center">그룹 없음</div>
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
              getFullExperiments={getFullExperiments}
            />
          ))
        )}
      </div>
    </div>
  )
}

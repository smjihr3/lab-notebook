import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useExperiments } from '../../store/experimentStore'

// ── 연결 관계 팝업 ───────────────────────────────────────────

function ConnectionPopup({ exp, rect, allExperiments, getExperiment, updateExperiment, onClose }) {
  const [fullExp, setFullExp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeSearch, setActiveSearch] = useState(null) // 'preceding' | 'following'
  const [query, setQuery] = useState('')
  const popupRef = useRef(null)

  useEffect(() => {
    getExperiment(exp.id)
      .then((data) => setFullExp(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [exp.id])

  useEffect(() => {
    function handler(e) {
      if (popupRef.current?.contains(e.target)) return
      onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  async function handleAdd(group, linkedId) {
    if (!fullExp || saving) return
    const key = group === 'preceding' ? 'precedingExperiments' : 'followingExperiments'
    const prev = fullExp.connections?.[key] ?? []
    if (prev.includes(linkedId)) return
    const updated = { ...fullExp, connections: { ...(fullExp.connections ?? {}), [key]: [...prev, linkedId] } }
    setFullExp(updated)
    setSaving(true)
    try { await updateExperiment(updated) } catch (e) { console.error(e) } finally { setSaving(false) }
    setActiveSearch(null)
    setQuery('')
  }

  async function handleRemove(group, linkedId) {
    if (!fullExp || saving) return
    const key = group === 'preceding' ? 'precedingExperiments' : 'followingExperiments'
    const prev = fullExp.connections?.[key] ?? []
    const updated = { ...fullExp, connections: { ...(fullExp.connections ?? {}), [key]: prev.filter((id) => id !== linkedId) } }
    setFullExp(updated)
    setSaving(true)
    try { await updateExperiment(updated) } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  const preceding = fullExp?.connections?.precedingExperiments ?? []
  const following = fullExp?.connections?.followingExperiments ?? []
  const allConnected = [exp.id, ...preceding, ...following]

  const filtered = allExperiments
    .filter((e) =>
      !allConnected.includes(e.id) &&
      (query === '' ||
        e.id.toLowerCase().includes(query.toLowerCase()) ||
        (e.title ?? '').toLowerCase().includes(query.toLowerCase()))
    )
    .slice(0, 8)

  const style = {
    position: 'fixed',
    top: rect.bottom + 6,
    right: window.innerWidth - rect.right,
    zIndex: 9999,
    width: 280,
  }

  function GroupSection({ group, label, ids }) {
    return (
      <div className={group === 'following' ? '' : 'mb-3 pb-3 border-b border-gray-100'}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gray-500">{label}</span>
          <button
            onClick={() => { setActiveSearch(activeSearch === group ? null : group); setQuery('') }}
            className="text-xs text-gray-400 hover:text-blue-600 w-5 h-5 flex items-center justify-center rounded border border-dashed border-gray-300 hover:border-blue-400 transition-colors"
          >+</button>
        </div>
        {activeSearch === group && (
          <div className="mb-2">
            <input
              autoFocus
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-400 mb-1"
              placeholder="ID 또는 제목 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="max-h-28 overflow-y-auto border border-gray-100 rounded-lg">
              {filtered.length === 0 ? (
                <div className="px-2 py-2 text-xs text-gray-400">결과 없음</div>
              ) : filtered.map((e) => (
                <button
                  key={e.id}
                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50 transition-colors flex items-center gap-1.5"
                  onClick={() => handleAdd(group, e.id)}
                >
                  <span className="font-mono text-[10px] text-gray-400 shrink-0">{e.id}</span>
                  <span className="text-gray-700 truncate">{e.title || '(제목 없음)'}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {ids.length === 0 ? (
            <span className="text-xs text-gray-300">없음</span>
          ) : ids.map((id) => {
            const linked = allExperiments.find((e) => e.id === id)
            return (
              <span key={id} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                <span className="font-mono text-[10px] text-gray-400">{id}</span>
                {linked?.title && <span className="max-w-[60px] truncate">{linked.title}</span>}
                <button
                  onClick={() => handleRemove(group, id)}
                  className="text-gray-400 hover:text-red-500 transition-colors leading-none ml-0.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-2.5 h-2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            )
          })}
        </div>
      </div>
    )
  }

  return createPortal(
    <div ref={popupRef} style={style} className="bg-white border border-gray-200 rounded-xl shadow-xl p-4">
      {loading ? (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {saving && <p className="text-xs text-gray-400 mb-2">저장 중...</p>}
          <GroupSection group="preceding" label="선행 실험" ids={preceding} />
          <GroupSection group="following" label="후속 실험" ids={following} />
        </>
      )}
    </div>,
    document.body
  )
}

// ────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  in_progress:  { label: '진행중',     cls: 'bg-blue-100 text-blue-700' },
  data_pending: { label: '데이터 대기', cls: 'bg-yellow-100 text-yellow-700' },
  analyzing:    { label: '분석중',     cls: 'bg-orange-100 text-orange-700' },
  completed:    { label: '완료',       cls: 'bg-green-100 text-green-700' },
}

const OUTCOME_BADGE = {
  success: { label: '성공',    cls: 'bg-green-100 text-green-700' },
  failed:  { label: '실패',    cls: 'bg-red-100 text-red-700' },
  partial: { label: '부분성공', cls: 'bg-orange-100 text-orange-700' },
  unknown: { label: '미정',    cls: 'bg-gray-100 text-gray-500' },
}

export default function ExperimentListPage() {
  const navigate = useNavigate()
  const { experiments, isLoading, getExperiment, updateExperiment, deleteExperiment } = useExperiments()
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [connectionPopup, setConnectionPopup] = useState(null) // { exp, rect }

  async function handleDelete(exp) {
    setDeletingId(exp.id)
    try {
      await deleteExperiment(exp.id)
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  return (
    <div className="max-w-3xl">
      {/* 상단 헤더 — sticky 고정, 어떤 상태와도 무관하게 항상 표시 */}
      <div className="sticky top-0 z-10 bg-gray-50 px-6 pt-6 pb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">실험 노트</h1>
        <button
          onClick={() => navigate('/experiments/new')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          새 실험 노트
        </button>
      </div>
      <div className="px-6 pb-6">

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : experiments.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-base">아직 실험 노트가 없습니다.</p>
          <p className="text-sm mt-1">첫 실험 노트를 작성해보세요.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {experiments.map((exp) => {
            const status = STATUS_BADGE[exp.status] ?? STATUS_BADGE.in_progress
            const outcome = OUTCOME_BADGE[exp.outcome] ?? OUTCOME_BADGE.unknown
            const isConfirming = confirmDeleteId === exp.id
            const isDeleting = deletingId === exp.id

            return (
              <li key={exp.id} className="relative">
                <div
                  onClick={() => !isConfirming && navigate(`/experiments/${exp.id}`)}
                  className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
                >
                  {!isConfirming && (
                    <>
                      {/* 연결 관계 버튼 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const rect = e.currentTarget.getBoundingClientRect()
                          setConnectionPopup({ exp, rect })
                        }}
                        className="absolute top-3 right-9 p-1 text-gray-300 hover:text-blue-400 rounded transition-colors"
                        title="연결 관계"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                        </svg>
                      </button>
                      {/* 삭제 버튼 */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(exp.id) }}
                        className="absolute top-3 right-3 p-1 text-gray-300 hover:text-red-400 rounded transition-colors"
                        title="삭제"
                      >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                    </>
                  )}

                  {isConfirming && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute inset-0 bg-white/95 rounded-xl flex flex-col items-center justify-center gap-3 z-10"
                    >
                      <p className="text-sm font-medium text-gray-800">정말 삭제하시겠습니까?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDelete(exp)}
                          disabled={isDeleting}
                          className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
                        >
                          {isDeleting ? '삭제 중...' : '삭제'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-6 pr-14">
                    <span className="font-medium text-gray-900 text-sm leading-snug">
                      {exp.title || '(제목 없음)'}
                    </span>
                    <div className="flex gap-1.5 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.cls}`}>
                        {status.label}
                      </span>
                      {exp.status === 'completed' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${outcome.cls}`}>
                          {outcome.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {exp.createdAt ? new Date(exp.createdAt).toLocaleDateString('ko-KR') : ''}
                  </p>
                  {exp.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {exp.tags.map((tag) => (
                        <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      </div>

      {/* 연결 관계 팝업 */}
      {connectionPopup && (
        <ConnectionPopup
          exp={connectionPopup.exp}
          rect={connectionPopup.rect}
          allExperiments={experiments}
          getExperiment={getExperiment}
          updateExperiment={updateExperiment}
          onClose={() => setConnectionPopup(null)}
        />
      )}
    </div>
  )
}

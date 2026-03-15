import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { STATUS_LABELS, OUTCOME_LABELS } from './graphUtils'
import OutcomePopup from './OutcomePopup'

const STATUS_OPTIONS = [
  { value: 'in_progress',  label: '진행중',     activeCls: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'data_pending', label: '데이터 대기', activeCls: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'analyzing',    label: '분석중',     activeCls: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'completed',    label: '완료',       activeCls: 'bg-green-100 text-green-700 border-green-300' },
]

function extractText(doc, maxChars = 200) {
  if (!doc || !Array.isArray(doc.content)) return ''
  let text = ''
  function walk(nodes) {
    for (const node of nodes ?? []) {
      if (node.type === 'text') text += node.text ?? ''
      if (node.content) walk(node.content)
      if (text.length >= maxChars) return
    }
  }
  walk(doc.content)
  return text.slice(0, maxChars)
}

function LinkedExpList({ ids, allExperiments, onNavigate }) {
  const items = ids
    .map((id) => allExperiments.find((e) => e.id === id))
    .filter(Boolean)
  if (items.length === 0) return null
  return (
    <div className="space-y-1">
      {items.map((exp) => (
        <button
          key={exp.id}
          onClick={() => onNavigate(exp.id)}
          className="w-full text-left text-xs flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <span className="font-mono text-gray-400 shrink-0">{exp.id}</span>
          <span className="text-blue-600 truncate">{exp.title || '(제목 없음)'}</span>
        </button>
      ))}
    </div>
  )
}

export default function GraphSidePanel({ experiment, allExperiments, onClose, onNavigate, onStatusChange }) {
  const navigate = useNavigate()
  const [mounted, setMounted] = useState(false)
  const [localOutcomePopup, setLocalOutcomePopup] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
    return () => setMounted(false)
  }, [])

  const statusLabel  = STATUS_LABELS[experiment.status] ?? null
  const outcomeLabel = experiment.status === 'completed'
    ? (OUTCOME_LABELS[experiment.outcome] ?? null)
    : null
  const procedureSummary = extractText(experiment.procedure?.common ?? null)
  const precedingIds = experiment.connections?.precedingExperiments ?? []
  const followingIds = experiment.connections?.followingExperiments ?? []

  return (
    <>
      {localOutcomePopup && (
        <OutcomePopup
          mode="complete"
          currentOutcome={experiment.outcome}
          onSelect={(outcome) => {
            onStatusChange?.(experiment.id, 'completed', outcome)
            setLocalOutcomePopup(false)
          }}
          onCancel={() => setLocalOutcomePopup(false)}
        />
      )}

      {/* dim overlay */}
      <div className="fixed inset-0 z-30" onClick={onClose} />

      {/* panel */}
      <div
        className={`fixed right-0 top-0 h-full w-80 max-sm:w-full z-40 bg-white shadow-2xl flex flex-col transition-transform duration-200 ${
          mounted ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <span className="font-mono text-xs text-gray-400">{experiment.id}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <h2 className="text-base font-bold text-gray-900">{experiment.title || '(제목 없음)'}</h2>

          {/* badges */}
          <div className="flex flex-wrap gap-1.5">
            {statusLabel && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{statusLabel}</span>
            )}
            {experiment.status === 'completed' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">완료</span>
            )}
            {outcomeLabel && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{outcomeLabel}</span>
            )}
          </div>

          {/* status 변경 버튼 그룹 */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">상태 변경</div>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map((opt) => {
                const isActive = experiment.status === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      if (isActive && opt.value !== 'completed') return
                      if (opt.value === 'completed') {
                        setLocalOutcomePopup(true)
                      } else {
                        onStatusChange?.(experiment.id, opt.value)
                      }
                    }}
                    className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                      isActive
                        ? opt.activeCls
                        : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* goal */}
          {experiment.goal && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">목표</div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{experiment.goal}</p>
            </div>
          )}

          {/* procedure summary */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">절차 요약</div>
            {procedureSummary ? (
              <p className="text-sm text-gray-600">{procedureSummary}</p>
            ) : (
              <p className="text-sm text-gray-300">절차 정보 없음</p>
            )}
          </div>

          {/* preceding */}
          {precedingIds.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">선행 실험</div>
              <LinkedExpList ids={precedingIds} allExperiments={allExperiments} onNavigate={onNavigate} />
            </div>
          )}

          {/* following */}
          {followingIds.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">후속 실험</div>
              <LinkedExpList ids={followingIds} allExperiments={allExperiments} onNavigate={onNavigate} />
            </div>
          )}
        </div>

        {/* footer */}
        <div className="px-4 py-3 border-t border-gray-100 shrink-0">
          <button
            onClick={() => navigate(`/experiments/${experiment.id}`)}
            className="w-full py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            노트 열기
          </button>
        </div>
      </div>
    </>
  )
}

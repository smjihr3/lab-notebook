const OUTCOME_OPTIONS = [
  {
    value: 'success',
    label: '성공',
    bg: '#dcfce7', border: '#16a34a', text: '#15803d', hoverBg: '#bbf7d0',
  },
  {
    value: 'partial',
    label: '부분 성공',
    bg: '#ffedd5', border: '#f97316', text: '#c2410c', hoverBg: '#fed7aa',
  },
  {
    value: 'failed',
    label: '실패',
    bg: '#fee2e2', border: '#ef4444', text: '#b91c1c', hoverBg: '#fecaca',
  },
  {
    value: 'unknown',
    label: '미정',
    bg: '#f3f4f6', border: '#9ca3af', text: '#4b5563', hoverBg: '#e5e7eb',
  },
]

export default function OutcomePopup({ mode, currentOutcome, onSelect, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-72 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">
          {mode === 'complete' ? '완료로 전환' : 'Outcome 변경'}
        </h3>
        <p className="text-xs text-gray-500 mb-4">실험 결과를 선택하세요.</p>

        <div className="flex flex-col gap-2 mb-4">
          {OUTCOME_OPTIONS.map((opt) => {
            const isActive = mode === 'change' && currentOutcome === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => onSelect(opt.value)}
                style={{
                  backgroundColor: opt.bg,
                  border: `1.5px solid ${opt.border}`,
                  color: opt.text,
                  borderRadius: 10,
                  outline: isActive ? `3px solid ${opt.border}` : undefined,
                  outlineOffset: isActive ? '2px' : undefined,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = opt.hoverBg }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = opt.bg }}
                className="py-2 text-xs font-medium transition-colors"
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        <button
          onClick={onCancel}
          className="w-full py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  )
}

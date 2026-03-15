const OUTCOME_OPTIONS = [
  { value: 'success', label: '성공',     cls: 'bg-green-500  hover:bg-green-600  text-white' },
  { value: 'partial', label: '부분 성공', cls: 'bg-orange-500 hover:bg-orange-600 text-white' },
  { value: 'failed',  label: '실패',     cls: 'bg-red-500    hover:bg-red-600    text-white' },
  { value: 'unknown', label: '미정',     cls: 'bg-gray-400   hover:bg-gray-500   text-white' },
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
          {OUTCOME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              className={`py-2 text-xs font-medium rounded-lg transition-colors ${opt.cls} ${
                mode === 'change' && currentOutcome === opt.value
                  ? 'ring-2 ring-offset-1 ring-current'
                  : ''
              }`}
            >
              {opt.label}
            </button>
          ))}
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

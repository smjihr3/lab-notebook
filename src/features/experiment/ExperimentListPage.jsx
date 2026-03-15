import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../store/authStore.jsx'
import { useDrive } from '../../store/driveStore'
import { getAllExperiments } from '../../services/drive/driveService'

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
  const { accessToken } = useAuth()
  const { folderMap } = useDrive()
  const [experiments, setExperiments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!folderMap || !accessToken) return
    getAllExperiments({ token: accessToken, folderMap })
      .then(setExperiments)
      .finally(() => setLoading(false))
  }, [folderMap, accessToken])

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
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

      {loading ? (
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
            return (
              <li key={exp.id}>
                <button
                  onClick={() => navigate(`/experiments/${exp.id}`)}
                  className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
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
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

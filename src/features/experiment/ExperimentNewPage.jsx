import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExperiments } from '../../store/experimentStore'

function generateExpId(experiments) {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const todayPrefix = `${yy}${mm}${dd}`

  let maxNum = 0
  for (const exp of experiments) {
    const newFmt = exp.id.match(/^(\d{6})-(\d{3})$/)
    if (newFmt && newFmt[1] === todayPrefix) {
      maxNum = Math.max(maxNum, parseInt(newFmt[2], 10))
      continue
    }
    const oldFmt = exp.id.match(/^exp_(\d{6})_(\d{3})$/)
    if (oldFmt && oldFmt[1] === todayPrefix) {
      maxNum = Math.max(maxNum, parseInt(oldFmt[2], 10))
    }
  }

  return `${todayPrefix}-${String(maxNum + 1).padStart(3, '0')}`
}

function generateTitle(experiments) {
  const base = '새 실험 노트'
  const titles = new Set(experiments.map((e) => e.title))
  if (!titles.has(base)) return base
  let n = 2
  while (titles.has(`${base} (${n})`)) n++
  return `${base} (${n})`
}

export default function ExperimentNewPage() {
  const navigate = useNavigate()
  // isLoading이 아닌 isReady 사용: 스토어 초기화 완료 후에만 생성 시도
  const { experiments, isReady, createExperiment } = useExperiments()
  const [error, setError] = useState(null)
  const didCreate = useRef(false)  // 중복 생성 방지

  useEffect(() => {
    if (!isReady) return           // 스토어 초기화 완료 전엔 대기
    if (didCreate.current) return  // 이미 생성 시작됨
    didCreate.current = true

    const newExp = {
      id: generateExpId(experiments),
      projectId: null,
      title: generateTitle(experiments),
      createdAt: new Date().toISOString(),
      dataReceivedAt: null,
      status: 'in_progress',
      outcome: 'unknown',
      goal: '',
      tags: [],
      procedure: { common: null, conditionTable: {}, observations: {} },
      dataBlocks: [],
      conclusion: null,
      connections: { precedingExperiments: [], followingExperiments: [], references: [] },
    }

    createExperiment(newExp)
      .then((saved) => {
        navigate(`/experiments/${saved.id}`, { replace: true })
      })
      .catch((err) => {
        console.error('새 실험 노트 생성 실패:', err)
        didCreate.current = false  // 재시도 가능하도록 리셋
        setError(err?.message ?? '새 실험 노트 생성에 실패했습니다.')
      })
  }, [isReady])

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-red-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <p className="text-sm text-red-500 text-center max-w-xs">{error}</p>
        <button
          onClick={() => navigate('/experiments', { replace: true })}
          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
        >
          목록으로 돌아가기
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-400">새 실험 노트 생성 중...</p>
    </div>
  )
}

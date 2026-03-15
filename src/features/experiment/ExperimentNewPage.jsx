import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../store/authStore.jsx'
import { useDrive } from '../../store/driveStore'
import { getAllExperiments, saveExperiment } from '../../services/drive/driveService'

function generateExpId(count) {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const nnn = String(count + 1).padStart(3, '0')
  return `exp_${yy}${mm}${dd}_${nnn}`
}

export default function ExperimentNewPage() {
  const navigate = useNavigate()
  const { accessToken } = useAuth()
  const { folderMap } = useDrive()

  useEffect(() => {
    if (!folderMap || !accessToken) return
    let cancelled = false

    async function create() {
      const list = await getAllExperiments({ token: accessToken, folderMap })
      if (cancelled) return

      const newExp = {
        id: generateExpId(list.length),
        projectId: null,
        title: '새 실험 노트',
        createdAt: new Date().toISOString(),
        dataReceivedAt: null,
        status: 'in_progress',
        outcome: 'unknown',
        goal: '',
        tags: [],
        procedure: { common: null, conditionTable: {}, observations: {} },
        dataBlocks: [],
        conclusion: {},
        connections: { precedingExperiments: [], followingExperiments: [], references: [] },
      }

      const saved = await saveExperiment(newExp, { token: accessToken, folderMap })
      if (!cancelled) {
        navigate(`/experiments/${saved.id}`, { replace: true })
      }
    }

    create().catch(console.error)
    return () => { cancelled = true }
  }, [folderMap, accessToken])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-400">새 실험 노트 생성 중...</p>
    </div>
  )
}

import { useParams } from 'react-router-dom'

export default function ExperimentDetailPage() {
  const { id } = useParams()
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800">실험 노트 상세</h1>
      <p className="mt-2 text-gray-500">ID: {id}</p>
    </div>
  )
}

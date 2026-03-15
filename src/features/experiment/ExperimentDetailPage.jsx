import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useAuth } from '../../store/authStore.jsx'
import { useDrive } from '../../store/driveStore'
import { getAllExperiments, saveExperiment } from '../../services/drive/driveService'

const STATUS_OPTIONS = [
  { value: 'in_progress',  label: '진행중' },
  { value: 'data_pending', label: '데이터 대기' },
  { value: 'analyzing',   label: '분석중' },
  { value: 'completed',   label: '완료' },
]

const STATUS_CLS = {
  in_progress:  'bg-blue-100 text-blue-700',
  data_pending: 'bg-yellow-100 text-yellow-700',
  analyzing:    'bg-orange-100 text-orange-700',
  completed:    'bg-green-100 text-green-700',
}

export default function ExperimentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { accessToken } = useAuth()
  const { folderMap } = useDrive()

  const [experiment, setExperiment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState('saved') // 'saved' | 'saving' | 'unsaved'
  const [tagInput, setTagInput] = useState('')

  // 최신 experiment를 에디터 onUpdate에서 참조하기 위한 ref
  const latestRef = useRef(null)
  const saveTimerRef = useRef(null)
  const accessTokenRef = useRef(accessToken)
  const folderMapRef = useRef(folderMap)

  useEffect(() => { accessTokenRef.current = accessToken }, [accessToken])
  useEffect(() => { folderMapRef.current = folderMap }, [folderMap])

  // ── 디바운스 저장 ───────────────────────────────────────────
  const debouncedSave = useCallback((data) => {
    setSaveStatus('unsaved')
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        const saved = await saveExperiment(data, {
          token: accessTokenRef.current,
          folderMap: folderMapRef.current,
        })
        latestRef.current = saved
        setExperiment(saved)
        setSaveStatus('saved')
      } catch {
        setSaveStatus('unsaved')
      }
    }, 2000)
  }, [])

  // ── 필드 업데이트 헬퍼 ─────────────────────────────────────
  function update(changes) {
    setExperiment((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...changes }
      latestRef.current = next
      debouncedSave(next)
      return next
    })
  }

  // ── Tiptap 에디터 ──────────────────────────────────────────
  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
    onUpdate: ({ editor }) => {
      const current = latestRef.current
      if (!current) return
      const next = {
        ...current,
        procedure: { ...current.procedure, common: editor.getJSON() },
      }
      latestRef.current = next
      setExperiment(next)
      debouncedSave(next)
    },
  })

  // ── 데이터 로드 ────────────────────────────────────────────
  useEffect(() => {
    if (!folderMap || !accessToken) return
    getAllExperiments({ token: accessToken, folderMap }).then((list) => {
      const found = list.find((e) => e.id === id)
      if (found) {
        latestRef.current = found
        setExperiment(found)
      }
      setLoading(false)
    })
  }, [folderMap, accessToken, id])

  // 에디터 준비 후 초기 content 세팅
  useEffect(() => {
    if (editor && experiment?.procedure?.common && editor.isEmpty) {
      editor.commands.setContent(experiment.procedure.common)
    }
  }, [editor, experiment?.id])

  // ── 태그 ──────────────────────────────────────────────────
  function addTag(raw) {
    const tag = raw.trim()
    if (!tag || experiment?.tags?.includes(tag)) return
    update({ tags: [...(experiment?.tags ?? []), tag] })
    setTagInput('')
  }

  function handleTagKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagInput)
    }
  }

  // ── 렌더 ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!experiment) {
    return <div className="p-6 text-sm text-gray-400">실험 노트를 찾을 수 없습니다.</div>
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-6">

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/experiments')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          목록으로
        </button>
        <span className={`text-xs transition-colors ${
          saveStatus === 'saving'  ? 'text-blue-500' :
          saveStatus === 'unsaved' ? 'text-orange-400' :
          'text-gray-400'
        }`}>
          {saveStatus === 'saving' ? '저장 중...' : saveStatus === 'unsaved' ? '변경됨' : '저장됨'}
        </span>
      </div>

      {/* 제목 */}
      <input
        className="w-full text-2xl font-bold text-gray-900 bg-transparent border-none outline-none placeholder-gray-300 mb-4"
        value={experiment.title}
        onChange={(e) => update({ title: e.target.value })}
        placeholder="실험 제목"
      />

      {/* 상태 + 날짜 */}
      <div className="flex items-center gap-3 mb-6">
        <select
          value={experiment.status}
          onChange={(e) => update({ status: e.target.value })}
          className={`text-xs font-medium px-2.5 py-1 rounded-full border-none outline-none cursor-pointer ${STATUS_CLS[experiment.status] ?? 'bg-gray-100 text-gray-600'}`}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">
          {experiment.createdAt ? new Date(experiment.createdAt).toLocaleDateString('ko-KR') : ''}
        </span>
        <span className="text-xs text-gray-300 font-mono">{experiment.id}</span>
      </div>

      {/* 목표 */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          목표
        </label>
        <textarea
          className="w-full text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-blue-400 resize-none transition-colors"
          rows={3}
          value={experiment.goal}
          onChange={(e) => update({ goal: e.target.value })}
          placeholder="이 실험의 목표를 입력하세요"
        />
      </div>

      {/* 태그 */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          태그
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {experiment.tags?.map((tag) => (
            <span
              key={tag}
              onClick={() => update({ tags: experiment.tags.filter((t) => t !== tag) })}
              className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full cursor-pointer hover:bg-red-50 hover:text-red-500 transition-colors"
            >
              {tag}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
              </svg>
            </span>
          ))}
        </div>
        <input
          className="w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-400 transition-colors"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          onBlur={() => tagInput.trim() && addTag(tagInput)}
          placeholder="태그 입력 후 Enter 또는 쉼표"
        />
      </div>

      {/* 실험 절차 (Tiptap) */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          실험 절차
        </label>
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white focus-within:border-blue-400 transition-colors">
          <EditorContent
            editor={editor}
            className="px-4 py-3 min-h-[160px] text-sm text-gray-800 [&_.ProseMirror]:outline-none [&_.ProseMirror_p]:my-1 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_h1]:text-xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h2]:text-lg [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-gray-300 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:text-gray-500 [&_.ProseMirror_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_.is-editor-empty:first-child::before]:text-gray-300 [&_.ProseMirror_.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_.is-editor-empty:first-child::before]:pointer-events-none"
          />
        </div>
      </div>

    </div>
  )
}

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { useAuth } from '../../store/authStore.jsx'
import { useDrive } from '../../store/driveStore'
import { getAllExperiments, saveExperiment, deleteExperiment } from '../../services/drive/driveService'

// ── Excel/HTML 표 파싱 헬퍼 ───────────────────────────────────

function parseInlineNodes(el) {
  const nodes = []
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent) nodes.push({ type: 'text', text: child.textContent })
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue

    const tag = child.tagName.toLowerCase()
    if (tag === 'br') { nodes.push({ type: 'hardBreak' }); continue }

    const inner = parseInlineNodes(child)
    const fw = child.style?.fontWeight ?? ''
    const isBold = tag === 'strong' || tag === 'b' || fw === 'bold' || parseInt(fw) >= 600
    const isItalic = tag === 'em' || tag === 'i' || child.style?.fontStyle === 'italic'

    if (isBold || isItalic) {
      inner.forEach((n) => {
        if (n.type !== 'text') { nodes.push(n); return }
        const marks = [...(n.marks ?? [])]
        if (isBold)   marks.push({ type: 'bold' })
        if (isItalic) marks.push({ type: 'italic' })
        nodes.push({ ...n, marks })
      })
    } else {
      nodes.push(...inner)
    }
  }
  return nodes
}

function cellToTiptapNode(td, colwidth, isHeader) {
  const inlineContent = parseInlineNodes(td)
  return {
    type: isHeader ? 'tableHeader' : 'tableCell',
    attrs: {
      colspan:  parseInt(td.getAttribute('colspan')  ?? '1'),
      rowspan:  parseInt(td.getAttribute('rowspan')  ?? '1'),
      colwidth: colwidth ? [colwidth] : null,
    },
    content: [{
      type: 'paragraph',
      content: inlineContent.length > 0 ? inlineContent : undefined,
    }],
  }
}

function htmlTableToTiptap(tableEl) {
  // colgroup → col widths
  const colwidths = []
  tableEl.querySelectorAll('colgroup col, col').forEach((col) => {
    const raw = col.style?.width || col.getAttribute('width') || ''
    const px = parseInt(raw)
    colwidths.push(isNaN(px) ? null : px)
  })

  const rows = []
  tableEl.querySelectorAll('tr').forEach((tr) => {
    const cells = []
    tr.querySelectorAll('td, th').forEach((td, ci) => {
      const isHeader = td.tagName === 'TH' || !!td.closest('thead')
      cells.push(cellToTiptapNode(td, colwidths[ci] ?? null, isHeader))
    })
    if (cells.length > 0) rows.push({ type: 'tableRow', content: cells })
  })

  return rows.length > 0 ? { type: 'table', content: rows } : null
}

// ── 상수 ─────────────────────────────────────────────────────

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

// ── 툴바 버튼 ─────────────────────────────────────────────────

function TBtn({ onClick, title, children, active }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      className={`px-2 py-1 text-xs rounded transition-colors ${
        active ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-600'
      }`}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="w-px h-4 bg-gray-200 mx-0.5 self-center" />
}

// ── 컴포넌트 ──────────────────────────────────────────────────

export default function ExperimentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { accessToken } = useAuth()
  const { folderMap } = useDrive()

  const [experiment, setExperiment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState('saved')
  const [tagInput, setTagInput] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const latestRef      = useRef(null)
  const saveTimerRef   = useRef(null)
  const accessTokenRef = useRef(accessToken)
  const folderMapRef   = useRef(folderMap)

  useEffect(() => { accessTokenRef.current = accessToken }, [accessToken])
  useEffect(() => { folderMapRef.current   = folderMap   }, [folderMap])

  // ── 디바운스 저장 ────────────────────────────────────────────
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

  // ── 필드 업데이트 ────────────────────────────────────────────
  function update(changes) {
    setExperiment((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...changes }
      latestRef.current = next
      debouncedSave(next)
      return next
    })
  }

  // ── Tiptap 에디터 ────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: '',
    editorProps: {
      handlePaste(view, event) {
        const html = event.clipboardData?.getData('text/html')
        if (!html) return false

        const doc = new DOMParser().parseFromString(html, 'text/html')
        const tableEl = doc.querySelector('table')
        if (!tableEl) return false

        const tableJson = htmlTableToTiptap(tableEl)
        if (!tableJson) return false

        try {
          const node = view.state.schema.nodeFromJSON(tableJson)
          const tr = view.state.tr.replaceSelectionWith(node)
          view.dispatch(tr)
          event.preventDefault()
          return true
        } catch (err) {
          console.warn('Table paste failed, falling back to default:', err)
          return false
        }
      },
    },
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

  // ── 데이터 로드 ──────────────────────────────────────────────
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

  useEffect(() => {
    if (editor && experiment?.procedure?.common && editor.isEmpty) {
      editor.commands.setContent(experiment.procedure.common)
    }
  }, [editor, experiment?.id])

  // ── 삭제 ─────────────────────────────────────────────────────
  async function handleDelete() {
    if (!experiment) return
    setDeleting(true)
    try {
      await deleteExperiment(experiment, { token: accessToken })
      navigate('/experiments', { replace: true })
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  // ── 태그 ─────────────────────────────────────────────────────
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

  // ── 렌더 ─────────────────────────────────────────────────────
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

        <div className="flex items-center gap-3">
          <span className={`text-xs transition-colors ${
            saveStatus === 'saving'  ? 'text-blue-500' :
            saveStatus === 'unsaved' ? 'text-orange-400' :
            'text-gray-400'
          }`}>
            {saveStatus === 'saving' ? '저장 중...' : saveStatus === 'unsaved' ? '변경됨' : '저장됨'}
          </span>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-500 transition-colors"
              title="삭제"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
              삭제
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              <span className="text-xs text-red-700 font-medium">정말 삭제하시겠습니까?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs font-medium text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded disabled:opacity-50 transition-colors"
              >
                {deleting ? '...' : '삭제'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                취소
              </button>
            </div>
          )}
        </div>
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
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">목표</label>
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
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">태그</label>
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
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">실험 절차</label>
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white focus-within:border-blue-400 transition-colors">

          {/* 툴바 */}
          <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50">
            <TBtn onClick={() => editor?.chain().focus().toggleBold().run()}    title="굵게"   active={editor?.isActive('bold')}><strong>B</strong></TBtn>
            <TBtn onClick={() => editor?.chain().focus().toggleItalic().run()}  title="기울임" active={editor?.isActive('italic')}><em>I</em></TBtn>
            <TBtn onClick={() => editor?.chain().focus().toggleStrike().run()}  title="취소선" active={editor?.isActive('strike')}><s>S</s></TBtn>
            <Divider />
            <TBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} title="제목 1" active={editor?.isActive('heading', { level: 1 })}>H1</TBtn>
            <TBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="제목 2" active={editor?.isActive('heading', { level: 2 })}>H2</TBtn>
            <Divider />
            <TBtn onClick={() => editor?.chain().focus().toggleBulletList().run()}   title="글머리 목록" active={editor?.isActive('bulletList')}>• 목록</TBtn>
            <TBtn onClick={() => editor?.chain().focus().toggleOrderedList().run()}  title="번호 목록"  active={editor?.isActive('orderedList')}>1. 목록</TBtn>
            <Divider />
            <TBtn onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="표 삽입 (3×3)">표 삽입</TBtn>
            <TBtn onClick={() => editor?.chain().focus().addColumnAfter().run()}  title="열 추가">+열</TBtn>
            <TBtn onClick={() => editor?.chain().focus().addRowAfter().run()}     title="행 추가">+행</TBtn>
            <TBtn onClick={() => editor?.chain().focus().deleteTable().run()}     title="표 삭제">표 삭제</TBtn>
          </div>

          {/* 에디터 본문 */}
          <EditorContent
            editor={editor}
            className="px-4 py-3 min-h-[160px] text-sm text-gray-800
              [&_.ProseMirror]:outline-none
              [&_.ProseMirror_p]:my-1
              [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5
              [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5
              [&_.ProseMirror_h1]:text-xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:my-2
              [&_.ProseMirror_h2]:text-lg [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:my-1.5
              [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-gray-300 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:text-gray-500"
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">엑셀에서 복사한 표를 그대로 붙여넣기 할 수 있습니다.</p>
      </div>

    </div>
  )
}

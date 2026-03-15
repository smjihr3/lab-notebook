import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, useBlocker } from 'react-router-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { useAuth } from '../../store/authStore.jsx'
import { useDrive } from '../../store/driveStore'
import { useExperiments } from '../../store/experimentStore'
import { uploadBinaryFile } from '../../services/drive/driveClient'

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

// ── DriveImage 컴포넌트 ───────────────────────────────────────

function DriveImage({ fileId, localUrl, accessToken, className, onClick }) {
  const [src, setSrc] = useState(localUrl ?? null)

  useEffect(() => {
    if (localUrl) { setSrc(localUrl); return }
    if (!fileId || !accessToken) return
    let objectUrl = null
    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.blob() })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl) })
      .catch(console.error)
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [fileId, localUrl, accessToken])

  if (!src) return <div className={`bg-gray-100 animate-pulse rounded ${className}`} />
  return (
    <img
      src={src}
      alt=""
      className={className}
      onClick={onClick ? () => onClick(src) : undefined}
    />
  )
}

// ── 분석 종류 ────────────────────────────────────────────────

const DEFAULT_ANALYSIS_TYPES = ['PXRD', 'IR', 'NMR', 'OM', 'SEM', 'Photo', 'BET']

function AnalysisTypeBadge({ value, allTypes, onChange }) {
  const [open, setOpen] = useState(false)
  const [customInput, setCustomInput] = useState('')
  const btnRef = useRef(null)
  const dropRef = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (btnRef.current?.contains(e.target) || dropRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function toggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
    }
    setOpen((p) => !p)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="text-xs px-2 py-0.5 rounded-full bg-black/50 text-white font-medium hover:bg-black/70 transition-colors backdrop-blur-sm"
      >
        {value}
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 min-w-[120px]"
        >
          {allTypes.map((t) => (
            <button
              key={t}
              type="button"
              className={`w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50 transition-colors ${t === value ? 'font-semibold text-blue-600' : 'text-gray-700'}`}
              onClick={() => { onChange(t); setOpen(false) }}
            >
              {t}
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <input
              className="w-full text-xs border border-gray-200 rounded px-1.5 py-0.5 outline-none focus:border-blue-400"
              placeholder="직접 입력"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customInput.trim()) {
                  onChange(customInput.trim())
                  setCustomInput('')
                  setOpen(false)
                }
              }}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

// ── 데이터 블록 섹션 ─────────────────────────────────────────

function DataBlocksSection({ blocks, onChange, accessToken, uploadFolderId }) {
  const [localUrls, setLocalUrls] = useState({})
  const [lightbox, setLightbox] = useState(null)
  const blocksRef = useRef(blocks)
  useEffect(() => { blocksRef.current = blocks }, [blocks])

  // 캡션 textarea 자동 높이 조절
  const captionRefs = useRef({})
  useEffect(() => {
    for (const el of Object.values(captionRefs.current)) {
      if (!el) continue
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [blocks])

  const allTypes = (() => {
    const extra = new Set()
    for (const b of blocks) {
      for (const it of b.items ?? []) {
        if (it.analysisType && !DEFAULT_ANALYSIS_TYPES.includes(it.analysisType)) {
          extra.add(it.analysisType)
        }
      }
    }
    return [...DEFAULT_ANALYSIS_TYPES, ...extra]
  })()

  function _updateBlocks(updater) {
    const newBlocks = typeof updater === 'function' ? updater(blocksRef.current) : updater
    blocksRef.current = newBlocks
    onChange(newBlocks)
  }

  function addBlock() {
    const blockId = `block_${Date.now()}`
    _updateBlocks((prev) => [...prev, { id: blockId, caption: '', items: [] }])
  }

  function deleteBlock(blockId) {
    _updateBlocks((prev) => prev.filter((b) => b.id !== blockId))
  }

  function updateBlock(blockId, changes) {
    _updateBlocks((prev) => prev.map((b) => b.id === blockId ? { ...b, ...changes } : b))
  }

  function updateItem(blockId, itemId, changes) {
    _updateBlocks((prev) =>
      prev.map((b) => b.id !== blockId ? b : {
        ...b,
        items: b.items.map((it) => it.id !== itemId ? it : { ...it, ...changes }),
      })
    )
  }

  function deleteItem(blockId, itemId) {
    _updateBlocks((prev) =>
      prev.map((b) => b.id !== blockId ? b : {
        ...b,
        items: b.items.filter((it) => it.id !== itemId),
      })
    )
    setLocalUrls((prev) => { const n = { ...prev }; delete n[itemId]; return n })
  }

  async function handleImageFiles(files, blockId) {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue

      const itemId = `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const localUrl = URL.createObjectURL(file)
      setLocalUrls((prev) => ({ ...prev, [itemId]: localUrl }))

      const newItem = { id: itemId, analysisType: 'PXRD', driveFileId: '', thumbnailUrl: '' }
      _updateBlocks((prev) =>
        prev.map((b) => b.id !== blockId ? b : { ...b, items: [...b.items, newItem] })
      )

      try {
        const ext = file.type.split('/')[1] || 'png'
        const namedFile = new File([file], `${itemId}.${ext}`, { type: file.type })
        const uploaded = await uploadBinaryFile(namedFile, uploadFolderId, accessToken)
        _updateBlocks((prev) =>
          prev.map((b) => b.id !== blockId ? b : {
            ...b,
            items: b.items.map((it) =>
              it.id !== itemId ? it : { ...it, driveFileId: uploaded.id }
            ),
          })
        )
      } catch (err) {
        console.error('Image upload failed:', err)
        deleteItem(blockId, itemId)
      }
    }
  }

  function handlePaste(e, blockId) {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (files.length > 0) { e.preventDefault(); handleImageFiles(files, blockId) }
  }

  function handleFileInput(e, blockId) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    handleImageFiles(files, blockId)
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
          데이터
        </label>
        <button
          type="button"
          onClick={addBlock}
          className="flex items-center gap-1 text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          데이터 추가
        </button>
      </div>

      {/* 블록 컨테이너: flex-wrap으로 가로 배치 */}
      <div className="flex flex-wrap gap-2 items-start">
        {blocks.map((block) => (
          <div
            key={block.id}
            className="inline-flex flex-col items-start border border-gray-200 rounded-lg bg-white"
            onPaste={(e) => handlePaste(e, block.id)}
          >
            {/* 이미지 영역 (이미지가 있을 때만 표시) */}
            {block.items.length > 0 && (
              <div className="p-2 flex flex-wrap gap-2 w-fit self-start">
                {block.items.map((item) => (
                  <div key={item.id} className="relative group w-fit">
                    <DriveImage
                      fileId={item.driveFileId || null}
                      localUrl={localUrls[item.id] ?? null}
                      accessToken={accessToken}
                      className="h-40 w-auto object-contain rounded border border-gray-100 bg-gray-50 cursor-zoom-in"
                      onClick={(src) => setLightbox(src)}
                    />
                    {/* 분석 종류 라벨 — 좌상단 반투명 오버레이 */}
                    <div className="absolute top-1 left-1 opacity-50 group-hover:opacity-100 transition-opacity">
                      <AnalysisTypeBadge
                        value={item.analysisType}
                        allTypes={allTypes}
                        onChange={(t) => updateItem(block.id, item.id, { analysisType: t })}
                      />
                    </div>
                    {/* 이미지 삭제 버튼 */}
                    <button
                      type="button"
                      onClick={() => deleteItem(block.id, item.id)}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 bg-white/80 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded transition-all"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 캡션 + 이미지 추가 버튼 + 블록 삭제 */}
            <div className={`flex items-end gap-0.5 px-2 self-stretch ${block.items.length > 0 ? 'border-t border-gray-100 py-1.5' : 'py-1.5'}`}>
              <textarea
                ref={(el) => { captionRefs.current[block.id] = el }}
                className={`flex-1 text-xs text-gray-700 bg-transparent outline-none placeholder-gray-300 resize-none overflow-hidden leading-relaxed ${block.items.length === 0 ? 'min-w-[120px]' : 'min-w-0 w-0'}`}
                value={block.caption ?? ''}
                rows={1}
                onChange={(e) => {
                  e.target.style.height = 'auto'
                  e.target.style.height = `${e.target.scrollHeight}px`
                  updateBlock(block.id, { caption: e.target.value })
                }}
                placeholder="캡션"
              />
              {/* 이미지 추가 아이콘 버튼 */}

              <label
                className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 cursor-pointer transition-colors"
                title="이미지 추가"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                </svg>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileInput(e, block.id)}
                />
              </label>
              {/* 블록 삭제 버튼 */}
              <button
                type="button"
                onClick={() => deleteBlock(block.id)}
                className="flex-shrink-0 p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                title="블록 삭제"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-full object-contain rounded shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setLightbox(null)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
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

function EditorToolbar({ editor }) {
  if (!editor) return null
  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50">
      <TBtn onClick={() => editor.chain().focus().toggleBold().run()}    title="굵게"   active={editor.isActive('bold')}><strong>B</strong></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleItalic().run()}  title="기울임" active={editor.isActive('italic')}><em>I</em></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleStrike().run()}  title="취소선" active={editor.isActive('strike')}><s>S</s></TBtn>
      <Divider />
      <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="제목 1" active={editor.isActive('heading', { level: 1 })}>H1</TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="제목 2" active={editor.isActive('heading', { level: 2 })}>H2</TBtn>
      <Divider />
      <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()}   title="글머리 목록" active={editor.isActive('bulletList')}>• 목록</TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()}  title="번호 목록"  active={editor.isActive('orderedList')}>1. 목록</TBtn>
      <Divider />
      <TBtn onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="표 삽입 (3×3)">표 삽입</TBtn>
      <TBtn onClick={() => editor.chain().focus().addColumnAfter().run()}  title="열 추가">+열</TBtn>
      <TBtn onClick={() => editor.chain().focus().addRowAfter().run()}     title="행 추가">+행</TBtn>
      <TBtn onClick={() => editor.chain().focus().deleteTable().run()}     title="표 삭제">표 삭제</TBtn>
    </div>
  )
}

const EDITOR_CONTENT_CLS = `px-4 py-3 min-h-[160px] text-sm text-gray-800
  [&_.ProseMirror]:outline-none
  [&_.ProseMirror_p]:my-1
  [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5
  [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5
  [&_.ProseMirror_h1]:text-xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:my-2
  [&_.ProseMirror_h2]:text-lg [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:my-1.5
  [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-gray-300 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:text-gray-500`

const TIPTAP_EXTENSIONS = [
  StarterKit,
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
]

// ── 메인 컴포넌트 ─────────────────────────────────────────────

export default function ExperimentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { accessToken } = useAuth()
  const { folderMap } = useDrive()
  const { isReady, getExperiment, updateExperiment, deleteExperiment } = useExperiments()

  const [experiment, setExperiment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const latestRef = useRef(null)

  // ── 미저장 상태에서 이탈 차단 ────────────────────────────────
  const blocker = useBlocker(isDirty)

  // ── 수동 저장 ────────────────────────────────────────────────
  async function handleSave() {
    if (!latestRef.current) return
    setSaving(true)
    try {
      const saved = await updateExperiment(latestRef.current)
      latestRef.current = saved
      setExperiment(saved)
      setIsDirty(false)
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  // ── 필드 업데이트 (로컬 state만 변경, 저장 없음) ─────────────
  function update(changes) {
    setExperiment((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...changes }
      latestRef.current = next
      return next
    })
    setIsDirty(true)
  }

  // ── Tiptap: 실험 절차 ────────────────────────────────────────
  const procedureEditor = useEditor({
    extensions: TIPTAP_EXTENSIONS,
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
          view.dispatch(view.state.tr.replaceSelectionWith(node))
          event.preventDefault()
          return true
        } catch (err) {
          console.warn('Table paste failed:', err)
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
      setIsDirty(true)
    },
  })

  // ── Tiptap: 결론 ─────────────────────────────────────────────
  const conclusionEditor = useEditor({
    extensions: TIPTAP_EXTENSIONS,
    content: '',
    onUpdate: ({ editor }) => {
      const current = latestRef.current
      if (!current) return
      const next = { ...current, conclusion: editor.getJSON() }
      latestRef.current = next
      setExperiment(next)
      setIsDirty(true)
    },
  })

  // ── 데이터 로드 ──────────────────────────────────────────────
  useEffect(() => {
    if (!isReady) return
    setLoading(true)
    setIsDirty(false)
    getExperiment(id).then((found) => {
      if (found) {
        latestRef.current = found
        setExperiment(found)
      }
    }).catch(console.error).finally(() => setLoading(false))
  }, [isReady, id])

  // procedure 에디터에 내용 주입 (초기 로드 1회, onUpdate 발생 안 함)
  useEffect(() => {
    if (procedureEditor && experiment?.procedure?.common && procedureEditor.isEmpty) {
      procedureEditor.commands.setContent(experiment.procedure.common, false)
    }
  }, [procedureEditor, experiment?.id])

  // conclusion 에디터에 내용 주입 (초기 로드 1회, onUpdate 발생 안 함)
  useEffect(() => {
    if (conclusionEditor && experiment?.conclusion && conclusionEditor.isEmpty) {
      conclusionEditor.commands.setContent(experiment.conclusion, false)
    }
  }, [conclusionEditor, experiment?.id])

  // ── 삭제 ─────────────────────────────────────────────────────
  async function handleDelete() {
    if (!experiment) return
    setDeleting(true)
    try {
      await deleteExperiment(experiment.id)
      setIsDirty(false)   // blocker가 삭제 후 이동을 막지 않도록
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

      {/* 미저장 이탈 경고 다이얼로그 */}
      {blocker.state === 'blocked' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-sm font-semibold text-gray-900 mb-1.5">저장하지 않은 변경사항</h3>
            <p className="text-sm text-gray-500 mb-5">변경사항이 저장되지 않았습니다. 그래도 나가시겠습니까?</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => blocker.reset()}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => blocker.proceed()}
                className="px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                나가기
              </button>
            </div>
          </div>
        </div>
      )}

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

        <div className="flex items-center gap-2">
          {/* 저장 버튼 */}
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              isDirty && !saving
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-100 text-gray-400 cursor-default'
            }`}
          >
            {saving ? '저장 중...' : '저장'}
          </button>

          {/* 삭제 */}
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

      {/* 실험 절차 */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">실험 절차</label>
        <div
          className="border border-gray-200 rounded-lg overflow-hidden bg-white focus-within:border-blue-400 transition-colors cursor-text"
          onClick={() => procedureEditor?.commands.focus()}
        >
          <EditorToolbar editor={procedureEditor} />
          <EditorContent editor={procedureEditor} className={EDITOR_CONTENT_CLS} />
        </div>
        <p className="text-xs text-gray-400 mt-1">엑셀에서 복사한 표를 그대로 붙여넣기 할 수 있습니다.</p>
      </div>

      {/* 데이터 블록 */}
      <DataBlocksSection
        blocks={experiment.dataBlocks ?? []}
        onChange={(newBlocks) => update({ dataBlocks: newBlocks })}
        accessToken={accessToken}
        uploadFolderId={folderMap?.experiments}
      />

      {/* 결론 */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">결론</label>
        <div
          className="border border-gray-200 rounded-lg overflow-hidden bg-white focus-within:border-blue-400 transition-colors cursor-text"
          onClick={() => conclusionEditor?.commands.focus()}
        >
          <EditorToolbar editor={conclusionEditor} />
          <EditorContent editor={conclusionEditor} className={EDITOR_CONTENT_CLS} />
        </div>
      </div>

    </div>
  )
}

import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'

// ── Tiptap 읽기 전용 렌더러 ──────────────────────────────────

const PRINT_EXTENSIONS = [
  StarterKit,
  Table.configure({ resizable: false }),
  TableRow,
  TableCell,
  TableHeader,
]

const PRINT_EDITOR_CLS = [
  '[&_.ProseMirror]:outline-none',
  '[&_.ProseMirror_p]:my-1',
  '[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5',
  '[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5',
  '[&_.ProseMirror_h1]:text-lg [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:my-1',
  '[&_.ProseMirror_h2]:text-base [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:my-1',
  '[&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table]:text-sm',
  '[&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-gray-500 [&_.ProseMirror_td]:px-2 [&_.ProseMirror_td]:py-1',
  '[&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-gray-500 [&_.ProseMirror_th]:px-2 [&_.ProseMirror_th]:py-1 [&_.ProseMirror_th]:font-semibold',
].join(' ')

function ReadOnlyTiptap({ content }) {
  const editor = useEditor({
    extensions: PRINT_EXTENSIONS,
    content: content ?? { type: 'doc', content: [] },
    editable: false,
  })

  useEffect(() => {
    if (editor && content) {
      editor.commands.setContent(content, false)
    }
  }, [editor, content])

  if (!editor) return null
  return <EditorContent editor={editor} className={PRINT_EDITOR_CLS} />
}

// ── Drive 이미지 (프린트용) ──────────────────────────────────

function PrintImage({ fileId, accessToken }) {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    if (!fileId || !accessToken) return
    let objectUrl = null
    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.blob() })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl) })
      .catch(console.error)
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [fileId, accessToken])

  if (!src) return <div style={{ width: 64, height: 48, background: '#f0f0f0', display: 'inline-block' }} />
  return (
    <img
      src={src}
      alt=""
      style={{ maxHeight: '50mm', width: 'auto', objectFit: 'contain', display: 'block' }}
    />
  )
}

// ── 프린트 CSS ────────────────────────────────────────────────

const PRINT_CSS = `
@media screen {
  .exp-print-root { display: none; }
}

@media print {
  @page { size: A4 portrait; margin: 16mm; }

  /* 화면 콘텐츠 숨기고 프린트 컴포넌트만 표시 */
  body * { visibility: hidden; }
  .exp-print-root,
  .exp-print-root * { visibility: visible; }
  .exp-print-root {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    background: white;
    color: black;
    font-size: 10pt;
    line-height: 1.5;
  }

  /* 박스 내부 헤더: 좌측 ID+제목, 우측 날짜 기입란 */
  .epp-meta {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 5mm;
    padding-bottom: 3mm;
    border-bottom: 0.5pt solid #ddd;
    font-size: 8pt;
    color: #333;
    line-height: 1.7;
  }

  .epp-meta-left {
    /* ID + 제목 좌측 */
  }

  .epp-meta-right {
    text-align: right;
    white-space: nowrap;
  }

  .epp-date-line {
    display: inline-block;
    width: 44mm;
    border-bottom: 0.5pt solid #333;
    margin-left: 4px;
    vertical-align: bottom;
  }

  /* ── 섹션 박스: 각각 4변 완성된 독립 박스 ── */
  .epp-section {
    border: 1pt solid #555;
    padding: 8mm 10mm;
  }

  /* 상단 박스: 기본 4변 테두리 */
  .epp-top {
    /* border는 .epp-section 상속 */
  }

  /* 하단 박스: 독립 4변 테두리 + 위 여백 */
  .epp-bottom {
    margin-top: 5mm;
    break-before: auto;
    break-inside: avoid;
  }

  .epp-section-label {
    font-size: 7pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #777;
    margin-bottom: 4mm;
    padding-bottom: 2mm;
    border-bottom: 0.5pt solid #ccc;
  }

  /* 섹션 단위 페이지 넘김 방지 + 페이지 넘김 후 상단 여백 */
  .epp-field {
    margin-bottom: 5mm;
    break-inside: avoid;
    padding-top: 2mm;
  }

  .epp-field-label {
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    color: #444;
    margin-bottom: 2mm;
  }

  .epp-goal {
    font-size: 10pt;
    white-space: pre-wrap;
  }

  .epp-preceding {
    font-size: 8pt;
    color: #555;
    margin-bottom: 4mm;
  }

  /* 데이터 블록 */
  .epp-block {
    break-inside: avoid;
    margin-bottom: 5mm;
  }

  .epp-images {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 3px;
    align-items: flex-end;
  }

  .epp-image-item {
    break-inside: avoid;
  }

  .epp-analysis-label {
    font-size: 7pt;
    background: rgba(0,0,0,0.65);
    color: white;
    padding: 1px 5px;
    border-radius: 2px;
    margin-bottom: 2px;
    display: inline-block;
  }

  .epp-caption {
    font-size: 9pt;
    color: #333;
    margin-top: 3px;
  }

  /* 텍스트 전용 블록 */
  .epp-text-block {
    break-inside: avoid;
    font-size: 9pt;
    color: #333;
    border-left: 2pt solid #ccc;
    padding: 2px 0 2px 8px;
    margin-bottom: 4mm;
  }

  /* ── 프린트 옵션별 테두리 처리 ── */

  /* 상단만: 상단 박스 4변 그대로, 하단 박스 숨김 */
  .exp-print-root[data-option="top-only"] .epp-bottom {
    display: none !important;
    visibility: hidden !important;
  }

  /* 하단만: 하단 박스 4변 그대로 (margin-top 제거로 위치 보정), 상단 박스 숨김 */
  .exp-print-root[data-option="bottom-only"] .epp-top {
    display: none !important;
    visibility: hidden !important;
  }
  .exp-print-root[data-option="bottom-only"] .epp-bottom {
    margin-top: 0;
  }
}
`

// ── 메인 컴포넌트 ────────────────────────────────────────────

export default function ExperimentPrint({ experiment, accessToken, printOption, allExperiments }) {
  if (!experiment) return null

  const dataBlocks = experiment.dataBlocks ?? []

  return (
    <div className="exp-print-root" data-option={printOption ?? 'all'}>
      <style>{PRINT_CSS}</style>

      {/* ── 상단 구역: 실험 계획 ── */}
      <div className="epp-section epp-top">
        {/* 헤더: 좌측 ID+제목 / 우측 날짜 기입란 */}
        <div className="epp-meta">
          <div className="epp-meta-left">
            <div style={{ fontFamily: 'monospace', fontSize: '8pt', color: '#888' }}>
              {experiment.id}
            </div>
            <div style={{ fontWeight: 700, fontSize: '11pt' }}>{experiment.title}</div>
          </div>
          <div className="epp-meta-right">
            실험 일자:
            <span className="epp-date-line">&nbsp;</span>
          </div>
        </div>

        <div className="epp-section-label">실험 계획</div>

        {(() => {
          const precedingIds = experiment.connections?.precedingExperiments ?? []
          if (precedingIds.length === 0) return null
          const labels = precedingIds.map((pid) => {
            const linked = allExperiments?.find((e) => e.id === pid)
            return linked?.title ? `${pid} ${linked.title}` : pid
          })
          return (
            <div className="epp-preceding">
              선행 실험: {labels.join(', ')}
            </div>
          )
        })()}

        {experiment.goal && (
          <div className="epp-field">
            <div className="epp-field-label">연구 목표</div>
            <div className="epp-goal">{experiment.goal}</div>
          </div>
        )}

        <div className="epp-field">
          <div className="epp-field-label">실험 절차</div>
          <ReadOnlyTiptap content={experiment.procedure?.common} />
        </div>
      </div>

      {/* ── 하단 구역: 데이터 + 결론 ── */}
      <div className="epp-section epp-bottom">
        <div className="epp-section-label">데이터 및 결론</div>

        {dataBlocks.length > 0 && (
          <div className="epp-field">
            <div className="epp-field-label">데이터</div>
            {dataBlocks.map((block) => {
              const hasImages = block.items?.length > 0
              const hasCaption = !!block.caption

              if (!hasImages && hasCaption) {
                // 텍스트 전용 블록
                return (
                  <div key={block.id} className="epp-text-block">
                    {block.caption}
                  </div>
                )
              }

              return (
                <div key={block.id} className="epp-block">
                  {hasImages && (
                    <div className="epp-images">
                      {block.items.map((item) => (
                        <div key={item.id} className="epp-image-item">
                          <div>
                            <span className="epp-analysis-label">{item.analysisType}</span>
                          </div>
                          <PrintImage
                            fileId={item.driveFileId || null}
                            accessToken={accessToken}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {hasCaption && (
                    <div className="epp-caption">{block.caption}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="epp-field">
          <div className="epp-field-label">결론</div>
          <ReadOnlyTiptap content={experiment.conclusion} />
        </div>
      </div>
    </div>
  )
}

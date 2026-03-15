import { Handle, Position } from 'reactflow'
import { NODE_WIDTH, NODE_HEIGHT } from './dagreLayout'

export default function ExperimentNode({ data, selected }) {
  const { experiment, shortTitle, style, statusLabel, layoutDirection, isGroupStart, isGroupEnd } = data
  const { bg, border, text } = style
  const isLR = layoutDirection === 'LR'

  return (
    <>
      <Handle type="target" position={isLR ? Position.Left  : Position.Top} />

      <div
        style={{
          width: NODE_WIDTH,
          minHeight: NODE_HEIGHT,
          backgroundColor: bg,
          border: `1.5px solid ${selected ? '#3b82f6' : border}`,
          borderRadius: 12,
          color: text,
          boxShadow: selected
            ? '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04), 0 0 0 3px rgba(59,130,246,0.15)'
            : '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
          padding: '8px 12px',
          boxSizing: 'border-box',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        {/* 그룹 핀/플래그 아이콘 */}
        {(isGroupStart || isGroupEnd) && (
          <div style={{
            position: 'absolute', top: 4, right: 6,
            display: 'flex', gap: 2,
          }}>
            {isGroupStart && <span style={{ fontSize: 12 }} title="그룹 시작">📌</span>}
            {isGroupEnd   && <span style={{ fontSize: 12 }} title="그룹 끝">🔚</span>}
          </div>
        )}
        <div style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.55 }}>
          {experiment.id}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>
          {shortTitle}
        </div>
        {statusLabel && (
          <div style={{
            fontSize: 10,
            backgroundColor: '#f1f5f9',
            color: '#64748b',
            borderRadius: 6,
            padding: '2px 7px',
            display: 'inline-block',
            alignSelf: 'flex-start',
            marginTop: 2,
          }}>
            {statusLabel}
          </div>
        )}
      </div>

      <Handle type="source" position={isLR ? Position.Right : Position.Bottom} />
    </>
  )
}

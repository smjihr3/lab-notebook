import { Handle, Position } from 'reactflow'
import { NODE_WIDTH, NODE_HEIGHT } from './dagreLayout'

export default function ExperimentNode({ data, selected }) {
  const { experiment, shortTitle, style, statusLabel, layoutDirection } = data
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
          border: `${selected ? 2 : 1}px solid ${selected ? '#3b82f6' : border}`,
          borderRadius: 10,
          color: text,
          boxShadow: selected ? '0 0 0 3px rgba(59,130,246,0.25)' : undefined,
          padding: '8px 12px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <div style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.55 }}>
          {experiment.id}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>
          {shortTitle}
        </div>
        {statusLabel && (
          <div style={{
            fontSize: 10,
            backgroundColor: 'rgba(0,0,0,0.07)',
            borderRadius: 4,
            padding: '1px 5px',
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

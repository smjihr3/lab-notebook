export default function GroupBackgroundNode({ data }) {
  const { name, color } = data

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius: 16,
        border: `2px dashed ${color}`,
        backgroundColor: color,
        opacity: 0.85,
        boxSizing: 'border-box',
        position: 'relative',
        pointerEvents: 'none',
      }}
    >
      {/* 배경 fill을 낮은 opacity로 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 14,
          backgroundColor: color,
          opacity: 0.07,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 10,
          fontSize: 12,
          fontWeight: 600,
          color,
          opacity: 1,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </div>
    </div>
  )
}

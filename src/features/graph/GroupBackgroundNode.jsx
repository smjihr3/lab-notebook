export default function GroupBackgroundNode({ data }) {
  const { name, color } = data

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius: 20,
        position: 'relative',
        pointerEvents: 'none',
        boxSizing: 'border-box',
      }}
    >
      {/* 배경 fill */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 20,
          backgroundColor: color,
          opacity: 0.2,
        }}
      />
      {/* 테두리 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 20,
          border: `2px solid ${color}`,
          boxSizing: 'border-box',
        }}
      />
      {/* 그룹명 레이블 */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 12,
          padding: '0 0',
          fontSize: 13,
          fontWeight: 700,
          color,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          textShadow: '0 0 4px rgba(255,255,255,0.8)',
        }}
      >
        {name}
      </div>
    </div>
  )
}

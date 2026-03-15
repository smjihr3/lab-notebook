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
          opacity: 0.12,
        }}
      />
      {/* 테두리 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 20,
          border: `1.5px solid ${color}`,
          opacity: 0.5,
          boxSizing: 'border-box',
        }}
      />
      {/* 그룹명 레이블 */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 12,
          fontSize: 11,
          fontWeight: 600,
          color,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        {name}
      </div>
    </div>
  )
}

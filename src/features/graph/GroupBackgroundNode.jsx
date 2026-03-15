export default function GroupBackgroundNode({ data }) {
  const { name, color, polygons, bounds } = data
  if (!polygons?.length || !bounds) return null

  const ox = bounds.x
  const oy = bounds.y

  // 상대 좌표로 변환 (bounds 원점 기준)
  const toPath = (pts) =>
    pts.map(({ x, y }, i) => `${i === 0 ? 'M' : 'L'}${x - ox},${y - oy}`).join(' ') + ' Z'

  // 레이블 위치: bounds 좌상단 근처 (첫 번째 다각형의 최상단-최좌측 꼭짓점)
  const outer = polygons[0]
  const labelPt = outer.reduce(
    (best, p) => (p.y < best.y || (p.y === best.y && p.x < best.x) ? p : best),
    outer[0]
  )

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${bounds.width} ${bounds.height}`}
      preserveAspectRatio="none"
      style={{ overflow: 'visible', pointerEvents: 'none', display: 'block' }}
    >
      {polygons.map((pts, i) => (
        <path
          key={i}
          d={toPath(pts)}
          fill={color}
          fillOpacity={i === 0 ? 0.15 : 0}
          stroke={color}
          strokeWidth={2}
          strokeDasharray="6 3"
          strokeOpacity={1}
          strokeLinejoin="miter"
          fillRule="evenodd"
        />
      ))}
      <text
        x={labelPt.x - ox + 8}
        y={labelPt.y - oy + 18}
        fontSize={13}
        fontWeight={700}
        fill={color}
        style={{
          filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.9))',
          userSelect: 'none',
        }}
      >
        {name}
      </text>
    </svg>
  )
}

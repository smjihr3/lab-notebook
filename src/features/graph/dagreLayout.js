import dagre from 'dagre'

export const NODE_WIDTH  = 180
export const NODE_HEIGHT = 64

const NODESEP = 80

export function applyDagreLayout(nodes, edges, direction = 'TB') {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: direction,
    nodesep: NODESEP,
    ranksep: 80,
    align: 'UL',
    ranker: 'tight-tree',
  })

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target)
    }
  }

  dagre.layout(g)

  const layouted = nodes.map((node) => {
    const { x, y } = g.node(node.id)
    return {
      ...node,
      position: {
        x: x - NODE_WIDTH  / 2,
        y: y - NODE_HEIGHT / 2,
      },
    }
  })

  // LR 모드: 같은 x(rank) 그룹 내 노드를 균등 간격으로 재정렬
  if (direction === 'LR') {
    const groups = new Map()
    for (const node of layouted) {
      const rx = Math.round(node.position.x)
      if (!groups.has(rx)) groups.set(rx, [])
      groups.get(rx).push(node)
    }
    const step = NODE_HEIGHT + NODESEP
    for (const group of groups.values()) {
      if (group.length <= 1) continue
      // 기존 y 순서 유지
      group.sort((a, b) => a.position.y - b.position.y)
      group.forEach((node, i) => {
        node.position = { ...node.position, y: i * step }
      })
    }
  }

  return layouted
}

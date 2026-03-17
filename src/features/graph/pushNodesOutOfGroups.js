import { GRID_SNAP_X, GRID_SNAP_Y, NODE_WIDTH, NODE_HEIGHT } from './dagreLayout'
import { resolveGroupNodeIds } from './graphGroups'

/**
 * 그룹 범위를 벗어나야 할 노드들의 새 위치를 계산.
 * 순수 함수 — 부수 효과 없음. Map<nodeId, {x, y}> 반환.
 *
 * @param {object[]} currentGroups
 * @param {object[]} currentNodes       ReactFlow 노드 배열
 * @param {object[]} currentExperiments 실험 배열 (followingExperiments 포함)
 * @returns {Map<string, {x: number, y: number}>}
 */
export function computePushOutPositions(currentGroups, currentNodes, currentExperiments) {
  if (currentGroups.length === 0 || currentNodes.length === 0) return new Map()

  const expMap = Object.fromEntries(currentExperiments.map((e) => [e.id, e]))

  // Step 1: 각 그룹 bounding box (padding 없음, 순수 노드 영역)
  const groupBoundsArr = currentGroups.flatMap((group) => {
    const groupNodeIds = resolveGroupNodeIds(group, currentExperiments)
    const groupNodes   = currentNodes.filter(
      (n) => n.type !== 'groupBackground' && groupNodeIds.has(n.id)
    )
    if (groupNodes.length === 0) return []
    const minX = Math.min(...groupNodes.map((n) => n.position.x))
    const minY = Math.min(...groupNodes.map((n) => n.position.y))
    const maxX = Math.max(...groupNodes.map((n) => n.position.x + NODE_WIDTH))
    const maxY = Math.max(...groupNodes.map((n) => n.position.y + NODE_HEIGHT))
    return [{ groupNodeIds, minX, minY, maxX, maxY }]
  })
  if (groupBoundsArr.length === 0) return new Map()

  // Step 2-3: 비포함 노드 순회 → 이동 좌표 계산
  const updatedPositions = new Map()
  const caseMap          = new Map() // nodeId → 'A'|'B'|'C'|'D'

  for (const node of currentNodes) {
    if (node.type === 'groupBackground') continue

    let x = node.position.x
    let y = node.position.y
    let caseLabel = ''

    for (const { groupNodeIds, minX, minY, maxX, maxY } of groupBoundsArr) {
      if (groupNodeIds.has(node.id)) continue

      // Step 2: 겹침 판정 (padding 24px)
      const overlaps = x < maxX + 24 && x + NODE_WIDTH > minX - 24 &&
                       y < maxY + 24 && y + NODE_HEIGHT > minY - 24
      if (!overlaps) continue

      // Step 3: 방향 결정
      const exp       = expMap[node.id]
      const preceding = exp?.connections?.precedingExperiments ?? []
      const following = exp?.connections?.followingExperiments ?? []

      const parentInGroup = preceding.find((id) => groupNodeIds.has(id)) ?? null
      const childInGroup  = following.find((id) => groupNodeIds.has(id)) ?? null

      let isBranch      = false
      let siblingsInGroup = []
      if (parentInGroup) {
        const allParentFollowers = expMap[parentInGroup]?.connections?.followingExperiments ?? []
        siblingsInGroup = allParentFollowers.filter((id) => groupNodeIds.has(id))
        isBranch = allParentFollowers.length >= 2
      }

      if (parentInGroup && !isBranch) {
        // 케이스 A: 단순 후행
        caseLabel = 'A'
        const parentNode = currentNodes.find((n) => n.id === parentInGroup)
        x = Math.ceil(maxX / GRID_SNAP_X) * GRID_SNAP_X
        y = parentNode ? parentNode.position.y : y
      } else if (parentInGroup && isBranch) {
        // 케이스 B: 분기 후행
        caseLabel = 'B'
        const siblingNodes = siblingsInGroup
          .map((id) => currentNodes.find((n) => n.id === id)).filter(Boolean)
        const avgX = siblingNodes.length > 0
          ? siblingNodes.reduce((s, n) => s + n.position.x, 0) / siblingNodes.length
          : maxX + 24 + GRID_SNAP_X
        x = Math.round(avgX / GRID_SNAP_X) * GRID_SNAP_X
        y = Math.ceil(maxY / GRID_SNAP_Y) * GRID_SNAP_Y
} else if (childInGroup && !parentInGroup) {
        // 케이스 C: 선행
        caseLabel = 'C'
        const childNode = currentNodes.find((n) => n.id === childInGroup)
        x = Math.floor((minX - 24) / GRID_SNAP_X) * GRID_SNAP_X - GRID_SNAP_X
        y = childNode ? childNode.position.y : y
      } else {
        // 케이스 D: 둘 다 없거나 둘 다 있음
        caseLabel = 'D'
        const overlapX = Math.min(x + NODE_WIDTH, maxX) - Math.max(x, minX)
        const overlapY = Math.min(y + NODE_HEIGHT, maxY) - Math.max(y, minY)
        if (overlapX < overlapY) {
          const goRight = (x + NODE_WIDTH / 2) >= (minX + maxX) / 2
          x = goRight
            ? Math.ceil((maxX + 24) / GRID_SNAP_X) * GRID_SNAP_X
            : Math.floor((minX - 24) / GRID_SNAP_X) * GRID_SNAP_X - GRID_SNAP_X
        } else {
          const goDown = (y + NODE_HEIGHT / 2) >= (minY + maxY) / 2
          y = goDown
            ? Math.ceil((maxY + 24) / GRID_SNAP_Y) * GRID_SNAP_Y
            : Math.floor((minY - 24) / GRID_SNAP_Y) * GRID_SNAP_Y - GRID_SNAP_Y
        }
      }
    }

    if (caseLabel) {
      updatedPositions.set(node.id, { x, y })
      caseMap.set(node.id, caseLabel)
    }
  }

  // Step 3.5: 후행 노드 연쇄 이동 (A/B/C 케이스만, D는 방향 불명확)
  // cascadeVisited: 빈 Set으로 시작 — main 루프 배치(A/B/C/D 모두)를 cascade로 덮어쓸 수 있게 허용.
  // cascade가 등록한 노드만 보호 (이후 다른 cascade 경로에서 재등록 방지).
  const allGroupNodeIds = new Set(groupBoundsArr.flatMap(({ groupNodeIds }) => [...groupNodeIds]))
  const nodeById        = Object.fromEntries(currentNodes.map((n) => [n.id, n]))
  const cascadeVisited  = new Set()
  const cascadeQueue    = [...updatedPositions.keys()]

  while (cascadeQueue.length > 0) {
    const parentId  = cascadeQueue.shift()
    const cl        = caseMap.get(parentId)
    if (!cl || cl === 'D') continue

    const parentExp = expMap[parentId]
    const parentFollowingOutOfGroup = (parentExp?.connections?.followingExperiments ?? [])
      .filter((id) => !allGroupNodeIds.has(id))
    for (const followId of parentExp?.connections?.followingExperiments ?? []) {
      if (cascadeVisited.has(followId)) continue
      if (allGroupNodeIds.has(followId)) continue
      cascadeVisited.add(followId)

      const followNode = nodeById[followId]
      if (!followNode) continue

      const parentNewPos = updatedPositions.get(parentId)
      if (!parentNewPos) continue

      // 자식 케이스 재판정:
      // 부모의 그룹 밖 후행이 1개(일대일)이면 케이스 A(같은 행, 오른쪽)
      // 2개 이상이면 케이스 B(같은 열, 아래)
      const childCl = parentFollowingOutOfGroup.length >= 2 ? 'B' : 'A'

      let nx, ny
      if      (childCl === 'A') { nx = parentNewPos.x + GRID_SNAP_X; ny = parentNewPos.y }
      else if (childCl === 'B') { nx = parentNewPos.x;               ny = parentNewPos.y + GRID_SNAP_Y }
      else if (cl === 'C')      { nx = parentNewPos.x - GRID_SNAP_X; ny = parentNewPos.y }
      else continue

      updatedPositions.set(followId, { x: nx, y: ny })
      caseMap.set(followId, childCl)
      cascadeQueue.push(followId)
    }
  }

  return updatedPositions
}

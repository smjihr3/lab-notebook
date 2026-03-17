import { describe, it, expect, beforeEach } from 'vitest'
import { computePushOutPositions } from '../pushNodesOutOfGroups'
import { GRID_SNAP_X, GRID_SNAP_Y, NODE_WIDTH, NODE_HEIGHT } from '../dagreLayout'

// ── 공통 픽스처 ─────────────────────────────────────────────────
//
// 그래프 구조:
//   A → B (차단됨, 그룹 제외)
//   A → C (그룹 내)
//   A → E (그룹 내)
//   B → D (B의 후행 노드, 그룹 외)
//
// 그룹: startNodeIds=[A], blockedEdges=[{A→B}]
// resolveGroupNodeIds 결과: {A, C, E}
//
// B 케이스 판정:
//   parentInGroup = A (A는 그룹 내)
//   A.followingExperiments = [B, C, E] → 3개 → isBranch=true → 케이스 B
//   siblingsInGroup = A의 그룹 내 후행 = [C, E]
//
// 노드 위치:
//   A: (0,   0)    그룹 내
//   C: (0,   124)  그룹 내
//   E: (280, 124)  그룹 내
//   B: (0,   0)    그룹 외, 그룹 bounding box 안에 겹침 → 케이스 B로 이동
//   D: (0,   0)    그룹 외, 그룹 bounding box 안에 겹침 → cascade 덮어쓰기
//
// 그룹 bounding box (padding 없음):
//   minX=0, minY=0, maxX=460, maxY=188

function makeNode(id, x, y) {
  return { id, type: 'experimentNode', position: { x, y } }
}

function makeExperiment(id, following = [], preceding = []) {
  return {
    id,
    connections: {
      followingExperiments: following,
      precedingExperiments: preceding,
    },
  }
}

const group = {
  id: 'group_001',
  startNodeIds: ['A'],
  blockedEdges:    [{ from: 'A', to: 'B' }],
  openEdges:       [],
  endNodeIds:      [],
  terminalNodeIds: [],
}

const experiments = [
  makeExperiment('A', ['B', 'C', 'E'], []),
  makeExperiment('B', ['D'],           ['A']),
  makeExperiment('C', [],              ['A']),
  makeExperiment('E', [],              ['A']),
  makeExperiment('D', [],              ['B']),
]

// ReactFlow 노드 배열 (A, C, E는 그룹 내 / B, D는 겹침 대상)
const nodes = [
  makeNode('A', 0,   0),
  makeNode('C', 0,   124),
  makeNode('E', 280, 124),
  makeNode('B', 0,   0),   // 그룹 bounding box와 겹침
  makeNode('D', 0,   0),   // 그룹 bounding box와 겹침 (B의 후행)
]

// ── LR 모드 — 분기 후행(케이스 B) cascade ────────────────────────
describe('LR 모드 — 분기 후행(케이스 B) cascade', () => {
  let result

  it('computePushOutPositions이 Map을 반환함', () => {
    result = computePushOutPositions([group], nodes, experiments)
    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBeGreaterThan(0)
  })

  it('B(분기 후행)이 그룹 아래쪽으로 이동함', () => {
    result = computePushOutPositions([group], nodes, experiments)
    const posB = result.get('B')
    expect(posB).toBeDefined()
    // LR 케이스 B: newX = round(avgX/280)*280 = round(140/280)*280 = 280
    expect(posB.x).toBe(280)
    // newY = ceil((188+24)/124)*124 = ceil(212/124)*124 = 2*124 = 248
    expect(posB.y).toBe(248)
  })

  it('D(B의 후행)가 cascade에 의해 케이스 A(오른쪽, 같은 y)로 이동함', () => {
    result = computePushOutPositions([group], nodes, experiments)
    const posD = result.get('D')
    expect(posD).toBeDefined()
    // B의 그룹 밖 후행이 D 1개 → childCl='A' → nx = B.newX + GRID_SNAP_X = 280+280 = 560
    expect(posD.x).toBe(280 + GRID_SNAP_X)
    // ny = B.newY = 248 (같은 행 유지)
    expect(posD.y).toBe(248)
  })

  it('D가 B의 위치 기준으로 cascade 이동함 (B 오른쪽, 같은 y)', () => {
    result = computePushOutPositions([group], nodes, experiments)
    const posD = result.get('D')
    // 케이스 A cascade: D는 B 오른쪽(x=560), B와 같은 행(y=248)
    expect(posD.x).toBe(560)
    expect(posD.y).toBe(248)
  })
})

// ── LR 모드 — A→B→C / A→D→E 전체 그룹에서 B 제외 ──────────────
//
// 그래프 구조:
//   A → B (차단됨, 그룹 제외)   A → D → E (그룹 내)   B → C (B의 후행, 그룹 외)
//
// 그룹 (B 제외 후): startNodeIds=[A], blockedEdges=[{A→B}]
// resolveGroupNodeIds 결과: {A, D, E}
//
// B 케이스 판정:
//   parentInGroup = A
//   A.followingExperiments = ['B','D'] → 총 2개 → isBranch=true → 케이스 B
//   siblingsInGroup (그룹 내만) = [D] → avgX = D.x = GRID_SNAP_X (=280)
//
// 그룹 bounding box (A,D,E 기준):
//   minX=0, minY=0
//   maxX = GRID_SNAP_X + NODE_WIDTH   (= 460)
//   maxY = GRID_SNAP_Y * 2 + NODE_HEIGHT (= 312)
//
// B (LR 케이스 B):
//   newX = round(280/280)*280 = 280
//   newY = ceil((312+24)/124)*124 = ceil(336/124)*124 = 3*124 = 372
//
// C (cascade from B, 케이스 A — B의 그룹 밖 후행 1개 → 일대일 → 케이스 A):
//   nx = B.newX + GRID_SNAP_X = 280 + 280 = 560
//   ny = B.newY = 372

describe('LR 모드 — A→B→C / A→D→E 전체 그룹에서 B 제외', () => {
  const experiments2 = [
    makeExperiment('A', ['B', 'D'], []),
    makeExperiment('B', ['C'],      ['A']),
    makeExperiment('C', [],         ['B']),
    makeExperiment('D', ['E'],      ['A']),
    makeExperiment('E', [],         ['D']),
  ]

  const group2 = {
    id: 'group_002',
    startNodeIds:    ['A'],
    blockedEdges:    [{ from: 'A', to: 'B' }],
    openEdges:       [],
    endNodeIds:      [],
    terminalNodeIds: [],
  }

  const nodes2 = [
    makeNode('A', 0,           0),
    makeNode('B', 0,           GRID_SNAP_Y),        // (0, 124)  — 그룹 bb 안에 겹침
    makeNode('C', 0,           GRID_SNAP_Y * 2),    // (0, 248)  — 그룹 bb 안에 겹침
    makeNode('D', GRID_SNAP_X, GRID_SNAP_Y),        // (280, 124) — 그룹 내
    makeNode('E', GRID_SNAP_X, GRID_SNAP_Y * 2),   // (280, 248) — 그룹 내
  ]

  const maxX = GRID_SNAP_X + NODE_WIDTH              // 460
  const maxY = GRID_SNAP_Y * 2 + NODE_HEIGHT         // 312

  let result
  beforeEach(() => {
    result = computePushOutPositions([group2], nodes2, experiments2)
  })

  it('B(분기 후 제외 노드)가 그룹 아래쪽으로 이동함', () => {
    const posB = result.get('B')
    expect(posB).toBeDefined()
    // LR 케이스 B: newX = round(avgX/280)*280 where avgX = D.x = 280
    expect(posB.x).toBe(Math.round(GRID_SNAP_X / GRID_SNAP_X) * GRID_SNAP_X)  // 280
    // newY = ceil((maxY+24)/124)*124
    expect(posB.y).toBe(Math.ceil((maxY + 24) / GRID_SNAP_Y) * GRID_SNAP_Y)   // 372
  })

  it('B가 오른쪽으로만 이동하면 실패 (아래쪽으로 이동해야 함)', () => {
    const posB = result.get('B')
    const originalY = nodes2.find((n) => n.id === 'B').position.y  // 124
    expect(posB.y).toBeGreaterThan(originalY)
  })

  it('C(B의 후행)가 cascade로 케이스 A(오른쪽, 같은 y)로 이동함', () => {
    const posB = result.get('B')
    const posC = result.get('C')
    expect(posC).toBeDefined()
    // B의 그룹 밖 후행이 C 1개 → childCl='A' → C.newX = B.newX + GRID_SNAP_X
    expect(posC.x).toBe(posB.x + GRID_SNAP_X)
    // C.newY = B.newY (같은 행 유지)
    expect(posC.y).toBe(posB.y)
  })

  it('C가 이동하지 않으면 실패', () => {
    const posC = result.get('C')
    const original = nodes2.find((n) => n.id === 'C').position
    expect(posC).toBeDefined()
    expect(posC.y).not.toBe(original.y)
  })

  it('A, D, E는 그룹 포함 노드이므로 이동하지 않음', () => {
    expect(result.get('A')).toBeUndefined()
    expect(result.get('D')).toBeUndefined()
    expect(result.get('E')).toBeUndefined()
  })
})

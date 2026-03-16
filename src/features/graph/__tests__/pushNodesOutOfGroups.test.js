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
//   siblingsInGroup = A의 그룹 내 후행 = [C, E] → 2개 → isBranch=true → 케이스 B
//
// 노드 위치:
//   A: (0,   0)    그룹 내
//   C: (0,   124)  그룹 내
//   E: (280, 124)  그룹 내
//   B: (0,   0)    그룹 외, 그룹 bounding box 안에 겹침 → 케이스 B로 이동
//   D: (0,   0)    그룹 외, 그룹 bounding box 안에 겹침 → 케이스 D(main) 후 cascade 덮어쓰기
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

// ── TB 모드 테스트 ────────────────────────────────────────────────
describe('TB 모드 — 분기 후행(케이스 B) cascade', () => {
  let result

  it('computePushOutPositions이 Map을 반환함', () => {
    result = computePushOutPositions([group], nodes, experiments, 'TB')
    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBeGreaterThan(0)
  })

  it('B(분기 후행)이 그룹 오른쪽으로 이동함', () => {
    result = computePushOutPositions([group], nodes, experiments, 'TB')
    const posB = result.get('B')
    expect(posB).toBeDefined()
    // TB 케이스 B: newX = ceil((460+24)/280)*280 = 560
    expect(posB.x).toBe(560)
    // newY = round(avgY/124)*124 = round(124/124)*124 = 124
    expect(posB.y).toBe(124)
  })

  it('D(B의 후행)가 cascade에 의해 B와 같은 방향(오른쪽)으로 이동함', () => {
    result = computePushOutPositions([group], nodes, experiments, 'TB')
    const posD = result.get('D')
    expect(posD).toBeDefined()
    // TB 케이스 B cascade: nx = B.newX + GRID_SNAP_X = 560 + 280 = 840
    expect(posD.x).toBe(560 + GRID_SNAP_X)
    // ny = B.newY = 124 (B와 같은 행 유지)
    expect(posD.y).toBe(124)
  })

  it('D가 아래쪽(case D 독립 처리 방향)으로 이동하면 실패', () => {
    result = computePushOutPositions([group], nodes, experiments, 'TB')
    const posD = result.get('D')
    // case D(main loop) 단독 처리 시 y=-248(위) 또는 기타 잘못된 값
    // cascade 덮어쓰기가 동작하면 y는 원래 위치(0) 유지
    expect(posD.y).not.toBe(-248)   // case D 독립 처리의 UP 방향이 아님
    expect(posD.x).toBeGreaterThan(0) // 오른쪽으로 이동 확인
  })
})

// ── A→B→C / A→D→E 전체 그룹에서 B 제외, TB 모드 ──────────────────
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
//   siblingsInGroup (그룹 내만) = [D] → avgY = D.y = GRID_SNAP_Y
//
// 그룹 bounding box (A,D,E 기준):
//   minX=0, minY=0
//   maxX = GRID_SNAP_X + NODE_WIDTH   (= 460)
//   maxY = GRID_SNAP_Y * 2 + NODE_HEIGHT (= 312)

describe('TB 모드 — A→B→C / A→D→E 전체 그룹에서 B 제외', () => {
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
    result = computePushOutPositions([group2], nodes2, experiments2, 'TB')
  })

  it('B(분기 후 제외 노드)가 그룹 오른쪽으로 이동함', () => {
    const posB = result.get('B')
    expect(posB).toBeDefined()
    // TB 케이스 B: newX = ceil((maxX+24)/280)*280
    const expectedX = Math.ceil((maxX + 24) / GRID_SNAP_X) * GRID_SNAP_X  // 560
    expect(posB.x).toBe(expectedX)
    // newY = round(avgY/124)*124 where avgY = D.y = 124
    expect(posB.y).toBe(Math.round(GRID_SNAP_Y / GRID_SNAP_Y) * GRID_SNAP_Y)  // 124
  })

  it('B가 아래쪽으로 이동하면 실패', () => {
    const posB = result.get('B')
    const originalY = nodes2.find((n) => n.id === 'B').position.y  // 124
    expect(posB.y).toBeLessThanOrEqual(originalY)
  })

  it('C(B의 후행)가 cascade로 B와 같은 방향(오른쪽)으로 이동함', () => {
    const posB = result.get('B')
    const posC = result.get('C')
    expect(posC).toBeDefined()
    // C.newX = B.newX + GRID_SNAP_X
    expect(posC.x).toBe(posB.x + GRID_SNAP_X)
    // C.newY = B.newY (B와 같은 행 유지)
    expect(posC.y).toBe(posB.y)
  })

  it('C가 아래쪽(newY > B.newY)으로 이동하면 실패', () => {
    const posB = result.get('B')
    const posC = result.get('C')
    expect(posC.y).not.toBeGreaterThan(posB.y)
  })

  it('C가 이동하지 않으면 실패', () => {
    const posC = result.get('C')
    const original = nodes2.find((n) => n.id === 'C').position
    expect(posC).toBeDefined()
    expect(posC.x).not.toBe(original.x)
  })

  it('A, D, E는 그룹 포함 노드이므로 이동하지 않음', () => {
    expect(result.get('A')).toBeUndefined()
    expect(result.get('D')).toBeUndefined()
    expect(result.get('E')).toBeUndefined()
  })
})

// ── LR 모드 테스트 (회귀 방지) ───────────────────────────────────
describe('LR 모드 — 분기 후행(케이스 B) cascade', () => {
  let result

  it('B(분기 후행)이 그룹 아래쪽으로 이동함', () => {
    result = computePushOutPositions([group], nodes, experiments, 'LR')
    const posB = result.get('B')
    expect(posB).toBeDefined()
    // LR 케이스 B: newX = round(avgX/280)*280 = round(140/280)*280 = 280
    expect(posB.x).toBe(280)
    // newY = ceil((188+24)/124)*124 = ceil(212/124)*124 = 2*124 = 248
    expect(posB.y).toBe(248)
  })

  it('D(B의 후행)가 cascade에 의해 B와 같은 방향(아래쪽)으로 이동함', () => {
    result = computePushOutPositions([group], nodes, experiments, 'LR')
    const posD = result.get('D')
    expect(posD).toBeDefined()
    // LR 케이스 B cascade: ny = B.newY + GRID_SNAP_Y = 248 + 124 = 372
    expect(posD.y).toBe(248 + GRID_SNAP_Y)
    // nx = B.newX = 280 (B와 같은 열 유지)
    expect(posD.x).toBe(280)
  })

  it('D가 B의 위치 기준으로 cascade 이동함 (B.x 동일, B.y 아래)', () => {
    result = computePushOutPositions([group], nodes, experiments, 'LR')
    const posD = result.get('D')
    // LR 케이스 B cascade: D는 B의 열(x=280)에 위치, B 아래 행(y=372)으로 이동
    expect(posD.x).toBe(280)
    expect(posD.y).toBe(372)
  })
})

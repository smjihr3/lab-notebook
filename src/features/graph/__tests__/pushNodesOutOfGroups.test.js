import { describe, it, expect } from 'vitest'
import { computePushOutPositions } from '../pushNodesOutOfGroups'
import { GRID_SNAP_X, GRID_SNAP_Y } from '../dagreLayout'

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
    // TB 케이스 B cascade: nx = base.x + GRID_SNAP_X = 0 + 280 = 280
    expect(posD.x).toBe(0 + GRID_SNAP_X)
    // ny = base.y = 0 (아래로 이동하지 않음)
    expect(posD.y).toBe(0)
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
    // LR 케이스 B cascade: ny = base.y + GRID_SNAP_Y = 0 + 124 = 124
    expect(posD.y).toBe(0 + GRID_SNAP_Y)
    // nx = base.x = 0 (오른쪽으로 이동하지 않음)
    expect(posD.x).toBe(0)
  })

  it('D가 오른쪽으로 이동하면 실패', () => {
    result = computePushOutPositions([group], nodes, experiments, 'LR')
    const posD = result.get('D')
    // LR 모드에서 D는 아래(y 증가)로 이동해야 함, x는 불변
    expect(posD.x).toBe(0)
    expect(posD.y).toBeGreaterThan(0) // 아래쪽으로 이동 확인
  })
})

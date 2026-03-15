/**
 * computeGroupPolygon.js
 * 
 * 여러 노드(직사각형)를 감싸는 하나의 연속된 다각형(모든 내각 90도) 계산.
 * 각 노드를 padding만큼 확장한 후 격자 셀로 매핑하고,
 * 외곽 세그먼트를 추출하여 하나의 polygon path로 연결.
 */

/**
 * @param {Array<{x: number, y: number, w: number, h: number}>} rects
 *   - 각 노드의 화면 좌표 + 크기 (padding 미포함)
 * @param {number} padding - 각 rect를 확장할 픽셀 수
 * @returns {Array<{x: number, y: number}>} 외곽 다각형 꼭짓점 배열 (순서 보장)
 */
export function computeGroupPolygon(rects, padding = 20) {
  if (!rects || rects.length === 0) return [];

  // 1. 각 rect를 padding만큼 확장
  const expanded = rects.map(r => ({
    x1: r.x - padding,
    y1: r.y - padding,
    x2: r.x + r.w + padding,
    y2: r.y + r.h + padding,
  }));

  // 2. 격자 해상도 결정
  //    모든 x, y 경계값을 수집하여 격자 좌표계 구성
  const xs = [...new Set(expanded.flatMap(r => [r.x1, r.x2]))].sort((a, b) => a - b);
  const ys = [...new Set(expanded.flatMap(r => [r.y1, r.y2]))].sort((a, b) => a - b);

  // 3. 각 격자 셀이 occupied인지 표시
  //    셀 (col, row) = xs[col]~xs[col+1], ys[row]~ys[row+1] 사이의 영역
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  const occupied = Array.from({ length: rows }, () => new Array(cols).fill(false));

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = (xs[col] + xs[col + 1]) / 2;
      const cy = (ys[row] + ys[row + 1]) / 2;
      for (const r of expanded) {
        if (cx >= r.x1 && cx <= r.x2 && cy >= r.y1 && cy <= r.y2) {
          occupied[row][col] = true;
          break;
        }
      }
    }
  }

  // 4. 외곽 세그먼트 추출
  //    occupied 셀의 각 면을 검사: 인접 셀이 비어있거나 경계 밖이면 외곽선
  //    세그먼트: { x1, y1, x2, y2 }
  const segments = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!occupied[row][col]) continue;

      const left   = xs[col];
      const right  = xs[col + 1];
      const top    = ys[row];
      const bottom = ys[row + 1];

      // 상단 면: 위쪽 셀이 비어있으면 외곽
      if (row === 0 || !occupied[row - 1][col]) {
        segments.push({ x1: left, y1: top, x2: right, y2: top });
      }
      // 하단 면
      if (row === rows - 1 || !occupied[row + 1][col]) {
        segments.push({ x1: right, y1: bottom, x2: left, y2: bottom });
      }
      // 좌측 면
      if (col === 0 || !occupied[row][col - 1]) {
        segments.push({ x1: left, y1: bottom, x2: left, y2: top });
      }
      // 우측 면
      if (col === cols - 1 || !occupied[row][col + 1]) {
        segments.push({ x1: right, y1: top, x2: right, y2: bottom });
      }
    }
  }

  if (segments.length === 0) return [];

  // 5. 세그먼트를 연결하여 polygon 꼭짓점 배열 생성
  //    각 세그먼트의 끝점(x2, y2)에서 다음 세그먼트의 시작점(x1, y1)으로 연결
  const pointKey = (x, y) => `${Math.round(x)},${Math.round(y)}`;

  // 시작점 → 세그먼트 맵 구성
  const segMap = new Map();
  for (const seg of segments) {
    const key = pointKey(seg.x1, seg.y1);
    if (!segMap.has(key)) segMap.set(key, []);
    segMap.get(key).push(seg);
  }

  // 첫 세그먼트에서 시작
  const polygon = [];
  const startSeg = segments[0];
  let current = startSeg;
  const startKey = pointKey(startSeg.x1, startSeg.y1);
  const visited = new Set();

  while (true) {
    const key = pointKey(current.x1, current.y1);
    if (visited.has(key)) break;
    visited.add(key);
    polygon.push({ x: current.x1, y: current.y1 });

    const nextKey = pointKey(current.x2, current.y2);
    if (nextKey === startKey) break;

    const candidates = segMap.get(nextKey);
    if (!candidates || candidates.length === 0) break;

    // 아직 방문하지 않은 다음 세그먼트 선택
    const next = candidates.find(s => !visited.has(pointKey(s.x1, s.y1)));
    if (!next) break;
    current = next;
  }

  return polygon;
}

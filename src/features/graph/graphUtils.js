// ── 상수 ─────────────────────────────────────────────────────

export const STATUS_LABELS = {
  in_progress:  '진행중',
  data_pending: '데이터 대기',
  analyzing:    '분석중',
  completed:    null,
}

export const OUTCOME_LABELS = {
  success: '성공',
  failed:  '실패',
  partial: '부분성공',
  unknown: '미정',
}

export const NODE_COLORS = {
  completed: {
    success: { bg: '#22c55e', border: '#16a34a', text: '#ffffff' },
    failed:  { bg: '#ef4444', border: '#dc2626', text: '#ffffff' },
    partial: { bg: '#f97316', border: '#ea580c', text: '#ffffff' },
    unknown: { bg: '#9ca3af', border: '#6b7280', text: '#ffffff' },
  },
  default:   { bg: '#ffffff', border: '#d1d5db', text: '#374151' },
}

// ── 스타일 / 라벨 헬퍼 ───────────────────────────────────────

export function getNodeStyle(experiment) {
  const { status, outcome } = experiment
  const statusLabel = STATUS_LABELS[status] ?? null

  if (status === 'completed') {
    const colors = NODE_COLORS.completed[outcome] ?? NODE_COLORS.completed.unknown
    return { ...colors, statusLabel }
  }

  return { ...NODE_COLORS.default, statusLabel }
}

// ── 변환 함수 ─────────────────────────────────────────────────

export function experimentsToNodes(experiments) {
  return experiments.map((exp) => {
    const style = getNodeStyle(exp)
    const shortTitle = (exp.title ?? '').length > 20
      ? exp.title.slice(0, 20) + '…'
      : (exp.title || '(제목 없음)')

    return {
      id: exp.id,
      type: 'experimentNode',
      position: { x: 0, y: 0 },
      data: {
        experiment: exp,
        shortTitle,
        style,
        statusLabel: style.statusLabel,
      },
    }
  })
}

export function experimentsToEdges(experiments) {
  const seen = new Set()
  const edges = []

  for (const exp of experiments) {
    for (const precedingId of exp.connections?.precedingExperiments ?? []) {
      const edgeId = `${precedingId}->${exp.id}`
      if (seen.has(edgeId)) continue
      seen.add(edgeId)
      edges.push({
        id: edgeId,
        source: precedingId,
        target: exp.id,
        type: 'smoothstep',
        markerEnd: { type: 'arrowclosed' },
      })
    }
  }

  return edges
}

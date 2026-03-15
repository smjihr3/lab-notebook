// ── 상수 ─────────────────────────────────────────────────────

export const STATUS_LABELS = {
  in_progress:  '진행중',
  data_pending: '데이터 대기',
  analyzing:    '분석중',
}

export const OUTCOME_LABELS = {
  success: '성공',
  failed:  '실패',
  partial: '부분 성공',
  unknown: '모름',
}

export const NODE_COLORS = {
  completed: {
    success: { bg: '#dcfce7', border: '#16a34a', text: '#15803d' },
    failed:  { bg: '#fee2e2', border: '#ef4444', text: '#b91c1c' },
    partial: { bg: '#ffedd5', border: '#f97316', text: '#c2410c' },
    unknown: { bg: '#f3f4f6', border: '#9ca3af', text: '#4b5563' },
  },
  default:   { bg: '#ffffff', border: '#e2e8f0', text: '#1e293b' },
}

// ── 스타일 / 라벨 헬퍼 ───────────────────────────────────────

export function getNodeStyle(experiment) {
  const { status, outcome } = experiment

  if (status === 'completed') {
    const colors = NODE_COLORS.completed[outcome] ?? NODE_COLORS.completed.unknown
    const statusLabel = OUTCOME_LABELS[outcome] ?? OUTCOME_LABELS.unknown
    return { ...colors, statusLabel }
  }

  const statusLabel = STATUS_LABELS[status] ?? status
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
        style: { stroke: '#475569', strokeWidth: 1.5, opacity: 0.7 },
        markerEnd: { type: 'arrowclosed', color: '#475569' },
      })
    }
  }

  return edges
}

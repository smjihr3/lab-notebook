/**
 * CrossRef API 서비스
 * DOI로 논문 메타데이터 조회 (무료, 인증 불필요)
 */

export async function fetchByDoi(doi) {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi.trim())}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'LabNotebook/1.0 (mailto:user@example.com)' },
  })
  if (!res.ok) throw new Error(`CrossRef API error: ${res.status}`)
  const json = await res.json()
  const msg = json.message

  const title = msg.title?.[0] ?? ''
  const authors = (msg.author ?? [])
    .map((a) => {
      if (a.family) return a.given ? `${a.family}, ${a.given[0]}.` : a.family
      return a.name ?? ''
    })
    .filter(Boolean)
    .join('; ')
  // 저널 축약명 우선, 없으면 전체명
  const journal =
    msg['short-container-title']?.[0] ?? msg['container-title']?.[0] ?? ''
  const year =
    msg.published?.['date-parts']?.[0]?.[0] ??
    msg['published-print']?.['date-parts']?.[0]?.[0] ??
    msg['published-online']?.['date-parts']?.[0]?.[0] ??
    null
  const volume = msg.volume ?? null
  const issue = msg.issue ?? null
  const pages = msg.page ?? ''

  // "저널축약명, 연도, 권, 호(있을 때만), 페이지"
  const parts = [
    journal || null,
    year ? String(year) : null,
    volume || null,
    issue || null,
    pages || null,
  ].filter(Boolean)
  const shortCitation = parts.join(', ')

  return { title, authors, journal, year, volume, issue, pages, doi: doi.trim(), shortCitation }
}

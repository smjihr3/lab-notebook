const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` }
}

/**
 * 이름 + 부모 + mimeType으로 파일 검색, 첫 번째 결과 반환
 */
export async function findFile(name, parentId, mimeType, token) {
  const q = [
    `name = '${name}'`,
    `'${parentId}' in parents`,
    `mimeType = '${mimeType}'`,
    `trashed = false`,
  ].join(' and ')

  const res = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)`,
    { headers: authHeaders(token) }
  )
  if (!res.ok) throw new Error(`findFile failed: ${res.status}`)
  const data = await res.json()
  return data.files?.[0] ?? null
}

/**
 * 폴더 내 파일 목록 반환
 */
export async function listFiles(parentId, token, mimeType = null) {
  const conditions = [
    `'${parentId}' in parents`,
    `trashed = false`,
  ]
  if (mimeType) conditions.push(`mimeType = '${mimeType}'`)
  const q = conditions.join(' and ')

  const res = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime)&orderBy=modifiedTime desc`,
    { headers: authHeaders(token) }
  )
  if (!res.ok) throw new Error(`listFiles failed: ${res.status}`)
  const data = await res.json()
  return data.files ?? []
}

/**
 * 폴더를 찾거나 없으면 생성 (멱등)
 */
export async function getOrCreateFolder(name, parentId, token) {
  const FOLDER_MIME = 'application/vnd.google-apps.folder'
  const existing = await findFile(name, parentId, FOLDER_MIME, token)
  if (existing) return existing

  const res = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    }),
  })
  if (!res.ok) throw new Error(`getOrCreateFolder failed: ${res.status}`)
  return res.json()
}

/**
 * Drive 파일 읽어서 JSON 파싱
 */
export async function readJsonFile(fileId, token) {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error(`readJsonFile failed: ${res.status}`)
  return res.json()
}

/**
 * multipart upload로 JSON 파일 생성
 */
export async function createJsonFile(name, parentId, data, token) {
  const metadata = { name, mimeType: 'application/json', parents: [parentId] }
  const body = JSON.stringify(data)

  const boundary = 'lab_notebook_boundary'
  const multipart = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    body,
    `--${boundary}--`,
  ].join('\r\n')

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id,name`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipart,
  })
  if (!res.ok) throw new Error(`createJsonFile failed: ${res.status}`)
  return res.json()
}

/**
 * 기존 파일 내용 교체
 */
export async function updateJsonFile(fileId, data, token) {
  const res = await fetch(`${UPLOAD_API}/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`updateJsonFile failed: ${res.status}`)
  return res.json()
}

/**
 * 있으면 update, 없으면 create
 */
export async function upsertJsonFile(name, parentId, data, token) {
  const existing = await findFile(name, parentId, 'application/json', token)
  if (existing) {
    await updateJsonFile(existing.id, data, token)
    return existing.id
  }
  const created = await createJsonFile(name, parentId, data, token)
  return created.id
}

/**
 * 이미지 등 바이너리 파일 업로드
 */
export async function uploadBinaryFile(file, parentId, token) {
  const metadata = { name: file.name, parents: [parentId] }
  const boundary = 'lab_notebook_boundary'

  const metaPart = JSON.stringify(metadata)
  const encoder = new TextEncoder()

  const metaBytes = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`
  )
  const endBytes = encoder.encode(`\r\n--${boundary}--`)
  const fileBytes = await file.arrayBuffer()

  const combined = new Uint8Array(metaBytes.byteLength + fileBytes.byteLength + endBytes.byteLength)
  combined.set(metaBytes, 0)
  combined.set(new Uint8Array(fileBytes), metaBytes.byteLength)
  combined.set(endBytes, metaBytes.byteLength + fileBytes.byteLength)

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id,name,webContentLink`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: combined,
  })
  if (!res.ok) throw new Error(`uploadBinaryFile failed: ${res.status}`)
  return res.json()
}

/**
 * 파일을 trash로 이동
 */
export async function trashFile(fileId, token) {
  const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trashed: true }),
  })
  if (!res.ok) throw new Error(`trashFile failed: ${res.status}`)
  return res.json()
}

import {
  listFiles,
  readJsonFile,
  createJsonFile,
  updateJsonFile,
  upsertJsonFile,
  trashFile,
} from './driveClient'

// ─── 공통 헬퍼 ────────────────────────────────────────────────

async function getAll(folderId, { token }) {
  const files = await listFiles(folderId, token, 'application/json')
  const items = await Promise.all(
    files.map(async (f) => {
      const data = await readJsonFile(f.id, token)
      return { ...data, _fileId: f.id }
    })
  )
  return items
}

async function save(item, folderId, { token }) {
  const { _fileId, ...data } = item
  if (_fileId) {
    await updateJsonFile(_fileId, data, token)
    return { ...data, _fileId }
  }
  // 파일명: id 필드 사용, 없으면 타임스탬프
  const filename = `${data.id ?? Date.now()}.json`
  const created = await createJsonFile(filename, folderId, data, token)
  return { ...data, _fileId: created.id }
}

async function remove(item, { token }) {
  if (!item._fileId) return
  await trashFile(item._fileId, token)
}

// ─── 실험 ─────────────────────────────────────────────────────

export function getAllExperiments({ token, folderMap }) {
  return getAll(folderMap.experiments, { token })
}
export function saveExperiment(experiment, { token, folderMap }) {
  return save(experiment, folderMap.experiments, { token })
}
export function deleteExperiment(experiment, { token }) {
  return remove(experiment, { token })
}

// ─── 문헌 ─────────────────────────────────────────────────────

export function getAllReferences({ token, folderMap }) {
  return getAll(folderMap.references, { token })
}
export function saveReference(reference, { token, folderMap }) {
  return save(reference, folderMap.references, { token })
}
export function deleteReference(reference, { token }) {
  return remove(reference, { token })
}

// ─── 랩 노하우 ────────────────────────────────────────────────

export function getAllTips({ token, folderMap }) {
  return getAll(folderMap.tips, { token })
}
export function saveTip(tip, { token, folderMap }) {
  return save(tip, folderMap.tips, { token })
}
export function deleteTip(tip, { token }) {
  return remove(tip, { token })
}

// ─── 프로젝트 ─────────────────────────────────────────────────

export function getAllProjects({ token, folderMap }) {
  return getAll(folderMap.projects, { token })
}
export function saveProject(project, { token, folderMap }) {
  return save(project, folderMap.projects, { token })
}

// ─── 캘린더 계획 ──────────────────────────────────────────────

export function getAllPlans({ token, folderMap }) {
  return getAll(folderMap.plans, { token })
}
export function savePlan(plan, { token, folderMap }) {
  return save(plan, folderMap.plans, { token })
}
export function deletePlan(plan, { token }) {
  return remove(plan, { token })
}

// ─── 설정 ─────────────────────────────────────────────────────

export async function saveSettings(settings, fileId, { token }) {
  await updateJsonFile(fileId, settings, token)
}

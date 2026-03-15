import { DEFAULT_SETTINGS } from '../../schema/defaults'
import {
  getOrCreateFolder,
  findFile,
  readJsonFile,
  createJsonFile,
  listFiles,
} from './driveClient'

const ROOT_NAME = 'LabNotebook'
const SUB_FOLDERS = ['experiments', 'references', 'tips', 'projects', 'plans']
const SETTINGS_FILENAME = 'settings.json'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

/**
 * Drive의 최상위 폴더(root) ID 조회 (My Drive)
 */
async function getMyDriveRootId(token) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files/root?fields=id', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`getMyDriveRootId failed: ${res.status}`)
  const data = await res.json()
  return data.id
}

/**
 * 'LabNotebook' 루트 폴더와 하위 폴더를 생성(또는 확인)하고
 * settings.json이 없으면 DEFAULT_SETTINGS로 생성.
 * folderMap 반환.
 */
export async function initDriveStructure(token) {
  const driveRootId = await getMyDriveRootId(token)

  // 루트 폴더 생성/확인
  const rootFolder = await getOrCreateFolder(ROOT_NAME, driveRootId, token)

  // 하위 폴더 병렬 생성/확인
  const subFolderResults = await Promise.all(
    SUB_FOLDERS.map((name) => getOrCreateFolder(name, rootFolder.id, token))
  )

  const folderMap = { root: rootFolder.id }
  SUB_FOLDERS.forEach((name, i) => {
    folderMap[name] = subFolderResults[i].id
  })

  // settings.json 없으면 생성
  const existingSettings = await findFile(SETTINGS_FILENAME, rootFolder.id, 'application/json', token)
  if (existingSettings) {
    folderMap.settingsFileId = existingSettings.id
  } else {
    const created = await createJsonFile(SETTINGS_FILENAME, rootFolder.id, DEFAULT_SETTINGS, token)
    folderMap.settingsFileId = created.id
  }

  return folderMap
}

/**
 * 기존 폴더 구조를 찾아 folderMap 반환. 루트 없으면 null.
 */
export async function loadDriveStructure(token) {
  const driveRootId = await getMyDriveRootId(token)

  const rootFolder = await findFile(ROOT_NAME, driveRootId, FOLDER_MIME, token)
  if (!rootFolder) return null

  // 하위 폴더 병렬 조회
  const subFolderResults = await Promise.all(
    SUB_FOLDERS.map((name) => findFile(name, rootFolder.id, FOLDER_MIME, token))
  )

  const folderMap = { root: rootFolder.id }
  SUB_FOLDERS.forEach((name, i) => {
    folderMap[name] = subFolderResults[i]?.id ?? null
  })

  const settingsFile = await findFile(SETTINGS_FILENAME, rootFolder.id, 'application/json', token)
  folderMap.settingsFileId = settingsFile?.id ?? null

  return folderMap
}

/**
 * settings.json 읽기. 실패 시 DEFAULT_SETTINGS 반환.
 */
export async function loadSettings(folderMap, token) {
  if (!folderMap.settingsFileId) return { ...DEFAULT_SETTINGS }
  try {
    return await readJsonFile(folderMap.settingsFileId, token)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

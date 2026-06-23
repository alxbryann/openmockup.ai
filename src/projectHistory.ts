import type { ProjectSnapshot } from './projectStore'

export type ProjectRevision = {
  id: string
  projectId: string
  createdAt: number
  label: string
  snapshot: ProjectSnapshot
  thumbnail: string | null
}

const STORAGE_KEY = 'openmockup.projectHistory.v1'
const MAX_REVISIONS = 15
const MIN_INTERVAL_MS = 60_000

type Index = Record<string, ProjectRevision[]>

function readIndex(): Index {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Index
  } catch {
    return {}
  }
}

function writeIndex(idx: Index) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(idx))
}

export function listProjectRevisions(projectId: string): ProjectRevision[] {
  return (readIndex()[projectId] ?? []).sort((a, b) => b.createdAt - a.createdAt)
}

export function saveProjectRevision(
  projectId: string,
  snapshot: ProjectSnapshot,
  thumbnail: string | null,
  label?: string,
): ProjectRevision | null {
  const idx = readIndex()
  const existing = idx[projectId] ?? []
  const last = existing[0]
  if (last && Date.now() - last.createdAt < MIN_INTERVAL_MS) return null

  const revision: ProjectRevision = {
    id: crypto.randomUUID(),
    projectId,
    createdAt: Date.now(),
    label: label ?? `Autosave ${new Date().toLocaleTimeString()}`,
    snapshot,
    thumbnail,
  }

  idx[projectId] = [revision, ...existing].slice(0, MAX_REVISIONS)
  writeIndex(idx)
  return revision
}

export function deleteProjectRevision(projectId: string, revisionId: string): void {
  const idx = readIndex()
  idx[projectId] = (idx[projectId] ?? []).filter((r) => r.id !== revisionId)
  writeIndex(idx)
}

export function clearProjectRevisions(projectId: string): void {
  const idx = readIndex()
  delete idx[projectId]
  writeIndex(idx)
}

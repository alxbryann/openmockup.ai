import type { DeviceInstance } from './store'

export type ProjectSnapshot = {
  devices: DeviceInstance[]
  bgColor: string
  uiTheme: 'dark' | 'light'
  cameraRoll: number
  orbitDistance: number
  autoRotate: boolean
  cameraPosition: [number, number, number]
  cameraTarget: [number, number, number]
  viewportAspect: number
  viewportInsetRight: number
}

export type Project = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  isPublic: boolean
  /**
   * Low-res JPEG data URL preview of the studio's visible viewport (panel area cropped out).
   * Generated on autosave so gallery cards always show exactly what the author last saw.
   */
  thumbnail: string | null
  snapshot: ProjectSnapshot
}

export type ProjectSummary = Pick<Project, 'id' | 'name' | 'createdAt' | 'updatedAt' | 'isPublic' | 'thumbnail'> & {
  viewportAspect: number
  viewportInsetRight: number
}

export interface ProjectStore {
  list(): Promise<ProjectSummary[]>
  listPublic(limit: number): Promise<ProjectSummary[]>
  get(id: string): Promise<Project | null>
  create(name?: string, snapshot?: ProjectSnapshot): Promise<Project>
  save(id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<Project>
  delete(id: string): Promise<void>
  getLastOpenedId(): string | null
  setLastOpenedId(id: string | null): void
}

const STORAGE_KEY = 'openmockup.projects.v1'
const LAST_OPENED_KEY = 'openmockup.lastProjectId.v1'

type Index = { projects: Record<string, Project> }

function readIndex(): Index {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { projects: {} }
    const parsed = JSON.parse(raw) as Index
    if (!parsed.projects) return { projects: {} }
    return parsed
  } catch {
    return { projects: {} }
  }
}

function writeIndex(idx: Index) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(idx))
}

function defaultSnapshot(): ProjectSnapshot {
  return {
    devices: [
      {
        id: crypto.randomUUID(),
        screenshot: null,
        screenMediaKind: null,
        screenLoadError: null,
        videoStartTime: 0,
        deviceKind: 'phone',
        deviceColor: '#DFCEEA',
        deviceRotation: [0, 0, 0],
        positionX: 0,
        positionY: 0,
      },
    ],
    bgColor: '#ffffff',
    uiTheme: 'dark',
    cameraRoll: 0,
    orbitDistance: 28,
    autoRotate: false,
    cameraPosition: [0, 0, 28],
    cameraTarget: [0, 0, 0],
    viewportAspect: 1,
    viewportInsetRight: 0,
  }
}

function summarize(p: Project): ProjectSummary {
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    isPublic: p.isPublic,
    thumbnail: p.thumbnail ?? null,
    viewportAspect: p.snapshot.viewportAspect ?? 1,
    viewportInsetRight: p.snapshot.viewportInsetRight ?? 0,
  }
}

class LocalProjectStore implements ProjectStore {
  async list(): Promise<ProjectSummary[]> {
    const idx = readIndex()
    return Object.values(idx.projects)
      .map(summarize)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async listPublic(limit: number): Promise<ProjectSummary[]> {
    const idx = readIndex()
    return Object.values(idx.projects)
      .filter((p) => p.isPublic)
      .map(summarize)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
  }

  async get(id: string): Promise<Project | null> {
    const idx = readIndex()
    return idx.projects[id] ?? null
  }

  async create(name?: string, snapshot?: ProjectSnapshot): Promise<Project> {
    const idx = readIndex()
    const now = Date.now()
    const count = Object.keys(idx.projects).length
    const project: Project = {
      id: crypto.randomUUID(),
      name: name?.trim() || `Untitled mockup ${count + 1}`,
      createdAt: now,
      updatedAt: now,
      isPublic: true,
      thumbnail: null,
      snapshot: snapshot ?? defaultSnapshot(),
    }
    idx.projects[project.id] = project
    writeIndex(idx)
    return project
  }

  async save(id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<Project> {
    const idx = readIndex()
    const existing = idx.projects[id]
    if (!existing) throw new Error(`Project ${id} not found`)
    const next: Project = { ...existing, ...patch, id: existing.id, createdAt: existing.createdAt, updatedAt: Date.now() }
    idx.projects[id] = next
    writeIndex(idx)
    return next
  }

  async delete(id: string): Promise<void> {
    const idx = readIndex()
    delete idx.projects[id]
    writeIndex(idx)
    if (this.getLastOpenedId() === id) this.setLastOpenedId(null)
  }

  getLastOpenedId(): string | null {
    try {
      return localStorage.getItem(LAST_OPENED_KEY)
    } catch {
      return null
    }
  }

  setLastOpenedId(id: string | null): void {
    try {
      if (id) localStorage.setItem(LAST_OPENED_KEY, id)
      else localStorage.removeItem(LAST_OPENED_KEY)
    } catch {
      /* ignore */
    }
  }
}

export const projectStore: ProjectStore = new LocalProjectStore()

export function snapshotFromStoreState(s: {
  devices: DeviceInstance[]
  bgColor: string
  uiTheme: 'dark' | 'light'
  cameraRoll: number
  orbitDistance: number
  autoRotate: boolean
  cameraPosition: [number, number, number]
  cameraTarget: [number, number, number]
  viewportAspect: number
  viewportInsetRight: number
}): ProjectSnapshot {
  return {
    devices: s.devices.map((d) => ({ ...d, deviceRotation: [...d.deviceRotation] as [number, number, number] })),
    bgColor: s.bgColor,
    uiTheme: s.uiTheme,
    cameraRoll: s.cameraRoll,
    orbitDistance: s.orbitDistance,
    autoRotate: s.autoRotate,
    cameraPosition: [...s.cameraPosition] as [number, number, number],
    cameraTarget: [...s.cameraTarget] as [number, number, number],
    viewportAspect: s.viewportAspect,
    viewportInsetRight: s.viewportInsetRight,
  }
}

export function newSnapshot(): ProjectSnapshot {
  return defaultSnapshot()
}

import { supabase } from './supabase'
import type { Project, ProjectSnapshot, ProjectStore, ProjectSummary } from './projectStore'
import type { Json } from './database.types'

const LAST_OPENED_KEY = 'openmockup.lastProjectId.v1'

// Track the signed-in user id so the "last opened project" key can be scoped
// per account. Without this, two accounts in the same browser would share a
// single lastProjectId and one could inherit the other's project on login.
let activeUserId: string | null = null
if (supabase) {
  supabase.auth.getSession().then(({ data }) => {
    activeUserId = data.session?.user?.id ?? null
  })
  supabase.auth.onAuthStateChange((_event, session) => {
    activeUserId = session?.user?.id ?? null
  })
}

function stripBlobUrls(snapshot: ProjectSnapshot): ProjectSnapshot {
  return {
    ...snapshot,
    devices: snapshot.devices.map((d) => ({
      ...d,
      // blob: URLs are session-only and cannot be persisted
      screenshot: d.screenMediaKind === 'video' ? null : d.screenshot,
      screenMediaKind: d.screenMediaKind === 'video' ? null : d.screenMediaKind,
    })),
  }
}

export class SupabaseProjectStore implements ProjectStore {
  private async userId(): Promise<string> {
    const { data } = await supabase.auth.getUser()
    if (!data.user) throw new Error('Not authenticated')
    return data.user.id
  }

  async list(): Promise<ProjectSummary[]> {
    // Explicitly scope to the current user. RLS also allows reading any public
    // project, so without this filter the picker would surface other users'
    // public mockups too.
    const userId = await this.userId()
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, created_at, updated_at, is_public, thumbnail, snapshot')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (error) throw error

    return (data ?? []).map((row) => {
      const snap = row.snapshot as ProjectSnapshot
      return {
        id: row.id,
        name: row.name,
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
        isPublic: row.is_public,
        thumbnail: row.thumbnail ?? null,
        viewportAspect: snap?.viewportAspect ?? 1,
        viewportInsetRight: snap?.viewportInsetRight ?? 0,
      }
    })
  }

  async listPublic(limit: number): Promise<ProjectSummary[]> {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, created_at, updated_at, is_public, thumbnail, snapshot')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    return (data ?? []).map((row) => {
      const snap = row.snapshot as ProjectSnapshot
      return {
        id: row.id,
        name: row.name,
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
        isPublic: row.is_public,
        thumbnail: row.thumbnail ?? null,
        viewportAspect: snap?.viewportAspect ?? 1,
        viewportInsetRight: snap?.viewportInsetRight ?? 0,
      }
    })
  }

  async get(id: string): Promise<Project | null> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) return null

    return {
      id: data.id,
      name: data.name,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
      isPublic: data.is_public,
      thumbnail: data.thumbnail ?? null,
      snapshot: data.snapshot as ProjectSnapshot,
    }
  }

  async create(name?: string, snapshot?: ProjectSnapshot): Promise<Project> {
    const userId = await this.userId()
    const defaultSnap: ProjectSnapshot = snapshot ?? {
      devices: [
        {
          id: crypto.randomUUID(),
          screenshot: null,
          screenMediaKind: null,
          screenLoadError: null,
          videoStartTime: 0,
          videoEndTime: null,
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

    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        name: name?.trim() || 'Untitled mockup',
        // Private by default — the user explicitly publishes a mockup to the
        // public gallery from the project picker.
        is_public: false,
        snapshot: stripBlobUrls(defaultSnap) as unknown as Json,
      })
      .select()
      .single()

    if (error) throw error

    return {
      id: data.id,
      name: data.name,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
      isPublic: data.is_public,
      thumbnail: data.thumbnail ?? null,
      snapshot: data.snapshot as ProjectSnapshot,
    }
  }

  async save(id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<Project> {
    const update: { name?: string; is_public?: boolean; thumbnail?: string | null; snapshot?: Json } = {}
    if (patch.name !== undefined) update.name = patch.name
    if (patch.isPublic !== undefined) update.is_public = patch.isPublic
    if (patch.thumbnail !== undefined) update.thumbnail = patch.thumbnail
    if (patch.snapshot !== undefined) update.snapshot = stripBlobUrls(patch.snapshot) as unknown as Json

    const { data, error } = await supabase
      .from('projects')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return {
      id: data.id,
      name: data.name,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
      isPublic: data.is_public,
      thumbnail: data.thumbnail ?? null,
      snapshot: data.snapshot as ProjectSnapshot,
    }
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) throw error
    if (this.getLastOpenedId() === id) this.setLastOpenedId(null)
  }

  private lastKey(): string {
    return activeUserId ? `${LAST_OPENED_KEY}:${activeUserId}` : LAST_OPENED_KEY
  }

  getLastOpenedId(): string | null {
    try {
      return localStorage.getItem(this.lastKey())
    } catch {
      return null
    }
  }

  setLastOpenedId(id: string | null): void {
    try {
      if (id) localStorage.setItem(this.lastKey(), id)
      else localStorage.removeItem(this.lastKey())
    } catch {
      /* ignore */
    }
  }
}

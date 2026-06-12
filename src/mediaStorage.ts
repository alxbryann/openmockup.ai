import { supabase, isSupabaseConfigured } from './supabase'

export const PROJECT_MEDIA_BUCKET = 'project-media'
export const RENDER_RESULTS_BUCKET = 'render-results'

const MAX_VIDEO_BYTES = 100 * 1024 * 1024 // 100 MB

const VIDEO_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

export function mediaStoragePath(userId: string, projectId: string, deviceId: string, ext: string): string {
  return `${userId}/${projectId}/${deviceId}.${ext}`
}

export function projectMediaPrefix(userId: string, projectId: string): string {
  return `${userId}/${projectId}/`
}

function extFromFile(file: File): string {
  const fromMime = VIDEO_EXT[file.type.toLowerCase()]
  if (fromMime) return fromMime
  const m = file.name.match(/\.(mp4|webm|mov)$/i)
  return m ? m[1].toLowerCase() : 'mp4'
}

export function isStorageConfigured(): boolean {
  return isSupabaseConfigured
}

export async function uploadDeviceVideo(
  userId: string,
  projectId: string,
  deviceId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  if (!supabase) throw new Error('Supabase not configured')
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error('Video must be under 100 MB.')
  }
  const ext = extFromFile(file)
  const path = mediaStoragePath(userId, projectId, deviceId, ext)
  onProgress?.(10)

  const { error } = await supabase.storage.from(PROJECT_MEDIA_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || `video/${ext}`,
  })
  if (error) throw error
  onProgress?.(100)
  return path
}

export async function deleteDeviceMedia(storagePath: string): Promise<void> {
  if (!supabase || !storagePath) return
  await supabase.storage.from(PROJECT_MEDIA_BUCKET).remove([storagePath])
}

export async function deleteProjectMedia(userId: string, projectId: string): Promise<void> {
  if (!supabase) return
  const prefix = projectMediaPrefix(userId, projectId)
  const { data, error } = await supabase.storage.from(PROJECT_MEDIA_BUCKET).list(`${userId}/${projectId}`)
  if (error || !data?.length) return
  const paths = data.map((o) => `${prefix}${o.name}`)
  if (paths.length) await supabase.storage.from(PROJECT_MEDIA_BUCKET).remove(paths)
}

/** Resolve a storage path to a playable URL (signed for private, public URL when allowed). */
export async function resolveMediaUrl(
  storagePath: string,
  _isPublic = false,
  expiresSec = 3600,
): Promise<string | null> {
  if (!supabase || !storagePath) return null
  const { data, error } = await supabase.storage
    .from(PROJECT_MEDIA_BUCKET)
    .createSignedUrl(storagePath, expiresSec)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

/** Resolve all video devices in a snapshot before hydrate. */
export async function resolveSnapshotMediaUrls(
  devices: Array<{
    screenshot: string | null
    screenMediaKind: string | null
    screenMediaStoragePath?: string | null
  }>,
  isPublic: boolean,
): Promise<void> {
  await Promise.all(
    devices.map(async (d) => {
      if (d.screenMediaKind !== 'video' || !d.screenMediaStoragePath) return
      const url = await resolveMediaUrl(d.screenMediaStoragePath, isPublic)
      if (url) {
        d.screenshot = url
        d.screenMediaKind = 'video'
      }
    }),
  )
}

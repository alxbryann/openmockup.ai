import { supabase } from './supabase'
import { isSupabaseConfigured } from './supabase'
import { templateToRenderScene, getSceneTemplate } from './sceneTemplates'
import type { AspectPreset } from './store'
import type { BatchItem } from './batchExport'

export type ServerBatchOpts = {
  items: BatchItem[]
  templateId?: string
  aspectPreset?: AspectPreset
  exportPreset?: 'screen' | 1920 | 3840
  transparent?: boolean
  webhookUrl?: string
  onProgress?: (done: number, total: number, status: string) => void
  signal?: AbortSignal
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const t = window.setTimeout(() => resolve(), ms)
    signal?.addEventListener('abort', () => {
      window.clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}

export async function runServerBatchExport(opts: ServerBatchOpts): Promise<Blob> {
  const { items, templateId, aspectPreset = 'free', exportPreset = 1920, transparent, webhookUrl, onProgress, signal } = opts

  if (items.length === 0) throw new Error('No files to export')
  if (items.length > 20) throw new Error('Maximum 20 files per server batch')

  const token = await getAccessToken()
  if (!token) throw new Error('Sign in required for server batch export')

  const tpl = templateId ? getSceneTemplate(templateId) : null
  if (templateId && !tpl) throw new Error(`Unknown template: ${templateId}`)

  onProgress?.(0, items.length, 'Uploading…')

  const imageItems = await Promise.all(
    items.map(async (item) => ({
      name: item.name,
      imageDataUrl: item.dataUrl ?? (await fileToDataUrl(item.file)),
    })),
  )

  const scene = tpl
    ? templateToRenderScene(tpl, { aspectPreset, exportPreset, transparent })
    : { aspectPreset, transparent }

  const res = await fetch('/api/render/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ items: imageItems, scene, webhookUrl: webhookUrl || undefined }),
    signal,
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `Server batch failed (${res.status})`)
  }

  const { jobId } = (await res.json()) as { jobId: string }
  onProgress?.(0, items.length, 'Rendering on server…')

  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const statusRes = await fetch(`/api/render/batch-status?id=${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })

    if (!statusRes.ok) {
      const err = (await statusRes.json().catch(() => ({}))) as { error?: string }
      throw new Error(err.error ?? `Status check failed (${statusRes.status})`)
    }

    const status = (await statusRes.json()) as {
      status: string
      progress: number
      downloadUrl?: string
      error?: string
    }

    const done = Math.round((status.progress / 100) * items.length)
    onProgress?.(done, items.length, status.status)

    if (status.status === 'done' && status.downloadUrl) {
      const zipRes = await fetch(status.downloadUrl, { signal })
      if (!zipRes.ok) throw new Error('Failed to download ZIP')
      onProgress?.(items.length, items.length, 'done')
      return zipRes.blob()
    }

    if (status.status === 'failed') {
      throw new Error(status.error ?? 'Server batch render failed')
    }

    await sleep(1500, signal)
  }
}

export function canUseServerBatch(): boolean {
  return isSupabaseConfigured
}

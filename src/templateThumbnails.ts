import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { renderMockupInternal } from './renderApi'
import { templateToRenderScene, type SceneTemplate } from './sceneTemplates'

const CACHE_KEY = 'openmockup.templateThumbs.v1'

/** Minimal UI-like screen for thumbnail renders (no user content needed). */
const PLACEHOLDER_SCREEN =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844">
      <rect width="390" height="844" fill="#1a1a2e"/>
      <rect x="24" y="80" width="342" height="48" rx="12" fill="#2d2d44"/>
      <rect x="24" y="150" width="220" height="16" rx="4" fill="#3d3d5c"/>
      <rect x="24" y="180" width="280" height="12" rx="4" fill="#333350"/>
      <rect x="24" y="220" width="342" height="200" rx="16" fill="#252540"/>
    </svg>`,
  )

type ThumbCache = Record<string, string>

function readCache(): ThumbCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as ThumbCache
  } catch {
    return {}
  }
}

function writeCache(cache: ThumbCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* quota exceeded — skip */
  }
}

export function getCachedThumbnail(templateId: string): string | null {
  return readCache()[templateId] ?? null
}

export function setCachedThumbnail(templateId: string, dataUrl: string) {
  const cache = readCache()
  cache[templateId] = dataUrl
  writeCache(cache)
}

export function isImageThumbnail(thumbnail: string): boolean {
  return thumbnail.startsWith('data:image') || thumbnail.startsWith('http')
}

export function templatePreviewStyle(thumbnail: string): CSSProperties {
  if (isImageThumbnail(thumbnail)) {
    return {
      backgroundImage: `url(${thumbnail})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  return { background: thumbnail }
}

let renderQueue: Promise<unknown> = Promise.resolve()

/** Render a small PNG preview and cache it. Serialized to avoid GL contention. */
export function renderAndCacheTemplateThumbnail(t: SceneTemplate): Promise<string> {
  if (isImageThumbnail(t.thumbnail)) return Promise.resolve(t.thumbnail)
  const cached = getCachedThumbnail(t.id)
  if (cached) return Promise.resolve(cached)

  renderQueue = renderQueue.then(async () => {
    try {
      const scene = templateToRenderScene(t)
      const dataUrl = (await renderMockupInternal({
        ...scene,
        imageDataUrl: PLACEHOLDER_SCREEN,
        width: 480,
        height: 270,
        returnFormat: 'dataUrl',
      })) as string
      setCachedThumbnail(t.id, dataUrl)
    } catch {
      /* keep CSS fallback */
    }
  })

  return renderQueue.then(() => getCachedThumbnail(t.id) ?? t.thumbnail)
}

/** Warm-cache built-in template thumbnails in the background. */
export function warmBuiltinTemplateThumbnails(templates: SceneTemplate[]): void {
  for (const t of templates) {
    if (t.id.startsWith('user-')) continue
    if (isImageThumbnail(t.thumbnail) || getCachedThumbnail(t.id)) continue
    void renderAndCacheTemplateThumbnail(t)
  }
}

export function useTemplateThumbnail(template: SceneTemplate): string {
  const initial =
    isImageThumbnail(template.thumbnail)
      ? template.thumbnail
      : getCachedThumbnail(template.id) ?? template.thumbnail

  const [thumb, setThumb] = useState(initial)

  useEffect(() => {
    if (isImageThumbnail(template.thumbnail)) {
      setThumb(template.thumbnail)
      return
    }
    const cached = getCachedThumbnail(template.id)
    if (cached) {
      setThumb(cached)
      return
    }
    let cancelled = false
    renderAndCacheTemplateThumbnail(template).then((url) => {
      if (!cancelled) setThumb(url)
    })
    return () => {
      cancelled = true
    }
  }, [template.id, template.thumbnail])

  return thumb
}

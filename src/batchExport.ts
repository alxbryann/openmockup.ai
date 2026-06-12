import { zipSync } from 'fflate'
import { applySceneConfig, renderMockupInternal, type RenderMockupOpts } from './renderApi'
import { buildTemplateSnapshot, getSceneTemplate } from './sceneTemplates'
import { useStore } from './store'
import { resolveExportDimensions } from './aspectPresets'
import { exportPixelSize } from './highResCapture'
import type { AspectPreset } from './store'

export type BatchItem = {
  name: string
  file: File
  dataUrl?: string
}

export type BatchExportOpts = {
  items: BatchItem[]
  templateId?: string
  aspectPreset?: AspectPreset
  exportPreset?: 'screen' | 1920 | 3840
  transparent?: boolean
  onProgress?: (done: number, total: number, currentName: string) => void
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

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/\.[^.]+$/, '') + '.png'
}

export async function runBatchExport(opts: BatchExportOpts): Promise<Blob> {
  const { items, templateId, aspectPreset = 'free', exportPreset = 1920, transparent, onProgress, signal } = opts
  if (items.length === 0) throw new Error('No files to export')
  if (items.length > 30) throw new Error('Maximum 30 files per batch')

  const tpl = templateId ? getSceneTemplate(templateId) : null
  if (templateId && !tpl) throw new Error(`Unknown template: ${templateId}`)

  const zipEntries: Record<string, Uint8Array> = {}
  const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
  const capture = useStore.getState().captureSceneAtSize

  for (let i = 0; i < items.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const item = items[i]
    onProgress?.(i, items.length, item.name)

    const dataUrl = item.dataUrl ?? (await fileToDataUrl(item.file))

    if (tpl) {
      const patch = buildTemplateSnapshot(tpl, useStore.getState().devices)
      useStore.getState().applySceneSnapshot(patch)
    }

    const activeId = useStore.getState().activeDeviceId
    useStore.getState().updateDevice(activeId, {
      screenshot: dataUrl,
      screenMediaKind: 'image',
    })

    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    let pngBytes: ArrayBuffer

    const sceneOpts: RenderMockupOpts = {
      imageDataUrl: dataUrl,
      aspectPreset,
      transparent,
      returnFormat: 'arrayBuffer',
    }

    if (typeof (window as unknown as { renderMockup?: unknown }).renderMockup === 'function') {
      pngBytes = (await renderMockupInternal(sceneOpts)) as ArrayBuffer
    } else if (capture && canvas) {
      applySceneConfig({ ...sceneOpts, returnFormat: 'dataUrl' })
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
      const { w, h } =
        aspectPreset !== 'free'
          ? resolveExportDimensions(aspectPreset, exportPreset === 'screen' ? 'screen' : exportPreset, canvas.clientWidth, canvas.clientHeight)
          : exportPreset === 'screen'
            ? { w: canvas.clientWidth, h: canvas.clientHeight }
            : exportPixelSize(exportPreset as 1920 | 3840, canvas.clientWidth, canvas.clientHeight)
      const captureOpts = transparent ? { transparent: true as const } : undefined
      const url = capture(w, h, captureOpts)
      const base64 = url.split(',')[1] ?? ''
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j)
      pngBytes = bytes.buffer
    } else {
      throw new Error('Scene not ready for batch export')
    }

    zipEntries[sanitizeFilename(item.name)] = new Uint8Array(pngBytes)
  }

  onProgress?.(items.length, items.length, 'done')
  const zipped = zipSync(zipEntries, { level: 6 })
  return new Blob([zipped], { type: 'application/zip' })
}

export function downloadBatchZip(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `openmockup-batch-${Date.now()}.zip`
  a.click()
  URL.revokeObjectURL(url)
}

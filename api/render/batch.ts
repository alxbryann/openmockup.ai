import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import chromium from '@sparticuz/chromium'
import playwright from 'playwright-core'
import { zipSync } from 'fflate'

const OPENMOCKUP_URL = process.env.OPENMOCKUP_URL ?? 'https://openmockup.dev'
const MAX_ITEMS = 20

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin not configured')
  return createClient(url, key)
}

type BatchBody = {
  items: Array<{ name: string; imageDataUrl: string }>
  scene?: Record<string, unknown>
}

async function processBatchJob(jobId: string, userId: string, body: BatchBody) {
  const supabase = getSupabaseAdmin()
  const update = async (patch: Record<string, unknown>) => {
    await supabase.from('render_jobs').update(patch).eq('id', jobId)
  }

  await update({ status: 'running', progress: 0 })
  let browser: playwright.Browser | null = null

  try {
    browser = await playwright.chromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    })
    const page = await browser.newPage()
    await page.goto(`${OPENMOCKUP_URL}?headless`, { waitUntil: 'networkidle', timeout: 45000 })
    await page.waitForFunction(() => (window as unknown as { __rendererReady?: boolean }).__rendererReady === true, { timeout: 30000 })

    const zipEntries: Record<string, Uint8Array> = {}
    const total = body.items.length

    for (let i = 0; i < total; i++) {
      const item = body.items[i]
      const pngDataUrl = await page.evaluate(async (opts) => {
        return (window as unknown as { renderMockup: (x: Record<string, unknown>) => Promise<string> }).renderMockup(opts)
      }, {
        ...body.scene,
        imageDataUrl: item.imageDataUrl,
      })

      const base64 = pngDataUrl.split(',')[1] ?? ''
      const binary = Buffer.from(base64, 'base64')
      const safeName = item.name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/\.[^.]+$/, '') + '.png'
      zipEntries[safeName] = new Uint8Array(binary)
      await update({ progress: Math.round(((i + 1) / total) * 100) })
    }

    const zipped = zipSync(zipEntries, { level: 6 })
    const resultPath = `${userId}/batch/${jobId}.zip`
    const { error: upErr } = await supabase.storage
      .from('render-results')
      .upload(resultPath, zipped, { upsert: true, contentType: 'application/zip' })
    if (upErr) throw upErr

    await update({ status: 'done', progress: 100, result_path: resultPath })
  } catch (e) {
    await update({
      status: 'failed',
      error_message: e instanceof Error ? e.message : 'Batch render failed',
    })
  } finally {
    await browser?.close()
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' })
  }

  const token = auth.slice(7)
  const supabase = getSupabaseAdmin()
  const { data: userData, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !userData.user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const body = req.body as BatchBody
  if (!body.items?.length) {
    return res.status(400).json({ error: 'items required' })
  }
  if (body.items.length > MAX_ITEMS) {
    return res.status(400).json({ error: `Maximum ${MAX_ITEMS} items per batch` })
  }

  const { data: job, error: insertErr } = await supabase
    .from('render_jobs')
    .insert({
      user_id: userData.user.id,
      status: 'queued',
      total_items: body.items.length,
      payload: body as unknown as Record<string, unknown>,
    })
    .select('id')
    .single()

  if (insertErr || !job) {
    return res.status(500).json({ error: insertErr?.message ?? 'Failed to create job' })
  }

  // Process inline (v1); upgrade to background worker for large batches
  void processBatchJob(job.id, userData.user.id, body)

  return res.status(202).json({ jobId: job.id })
}

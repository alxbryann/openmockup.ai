import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import chromium from '@sparticuz/chromium'
import playwright from 'playwright-core'

const OPENMOCKUP_URL = process.env.OPENMOCKUP_URL ?? 'https://openmockup.dev'

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin not configured')
  return createClient(url, key)
}

async function renderPng(page: playwright.Page, opts: Record<string, unknown>): Promise<string> {
  return page.evaluate(async (o) => {
    await (window as unknown as { renderMockup: (x: Record<string, unknown>) => Promise<string> }).renderMockup(o)
  }, opts)
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

  const body = req.body as {
    imageDataUrl?: string
    templateId?: string
    aspectPreset?: string
    width?: number
    height?: number
    camera_preset?: string
    bgColor?: string
    transparent?: boolean
  }

  if (!body.imageDataUrl) {
    return res.status(400).json({ error: 'imageDataUrl required' })
  }

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

    const pngDataUrl = await renderPng(page, {
      imageDataUrl: body.imageDataUrl,
      aspectPreset: body.aspectPreset,
      width: body.width,
      height: body.height,
      camera_preset: body.camera_preset,
      bgColor: body.bgColor,
      transparent: body.transparent,
    })

    const base64 = pngDataUrl.split(',')[1] ?? ''
    return res.status(200).json({ pngBase64: base64 })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Render failed' })
  } finally {
    await browser?.close()
  }
}

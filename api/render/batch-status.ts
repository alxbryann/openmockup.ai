import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin not configured')
  return createClient(url, key)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
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

  const jobId = req.query.id as string
  if (!jobId) {
    return res.status(400).json({ error: 'id query param required' })
  }

  const { data: job, error } = await supabase
    .from('render_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  if (!job) return res.status(404).json({ error: 'Job not found' })

  let downloadUrl: string | undefined
  if (job.status === 'done' && job.result_path) {
    const { data: signed } = await supabase.storage
      .from('render-results')
      .createSignedUrl(job.result_path, 3600)
    downloadUrl = signed?.signedUrl
  }

  return res.status(200).json({
    status: job.status,
    progress: job.progress,
    downloadUrl,
    error: job.error_message,
  })
}

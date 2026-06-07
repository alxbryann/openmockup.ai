/** OAuth callback URL — must match Supabase Auth → URL Configuration redirect allow-list. */
export function getAuthRedirectUrl(search = '?studio'): string {
  const configured = import.meta.env.VITE_AUTH_REDIRECT_URL as string | undefined
  if (configured) return configured

  const url = new URL(search, window.location.origin)
  return url.href
}

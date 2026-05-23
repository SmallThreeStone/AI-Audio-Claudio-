import api from './client'

export async function startQrLogin() {
  const { data } = await api.post('/auth/qr/start')
  return data as { qr_key: string; qr_url: string }
}

export async function checkQrStatus(key: string) {
  const { data } = await api.get('/auth/qr/status', { params: { key } })
  return data as { code: number; message: string; cookies?: Record<string, string>; nickname?: string; avatar_url?: string }
}

export async function getAuthStatus() {
  const { data } = await api.get('/auth/status')
  return data as { logged_in: boolean; nickname?: string; avatar_url?: string }
}

export async function logout() {
  await api.post('/auth/logout')
}

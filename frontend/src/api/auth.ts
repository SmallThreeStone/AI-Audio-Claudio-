import api from './client'

export async function startQrLogin() {
  const { data } = await api.post('/auth/qr/start')
  return data as { qr_key: string; qr_url: string }
}

export async function checkQrStatus(key: string) {
  const { data } = await api.get('/auth/qr/status', { params: { key } })
  return data as { code: number; message: string; cookies?: Record<string, string>; nickname?: string; avatar_url?: string; role?: string; user_id?: number; client_id?: string; auto_sync?: boolean }
}

export async function getAuthStatus() {
  const { data } = await api.get('/auth/status')
  return data as { logged_in: boolean; user_id?: number; client_id?: string; nickname?: string; avatar_url?: string; role?: string }
}

export async function phoneLogin(phone: string, password: string, countrycode?: string, captcha?: string) {
  const { data } = await api.post('/auth/login/phone', { phone, password, countrycode, captcha })
  return data as { code: number; message: string; nickname?: string; avatar_url?: string; role?: string; user_id?: number; client_id?: string; auto_sync?: boolean }
}

export async function sendCaptcha(phone: string, countrycode?: string) {
  const { data } = await api.post('/auth/login/phone/captcha', { phone, countrycode })
  return data as { code: number; message: string }
}

export async function verifyAdminPassword(password: string) {
  const { data } = await api.post('/auth/admin/verify', { password })
  return data as { valid: boolean; message?: string }
}

export async function logout() {
  await api.post('/auth/logout')
}

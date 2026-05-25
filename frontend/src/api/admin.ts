import api from './client'

export interface AdminUser {
  id: number
  netease_uid: number | null
  nickname: string | null
  avatar_url: string | null
  login_status: string
  role: string
  session_count: number
  listen_count: number
  created_at: string | null
  updated_at: string | null
}

export interface AdminOverview {
  total_users: number
  total_sessions: number
  total_songs: number
  total_listens: number
  active_users: number
  sessions_today: number
}

export interface AdminSession {
  id: number
  user_id: number | null
  user_nickname: string
  user_request: string
  session_theme: string | null
  status: string
  persona: string | null
  total_items: number
  played_items: number
  created_at: string | null
}

export interface AdminListenEvent {
  id: number
  user_nickname: string
  song_name: string
  event: string
  completion_rate: number | null
  listened_at: string | null
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const { data } = await api.get('/admin/users')
  return data.users
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const { data } = await api.get('/admin/overview')
  return data
}

export async function getAdminSessions(): Promise<AdminSession[]> {
  const { data } = await api.get('/admin/sessions')
  return data.sessions
}

export async function getAdminListening(): Promise<AdminListenEvent[]> {
  const { data } = await api.get('/admin/listening')
  return data.events
}

export interface AdminTrend {
  date: string
  sessions: number
  listens: number
}

export interface AdminHourly {
  hour: number
  count: number
}

export async function getAdminTrends(days = 7): Promise<AdminTrend[]> {
  const { data } = await api.get('/admin/trends', { params: { days } })
  return data.trends
}

export async function getAdminHourly(): Promise<AdminHourly[]> {
  const { data } = await api.get('/admin/hourly')
  return data.hourly
}

export interface AdminAnomaly {
  level: 'warning' | 'info'
  title: string
  detail: string
  suggestion: string
}

export async function getAdminAnomalies(): Promise<{ alerts: AdminAnomaly[]; total: number }> {
  const { data } = await api.get('/admin/anomalies')
  return data
}

// Owner-only actions

export interface UserProfile {
  user: { id: number; nickname: string | null; avatar_url: string | null; login_status: string; role: string }
  total_listens: number
  session_count: number
  genres: { name: string; count: number }[]
  artists: { name: string; count: number }[]
  time_patterns: { morning: number; afternoon: number; evening: number; night: number }
}

export async function setUserRole(userId: number, role: string): Promise<void> {
  await api.put(`/admin/users/${userId}/role`, { role })
}

export async function forceStopSession(sessionId: number): Promise<void> {
  await api.post(`/admin/sessions/${sessionId}/stop`)
}

export async function getUserProfile(userId: number): Promise<UserProfile> {
  const { data } = await api.get(`/admin/users/${userId}/profile`)
  return data
}

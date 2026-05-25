import api from './client'
import type { DJSession, DJPersona, MusicProfile, TTSVoice, DlnaDevice } from '../types'

export async function requestRadio(text: string, persona: string = 'xiaoyu', clientId: string = '') {
  const { data } = await api.post('/radio/request', { text, persona, client_id: clientId })
  return data as { session_id: number; message: string }
}

export async function getSessions() {
  const { data } = await api.get('/radio/sessions')
  return data as DJSession[]
}

export async function getPersonas() {
  const { data } = await api.get('/radio/personas')
  return data as DJPersona[]
}

export async function getQueue() {
  const { data } = await api.get('/radio/queue')
  return data
}

export async function getMusicProfile() {
  const { data } = await api.get('/radio/profile')
  return data as MusicProfile
}

export async function recordFeedback(queueItemId: number, feedback: 'liked' | 'disliked') {
  await api.post('/radio/feedback', { queue_item_id: queueItemId, feedback })
}

export async function recordListenEvent(queueItemId: number, event: 'started' | 'completed' | 'skipped', positionSeconds: number = 0) {
  await api.post('/radio/listen-event', { queue_item_id: queueItemId, event, position_seconds: positionSeconds })
}

export async function skipTrack() {
  await api.post('/radio/skip')
}

export async function skipToTrack(queueItemId: number) {
  await api.post(`/radio/skip-to/${queueItemId}`)
}

export async function stopRadio() {
  await api.post('/radio/stop')
}

export async function getVoices() {
  const { data } = await api.get('/settings/voices')
  return data.voices as TTSVoice[]
}

export async function getTtsProvider() {
  const { data } = await api.get('/settings/tts-provider')
  return data.provider as string
}

export async function setTtsProvider(provider: 'edge' | 'fish') {
  await api.post('/settings/tts-provider', { provider })
}

export async function getCalendarStatus() {
  const { data } = await api.get('/calendar/status')
  return data as { connected: boolean; last_sync: string | null }
}

export async function getWeather() {
  const { data } = await api.get('/radio/weather')
  return data as import('../types').WeatherInfo
}

export async function getGreeting() {
  const { data } = await api.get('/radio/greeting')
  return data as {
    greeting_text: string
    suggested_mood: string
    time_label: string
    time_mood: string
    recent_artists: string[]
    top_genre: string
  }
}

// DLNA

export async function getDlnaDevices(force = false) {
  const { data } = await api.get('/dlna/devices', { params: { force } })
  return data.devices as DlnaDevice[]
}

export async function pushToDevice(deviceLocation: string, songId: number, title: string) {
  const { data } = await api.post('/dlna/play', {
    device_location: deviceLocation,
    song_id: songId,
    title,
  })
  return data
}

export async function stopDevice(deviceLocation: string) {
  await api.post('/dlna/stop', { device_location: deviceLocation })
}

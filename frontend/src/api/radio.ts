import api from './client'
import type { DJSession } from '../types'

export async function requestRadio(text: string) {
  const { data } = await api.post('/radio/request', { text })
  return data as { session_id: number; message: string }
}

export async function getSessions() {
  const { data } = await api.get('/radio/sessions')
  return data as DJSession[]
}

export async function getQueue() {
  const { data } = await api.get('/radio/queue')
  return data
}

export async function skipTrack() {
  await api.post('/radio/skip')
}

export async function stopRadio() {
  await api.post('/radio/stop')
}

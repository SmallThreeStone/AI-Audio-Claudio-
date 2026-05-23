import api from './client'
import type { DJSession, DJPersona, MusicProfile, TTSVoice } from '../types'

export async function requestRadio(text: string, persona: string = 'xiaoyu') {
  const { data } = await api.post('/radio/request', { text, persona })
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

export async function skipTrack() {
  await api.post('/radio/skip')
}

export async function stopRadio() {
  await api.post('/radio/stop')
}

export async function getVoices() {
  const { data } = await api.get('/settings/voices')
  return data.voices as TTSVoice[]
}

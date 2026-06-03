import api from './client'
import type { Song } from '../types'

export interface MaterialExpandResult {
  query: string
  intent: {
    raw_text: string
    query: string
    artist?: string | null
    moods: string[]
    scenes: string[]
    energy: 'low' | 'medium' | 'high'
  }
  found: number
  added: number
  total_material: number
  songs: Song[]
  message: string
  error?: string
}

export async function expandMaterial(text: string, limit = 12) {
  const { data } = await api.post('/ai-material/expand', { text, limit })
  return data as MaterialExpandResult
}

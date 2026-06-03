import api from './client'
import type { Song } from '../types'

export async function searchNeteaseSongs(q: string, limit = 12) {
  const { data } = await api.get('/songs/netease-search', { params: { q, limit } })
  return data as { songs: Song[]; attached?: boolean }
}

export async function importPublicPlaylist(url: string) {
  const { data } = await api.post('/songs/import-public-playlist', { url })
  return data as { playlist_id?: number; name?: string; imported: number; total?: number; error?: string }
}

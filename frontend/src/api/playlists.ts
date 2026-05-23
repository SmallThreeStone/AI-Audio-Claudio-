import api from './client'
import type { Playlist } from '../types'

export async function getPlaylists() {
  const { data } = await api.get('/playlists')
  return data as Playlist[]
}

export async function syncPlaylists() {
  const { data } = await api.post('/playlists/sync')
  return data as { synced: number; new_songs: number; enriched: number }
}

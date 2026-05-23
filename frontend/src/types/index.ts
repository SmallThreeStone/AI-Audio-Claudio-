export interface User {
  id: number
  netease_uid?: number
  nickname?: string
  avatar_url?: string
  login_status: 'logged_out' | 'qr_pending' | 'logged_in'
}

export interface Playlist {
  id: number
  netease_playlist_id: number
  name: string
  description?: string
  cover_url?: string
  song_count: number
  is_liked: boolean
  last_synced?: string
}

export interface Song {
  id: number
  netease_song_id: number
  name: string
  artist?: string
  album?: string
  duration_ms?: number
  cover_url?: string
  genre?: string
  mood_tags?: string
  bpm?: number
  popularity?: number
}

export interface QueueItem {
  id: number
  session_id: number
  position: number
  item_type: 'tts_intro' | 'tts_bridge' | 'tts_outro' | 'song'
  song_id?: number
  song_name?: string
  artist?: string
  cover_url?: string
  duration_ms?: number
  tts_text?: string
  tts_audio_url?: string
  intro_text?: string
  stream_url?: string
  status: 'pending' | 'tts_generating' | 'ready' | 'error'
  error_message?: string
}

export interface DJSession {
  id: number
  user_request: string
  session_theme?: string
  status: 'pending' | 'generating' | 'refilling' | 'ready' | 'playing' | 'completed' | 'error'
  total_items: number
  played_items: number
  created_at: string
}

export type WSMessageType =
  | 'queue_update'
  | 'progress'
  | 'session_status'
  | 'error'
  | 'command'
  | 'item_error'

export interface WSMessage {
  type: WSMessageType
  [key: string]: unknown
}

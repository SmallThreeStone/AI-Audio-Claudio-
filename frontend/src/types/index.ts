export interface User {
  id: number
  client_id?: string
  netease_uid?: number
  nickname?: string
  avatar_url?: string
  login_status: 'logged_out' | 'qr_pending' | 'logged_in'
  role?: 'admin' | 'user' | 'owner'
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
  status: 'pending' | 'tts_generating' | 'ready' | 'error' | 'skipped' | 'completed'
  error_message?: string
  user_feedback?: 'liked' | 'disliked'
}

export interface DJSession {
  id: number
  user_request: string
  session_theme?: string
  status: 'pending' | 'generating' | 'refilling' | 'ready' | 'playing' | 'completed' | 'error'
  persona?: string
  total_items: number
  played_items: number
  weather_summary?: string
  created_at: string
}

export interface DJPersona {
  id: string
  name: string
  emoji: string
  tagline: string
  voice: string
  style: string
}

export interface TTSVoice {
  id: string
  name: string
  gender: string
  style: string
}

export interface MusicProfile {
  total_songs: number
  total_likes: number
  total_listens: number
  genres: { name: string; count: number }[]
  moods: { name: string; count: number }[]
  bpm_buckets: { name: string; count: number }[]
  top_artists: { name: string; count: number }[]
  recently_played: { song_id: number; name: string; artist: string; cover_url: string; listened_at: string }[]
  completed_artists: { name: string; completion_rate: number; total_plays: number }[]
  skipped_artists: { name: string; skip_rate: number; total_plays: number }[]
  time_patterns: { morning: number; afternoon: number; evening: number; night: number }
}

export interface WeatherInfo {
  available: boolean
  city?: string
  country?: string
  temperature?: number
  feels_like?: number
  humidity?: number
  condition?: string
  condition_code?: string
  summary?: string
}

export interface DlnaDevice {
  udn: string
  name: string
  location: string
  manufacturer: string
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

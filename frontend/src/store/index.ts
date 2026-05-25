import { create } from 'zustand'
import type { User, Playlist, QueueItem, DJSession, DlnaDevice } from '../types'

interface AuthSlice {
  user: User | null
  isLoggedIn: boolean
  qrKey: string | null
  qrUrl: string | null
  setUser: (user: User | null) => void
  setQrInfo: (key: string, url: string) => void
  clearQrInfo: () => void
}

interface PlaylistSlice {
  playlists: Playlist[]
  setPlaylists: (playlists: Playlist[]) => void
}

interface PlayerSlice {
  isPlaying: boolean
  currentItem: QueueItem | null
  currentTime: number
  duration: number
  volume: number
  setIsPlaying: (playing: boolean) => void
  setCurrentItem: (item: QueueItem | null) => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setVolume: (volume: number) => void
}

interface QueueSlice {
  queue: QueueItem[]
  currentIndex: number
  session: DJSession | null
  isGenerating: boolean
  generationStage: string
  generationMessage: string
  setQueue: (queue: QueueItem[]) => void
  setCurrentIndex: (index: number) => void
  setSession: (session: DJSession | null) => void
  setIsGenerating: (generating: boolean) => void
  setGenerationProgress: (stage: string, message: string) => void
}

interface DlnaSlice {
  dlnaDevices: DlnaDevice[]
  activeDlnaDevice: DlnaDevice | null
  isDiscovering: boolean
  setDlnaDevices: (devices: DlnaDevice[]) => void
  setActiveDlnaDevice: (device: DlnaDevice | null) => void
  setIsDiscovering: (discovering: boolean) => void
}

interface SettingsSlice {
  selectedPersona: string
  sleepTimerMinutes: number
  sleepTimerEnd: number | null
  showShortcuts: boolean
  showTranscript: boolean
  showSettings: boolean
  showAdmin: boolean
  isRestoring: boolean
  notice: string | null
  setSelectedPersona: (persona: string) => void
  setSleepTimer: (minutes: number) => void
  clearSleepTimer: () => void
  setShowShortcuts: (show: boolean) => void
  setShowTranscript: (show: boolean) => void
  setShowSettings: (show: boolean) => void
  setShowAdmin: (show: boolean) => void
  setIsRestoring: (restoring: boolean) => void
  setNotice: (msg: string | null) => void
}

export const useStore = create<AuthSlice & PlaylistSlice & PlayerSlice & QueueSlice & DlnaSlice & SettingsSlice>((set) => ({
  // Auth
  user: null,
  isLoggedIn: false,
  qrKey: null,
  qrUrl: null,
  setUser: (user) => set({ user, isLoggedIn: !!user && user.login_status === 'logged_in' }),
  setQrInfo: (key, url) => set({ qrKey: key, qrUrl: url }),
  clearQrInfo: () => set({ qrKey: null, qrUrl: null }),

  // Playlists
  playlists: [],
  setPlaylists: (playlists) => set({ playlists }),

  // Player
  isPlaying: false,
  currentItem: null,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentItem: (currentItem) => set({ currentItem }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume }),

  // Queue
  queue: [],
  currentIndex: 0,
  session: null,
  isGenerating: false,
  generationStage: '',
  generationMessage: '',
  setQueue: (queue) => set({ queue }),
  setCurrentIndex: (currentIndex) => set({ currentIndex }),
  setSession: (session) => set({ session }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setGenerationProgress: (stage, message) => set({ generationStage: stage, generationMessage: message }),

  // DLNA
  dlnaDevices: [],
  activeDlnaDevice: null,
  isDiscovering: false,
  setDlnaDevices: (devices) => set({ dlnaDevices: devices }),
  setActiveDlnaDevice: (device) => set({ activeDlnaDevice: device }),
  setIsDiscovering: (discovering) => set({ isDiscovering: discovering }),

  // Settings
  selectedPersona: 'xiaoyu',
  sleepTimerMinutes: 0,
  sleepTimerEnd: null,
  showShortcuts: false,
  showTranscript: false,
  showSettings: false,
  showAdmin: false,
  isRestoring: false,
  notice: null,
  setSelectedPersona: (persona) => set({ selectedPersona: persona }),
  setSleepTimer: (minutes) => set({ sleepTimerMinutes: minutes, sleepTimerEnd: Date.now() + minutes * 60 * 1000 }),
  clearSleepTimer: () => set({ sleepTimerMinutes: 0, sleepTimerEnd: null }),
  setShowShortcuts: (show) => set({ showShortcuts: show }),
  setShowTranscript: (show) => set({ showTranscript: show }),
  setShowSettings: (show) => set({ showSettings: show }),
  setShowAdmin: (show) => set({ showAdmin: show }),
  setIsRestoring: (restoring) => set({ isRestoring: restoring }),
  setNotice: (notice) => set({ notice }),
}))

import { create } from 'zustand'
import type { User, Playlist, QueueItem, DJSession, DlnaDevice, LyricLine } from '../types'

interface AuthSlice {
  user: User | null
  clientId: string | null
  isLoggedIn: boolean
  qrKey: string | null
  qrUrl: string | null
  setUser: (user: User | null) => void
  setClientId: (id: string) => void
  setQrInfo: (key: string, url: string) => void
  clearQrInfo: () => void
}

interface PlaylistSlice {
  playlists: Playlist[]
  setPlaylists: (playlists: Playlist[]) => void
}

interface PlayerSlice {
  isPlaying: boolean
  isAudioLoading: boolean
  currentItem: QueueItem | null
  currentTime: number
  duration: number
  volume: number
  playHistory: QueueItem[]
  previousItem: QueueItem | null
  frequencyData: Uint8Array
  lowFreqEnergy: number
  lyrics: LyricLine[]
  activeLyricIndex: number
  setIsPlaying: (playing: boolean) => void
  setIsAudioLoading: (loading: boolean) => void
  setCurrentItem: (item: QueueItem | null) => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setVolume: (volume: number) => void
  addToHistory: (item: QueueItem) => void
  clearHistory: () => void
  setFrequencyData: (data: Uint8Array) => void
  setLowFreqEnergy: (energy: number) => void
  setLyrics: (lyrics: LyricLine[]) => void
  setActiveLyricIndex: (index: number) => void
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
  adminVerified: boolean
  isRestoring: boolean
  notice: string | null
  demoMode: boolean
  setSelectedPersona: (persona: string) => void
  setSleepTimer: (minutes: number) => void
  clearSleepTimer: () => void
  setShowShortcuts: (show: boolean) => void
  setShowTranscript: (show: boolean) => void
  setShowSettings: (show: boolean) => void
  setShowAdmin: (show: boolean) => void
  setAdminVerified: (verified: boolean) => void
  setIsRestoring: (restoring: boolean) => void
  setNotice: (msg: string | null) => void
  setDemoMode: (v: boolean) => void
}

export const useStore = create<AuthSlice & PlaylistSlice & PlayerSlice & QueueSlice & DlnaSlice & SettingsSlice>((set) => ({
  // Auth
  user: null,
  clientId: null,
  isLoggedIn: false,
  qrKey: null,
  qrUrl: null,
  setUser: (user) => set({ user, isLoggedIn: !!user && user.login_status === 'logged_in' }),
  setClientId: (clientId) => set({ clientId }),
  setQrInfo: (key, url) => set({ qrKey: key, qrUrl: url }),
  clearQrInfo: () => set({ qrKey: null, qrUrl: null }),

  // Playlists
  playlists: [],
  setPlaylists: (playlists) => set({ playlists }),

  // Player
  isPlaying: false,
  isAudioLoading: false,
  currentItem: null,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  playHistory: [],
  previousItem: null,
  frequencyData: new Uint8Array(128),
  lowFreqEnergy: 0,
  lyrics: [],
  activeLyricIndex: -1,
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setIsAudioLoading: (isAudioLoading) => set({ isAudioLoading }),
  setCurrentItem: (currentItem) => set({ currentItem }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume }),
  addToHistory: (item) => set((s) => {
    // Keep last 50 played items, avoid duplicates in a row
    const prev = s.playHistory[0]
    if (prev && prev.id === item.id) return s
    return { playHistory: [item, ...s.playHistory].slice(0, 50), previousItem: item }
  }),
  clearHistory: () => set({ playHistory: [], previousItem: null }),
  setFrequencyData: (frequencyData) => set({ frequencyData }),
  setLowFreqEnergy: (lowFreqEnergy) => set({ lowFreqEnergy }),
  setLyrics: (lyrics) => set({ lyrics }),
  setActiveLyricIndex: (activeLyricIndex) => set({ activeLyricIndex }),

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
  adminVerified: false,
  isRestoring: false,
  notice: null,
  setSelectedPersona: (persona) => set({ selectedPersona: persona }),
  setSleepTimer: (minutes) => set({ sleepTimerMinutes: minutes, sleepTimerEnd: Date.now() + minutes * 60 * 1000 }),
  clearSleepTimer: () => set({ sleepTimerMinutes: 0, sleepTimerEnd: null }),
  setShowShortcuts: (show) => set({ showShortcuts: show }),
  setShowTranscript: (show) => set({ showTranscript: show }),
  setShowSettings: (show) => set({ showSettings: show }),
  setShowAdmin: (show) => set({ showAdmin: show, adminVerified: false }),
  setAdminVerified: (verified) => set({ adminVerified: verified }),
  setIsRestoring: (restoring) => set({ isRestoring: restoring }),
  setNotice: (notice) => set({ notice }),

  // Demo
  demoMode: false,
  setDemoMode: (v) => set({ demoMode: v }),
}))

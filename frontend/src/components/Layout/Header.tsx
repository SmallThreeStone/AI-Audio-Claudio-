import { useEffect, useState } from 'react'
import { useStore } from '../../store'
import { logout } from '../../api/auth'
import { getWeather } from '../../api/radio'
import type { WeatherInfo } from '../../types'

const WEATHER_ICON: Record<string, string> = {
  Clear: '☀️',
  Clouds: '⛅',
  Rain: '🌧',
  Drizzle: '🌦',
  Thunderstorm: '⛈',
  Snow: '❄️',
  Mist: '🌫',
  Fog: '🌫',
  Haze: '🌫',
  Dust: '💨',
  Sand: '💨',
  Squall: '🌬',
  Tornado: '🌪',
}

export default function Header() {
  const { user, isPlaying, session, setUser, setShowTranscript, setShowShortcuts, setShowAdmin, setShowSettings } = useStore()
  const [weather, setWeather] = useState<WeatherInfo | null>(null)

  useEffect(() => {
    getWeather().then(setWeather).catch(() => {})
  }, [])

  const handleLogout = async () => {
    await logout()
    setUser(null)
  }

  return (
    <header
      className="border-b border-[var(--color-radio-border)] bg-[var(--color-radio-surface)]/80 backdrop-blur-sm sticky top-0 z-50"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-4 h-12 sm:h-14 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-[var(--color-radio-accent)] rounded-full flex items-center justify-center">
              <span className="text-white text-xs sm:text-sm font-bold">C</span>
            </div>
            <span className="text-base sm:text-lg font-bold tracking-wide">
              Claudio<span className="text-[var(--color-radio-muted)] font-normal"> FM</span>
            </span>
          </div>
          {isPlaying && (
            <div className="equalizer ml-1 sm:ml-2">
              <div className="bar" />
              <div className="bar" />
              <div className="bar" />
              <div className="bar" />
              <div className="bar" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3">
          {weather?.available && (
            <div className="flex items-center gap-1 text-xs text-[var(--color-radio-muted)]" title={weather.summary}>
              <span>{WEATHER_ICON[weather.condition_code || ''] || '🌡'}</span>
              <span className="hidden sm:inline">{weather.city}</span>
              {weather.temperature != null && (
                <span>{weather.temperature}°</span>
              )}
            </div>
          )}

          <div className="hidden sm:flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-sm text-[var(--color-radio-muted)]">ON AIR</span>
          </div>

          {session && (
            <button
              onClick={() => setShowTranscript(true)}
              className="text-xs text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)] transition-colors px-1"
              title="查看 DJ 脚本 (T)"
            >
              脚本
            </button>
          )}

          {user?.role === 'admin' && (
            <button
              onClick={() => setShowAdmin(true)}
              className="text-xs text-[var(--color-radio-gold)] hover:text-[var(--color-radio-accent)] transition-colors px-1 font-medium"
              title="管理面板"
            >
              管理
            </button>
          )}

          <button
            onClick={() => setShowSettings(true)}
            className="text-xs text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)] transition-colors px-1"
            title="设置"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          <button
            onClick={() => setShowShortcuts(true)}
            className="text-xs text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)] transition-colors px-1"
            title="快捷键 (?)"
          >
            ?
          </button>

          {user && (
            <div className="flex items-center gap-1.5 sm:gap-2">
              {user.avatar_url && (
                <img src={user.avatar_url} alt="" className="w-6 h-6 sm:w-7 sm:h-7 rounded-full" />
              )}
              <span className="text-xs sm:text-sm hidden sm:inline">{user.nickname}</span>
              <button
                onClick={handleLogout}
                className="text-xs text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)]"
              >
                退出
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

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
    getWeather().then(setWeather).catch((e) => { console.warn('Weather load failed:', e) })
  }, [])

  const handleLogout = async () => {
    await logout()
    setUser(null)
  }

  return (
    <header
      className="radio-topbar sticky top-0 z-50"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="radio-topbar__inner">
        <div className="radio-brand-cluster">
          <div className="radio-brand">
            <div className="radio-brand__mark">
              <span>R</span>
            </div>
            <span className="radio-brand__text">
              iRadio<span> AI MUSIC RADIO</span>
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

        <div className="radio-topbar__actions">
          {weather?.available && (
            <div className="radio-status-pill" title={weather.summary}>
              <span>{WEATHER_ICON[weather.condition_code || ''] || '🌡'}</span>
              <span className="hidden sm:inline">{weather.city}</span>
              {weather.temperature != null && (
                <span>{weather.temperature}°</span>
              )}
            </div>
          )}

          <div className="radio-onair">
            <div />
            <span>ON AIR</span>
          </div>

          {session && (
            <button
              onClick={() => setShowTranscript(true)}
              className="radio-text-button"
              title="查看 DJ 脚本 (T)"
            >
              脚本
            </button>
          )}

          {user?.role === 'admin' && (
            <button
              onClick={() => setShowAdmin(true)}
              className="radio-text-button radio-text-button--gold"
              title="管理面板"
            >
              管理
            </button>
          )}

          <button
            onClick={() => setShowSettings(true)}
            className="radio-icon-button"
            title="设置"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          <button
            onClick={() => setShowShortcuts(true)}
            className="radio-icon-button"
            title="快捷键 (?)"
          >
            ?
          </button>

          {user && (
            <div className="radio-user-pill">
              {user.avatar_url && (
                <img src={user.avatar_url} alt="" />
              )}
              <span>{user.nickname}</span>
              <button
                onClick={handleLogout}
                className="radio-user-pill__logout"
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

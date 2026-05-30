import { useEffect, useState, useCallback, useRef } from 'react'
import { useStore } from './store'
import ErrorBoundary from './components/common/ErrorBoundary'
import LoginModal from './components/Login/LoginModal'
import Layout from './components/Layout/Layout'
import AdminDashboard from './components/Admin/AdminDashboard'
import InstallPrompt from './components/PWA/InstallPrompt'
import OnboardingOverlay from './components/Onboarding/OnboardingOverlay'
import MobileNav from './components/Layout/MobileNav'
import type { MobileTab } from './components/Layout/MobileNav'
import RadioPlayer from './components/Player/RadioPlayer'
import ChatInput from './components/Chat/ChatInput'
import QueuePanel from './components/Queue/QueuePanel'
import PlaylistBrowser from './components/Library/PlaylistBrowser'
import ScriptTranscript from './components/Player/ScriptTranscript'
import ShortcutHelp from './components/common/ShortcutHelp'
import SettingsPanel from './components/Settings/SettingsPanel'
import MusicProfilePanel from './components/Library/MusicProfile'
import { useWebSocket } from './hooks/useWebSocket'

import { getAuthStatus, verifyAdminPassword } from './api/auth'
import { getClientId } from './utils/clientId'
import { trackEvent } from './api/analytics'

function AdminAuthGate({ onVerify }: { onVerify: () => void }) {
  const { setShowAdmin } = useStore()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return
    setLoading(true)
    setError('')
    try {
      const result = await verifyAdminPassword(password)
      if (result.valid) {
        onVerify()
      } else {
        setError(result.message || '密码错误')
      }
    } catch (e) {
      console.warn('Admin password verification failed:', e)
      setError('验证服务异常')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center radio-bg">
      <form onSubmit={handleSubmit} className="bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-2xl p-8 flex flex-col items-center gap-4 w-full max-w-sm mx-4">
        <div className="w-12 h-12 bg-[var(--color-radio-accent)] rounded-full flex items-center justify-center mb-2">
          <span className="text-white text-lg font-bold">A</span>
        </div>
        <h2 className="text-lg font-bold">管理后台</h2>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="请输入管理密码"
          autoFocus
          className="w-full bg-white/5 border border-[var(--color-radio-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-radio-text)] outline-none placeholder:text-white/20 text-center"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-[var(--color-radio-accent)] text-white rounded-lg text-sm font-medium hover:bg-[var(--color-radio-accent-dim)] transition-colors disabled:opacity-50"
        >
          {loading ? '验证中...' : '进入'}
        </button>
        <button
          type="button"
          onClick={() => setShowAdmin(false)}
          className="text-xs text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)]"
        >
          返回
        </button>
      </form>
    </div>
  )
}

function MainApp() {
  const { isLoggedIn, showAdmin, adminVerified, setAdminVerified, setUser, setClientId, clientId, setShowTranscript, setShowShortcuts, session } = useStore()
  const [checking, setChecking] = useState(true)
  const [mobileTab, setMobileTab] = useState<MobileTab>('radio')
  const [isPulling, setIsPulling] = useState(false)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [showPlaylists, setShowPlaylists] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [landscapeDismissed, setLandscapeDismissed] = useState(false)
  const ptrStartY = useRef(0)
  const ptrRef = useRef<HTMLDivElement>(null)

  // Offline detection
  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  // Pull-to-refresh: detect pull-down at top of page
  const handlePtrStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY > 5) return
    ptrStartY.current = e.touches[0].clientY
  }, [])

  const handlePtrMove = useCallback((e: React.TouchEvent) => {
    if (window.scrollY > 5) return
    const dy = e.touches[0].clientY - ptrStartY.current
    if (dy > 60) {
      setIsPulling(true)
    }
  }, [])

  const handlePtrEnd = useCallback(() => {
    if (isPulling) {
      window.location.reload()
    }
    setIsPulling(false)
    ptrStartY.current = 0
  }, [isPulling])

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

    switch (e.key) {
      case '?':
        e.preventDefault()
        setShowShortcuts(true)
        break
      case 't':
      case 'T':
        e.preventDefault()
        if (session) setShowTranscript(true)
        break
    }
  }, [session])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Initialize client identity on mount
  useEffect(() => {
    setClientId(getClientId())
    trackEvent('app_open')
  }, [])

  // Check backend session on mount (survives page refresh)
  useEffect(() => {
    getAuthStatus()
      .then((data) => {
        if (data.logged_in) {
          setUser({
            id: data.user_id || 0,
            client_id: data.client_id || clientId || undefined,
            nickname: data.nickname || '',
            avatar_url: data.avatar_url || '',
            login_status: 'logged_in',
            role: (data.role as 'admin' | 'user') || 'user',
          })
        }
        // Use client_id from response so LoginModal can start QR immediately
        else if (data.user_id) {
          setUser({
            id: data.user_id,
            client_id: data.client_id || clientId || undefined,
            login_status: 'pending',
            role: 'user',
          })
        }
      })
      .catch((e) => { console.warn('Auth status check failed:', e) })
      .finally(() => setChecking(false))
  }, [])

  useWebSocket()

  if (checking) {
    return (
      <div className="radio-bg min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--color-radio-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="radio-bg min-h-screen" onTouchStart={handlePtrStart} onTouchMove={handlePtrMove} onTouchEnd={handlePtrEnd}>
      {!isLoggedIn ? (
        <div className="min-h-screen flex items-center justify-center" data-onboarding="login">
          <LoginModal />
        </div>
      ) : showAdmin ? (
        adminVerified ? <AdminDashboard /> : <AdminAuthGate onVerify={() => setAdminVerified(true)} />
      ) : (
        <Layout>
          {offline && (
            <div className="bg-yellow-500/10 border-b border-yellow-500/30 text-yellow-400 text-xs text-center py-1.5 px-3">
              当前处于离线模式，部分功能不可用
            </div>
          )}

          <div className="flex gap-4 lg:gap-6 flex-1 px-3 sm:px-4 max-w-7xl mx-auto w-full pb-16 lg:pb-0">
            {/* Desktop sidebar: queue-focused, playlists & profile collapsed */}
            <aside className="w-72 flex-shrink-0 hidden lg:flex flex-col">
              <div className="sticky top-12 sm:top-14 overflow-y-auto max-h-[calc(100vh-3rem)] sm:max-h-[calc(100vh-3.5rem)] py-3 sm:py-4 space-y-4">
                {/* Collapsible playlists */}
                <button
                  onClick={() => setShowPlaylists(!showPlaylists)}
                  data-onboarding="sync"
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-radio-muted)] uppercase tracking-wider hover:text-[var(--color-radio-text)] transition-colors"
                >
                  <svg className={`w-3 h-3 transition-transform ${showPlaylists ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  我的歌单
                </button>
                {showPlaylists && <PlaylistBrowser hideHeader />}

                {/* Queue — always visible, the main focus */}
                <QueuePanel compact />

                {/* Collapsible music profile */}
                <button
                  onClick={() => setShowProfile(!showProfile)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-radio-muted)] uppercase tracking-wider hover:text-[var(--color-radio-text)] transition-colors"
                >
                  <svg className={`w-3 h-3 transition-transform ${showProfile ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  音乐画像
                </button>
                {showProfile && <MusicProfilePanel hideHeader />}
              </div>
            </aside>

            {/* Mobile content — switches by tab */}
            <main className="flex-1 flex flex-col items-center gap-3 sm:gap-6 py-3 sm:py-6 min-w-0 lg:hidden keyboard-avoid">
              {mobileTab === 'radio' && (
                <>
                  <RadioPlayer />
                  <ChatInput />
                  <QueuePanel />
                </>
              )}
              {mobileTab === 'playlists' && <PlaylistBrowser />}
              {mobileTab === 'profile' && <MusicProfilePanel />}
            </main>

            {/* Desktop main — full-width player area */}
            <main className="flex-1 flex-col items-center gap-3 sm:gap-6 py-3 sm:py-6 min-w-0 hidden lg:flex">
              <RadioPlayer />
              <div data-onboarding="chat"><ChatInput /></div>
            </main>
          </div>
        </Layout>
      )}

      <ScriptTranscript />
      <ShortcutHelp />
      <SettingsPanel />
      <InstallPrompt />
      <OnboardingOverlay />
      <MobileNav active={mobileTab} onChange={setMobileTab} />

      {/* Landscape overlay — prompts user to rotate on short screens */}
      {!landscapeDismissed && (
        <div className="landscape-overlay">
          <svg className="w-12 h-12 text-[var(--color-radio-accent)]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <p className="text-sm text-[var(--color-radio-text)] font-medium">请旋转手机</p>
          <p className="text-xs text-[var(--color-radio-muted)]">竖屏模式下体验更佳</p>
          <button
            onClick={() => setLandscapeDismissed(true)}
            className="mt-2 px-4 py-1.5 text-xs bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-lg text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)] transition-colors"
          >
            知道了，先不提示
          </button>
        </div>
      )}

      {/* Pull-to-refresh indicator */}
      <div ref={ptrRef} className={`ptr-indicator ${isPulling ? 'active' : ''}`}>
        <div className="ptr-spinner" />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  )
}

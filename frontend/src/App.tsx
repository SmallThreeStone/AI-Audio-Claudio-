import { useEffect, useState, useCallback } from 'react'
import { useStore } from './store'
import ErrorBoundary from './components/common/ErrorBoundary'
import LoginModal from './components/Login/LoginModal'
import Layout from './components/Layout/Layout'
import AdminDashboard from './components/Admin/AdminDashboard'
import InstallPrompt from './components/PWA/InstallPrompt'
import RadioPlayer from './components/Player/RadioPlayer'
import ChatInput from './components/Chat/ChatInput'
import QueuePanel from './components/Queue/QueuePanel'
import PlaylistBrowser from './components/Library/PlaylistBrowser'
import ScriptTranscript from './components/Player/ScriptTranscript'
import ShortcutHelp from './components/common/ShortcutHelp'
import MusicProfilePanel from './components/Library/MusicProfile'
import { useWebSocket } from './hooks/useWebSocket'

import { getAuthStatus } from './api/auth'

function MainApp() {
  const { isLoggedIn, showAdmin, setUser, setShowTranscript, setShowShortcuts, session } = useStore()
  const [checking, setChecking] = useState(true)

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

  // Check backend session on mount (survives page refresh)
  useEffect(() => {
    getAuthStatus()
      .then((data) => {
        if (data.logged_in) {
          setUser({
            id: 0,
            nickname: data.nickname || '',
            avatar_url: data.avatar_url || '',
            login_status: 'logged_in',
            role: (data.role as 'admin' | 'user') || 'user',
          })
        }
      })
      .catch(() => {})
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
    <div className="radio-bg min-h-screen">
      {!isLoggedIn ? (
        <div className="min-h-screen flex items-center justify-center">
          <LoginModal />
        </div>
      ) : showAdmin ? (
        <AdminDashboard />
      ) : (
        <Layout>
          <div className="flex gap-4 lg:gap-6 flex-1 px-3 sm:px-4 max-w-7xl mx-auto w-full">
            <aside className="w-72 flex-shrink-0 hidden lg:block">
              <div className="sticky top-12 sm:top-14 overflow-y-auto max-h-[calc(100vh-3rem)] sm:max-h-[calc(100vh-3.5rem)] py-3 sm:py-4 space-y-4">
                <PlaylistBrowser />
                <MusicProfilePanel />
              </div>
            </aside>
            <main className="flex-1 flex flex-col items-center gap-3 sm:gap-6 py-3 sm:py-6 min-w-0">
              <RadioPlayer />
              <ChatInput />
              <QueuePanel />
            </main>
          </div>
        </Layout>
      )}

      <ScriptTranscript />
      <ShortcutHelp />
      <InstallPrompt />
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

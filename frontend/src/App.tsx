import { useEffect, useState } from 'react'
import { useStore } from './store'
import ErrorBoundary from './components/common/ErrorBoundary'
import LoginModal from './components/Login/LoginModal'
import Layout from './components/Layout/Layout'
import RadioPlayer from './components/Player/RadioPlayer'
import ChatInput from './components/Chat/ChatInput'
import QueuePanel from './components/Queue/QueuePanel'
import PlaylistBrowser from './components/Library/PlaylistBrowser'
import { useWebSocket } from './hooks/useWebSocket'
import { useRadioPlayer } from './hooks/useRadioPlayer'
import { getAuthStatus } from './api/auth'

function MainApp() {
  const { isLoggedIn, setUser } = useStore()
  const [checking, setChecking] = useState(true)

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
          })
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [])

  useWebSocket()
  useRadioPlayer()

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
      ) : (
        <Layout>
          <div className="flex gap-6 flex-1 px-4 max-w-7xl mx-auto w-full">
            <aside className="w-72 flex-shrink-0 hidden lg:block">
              <div className="sticky top-14 overflow-y-auto max-h-screen py-4">
                <PlaylistBrowser />
              </div>
            </aside>
            <main className="flex-1 flex flex-col items-center gap-6 py-6">
              <RadioPlayer />
              <ChatInput />
              <QueuePanel />
            </main>
          </div>
        </Layout>
      )}
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

import { useStore } from '../../store'
import { logout } from '../../api/auth'

export default function Header() {
  const { user, isPlaying, setUser } = useStore()

  const handleLogout = async () => {
    await logout()
    setUser(null)
  }

  return (
    <header className="border-b border-[var(--color-radio-border)] bg-[var(--color-radio-surface)]/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[var(--color-radio-accent)] rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">C</span>
            </div>
            <span className="text-lg font-bold tracking-wide">
              Claudio<span className="text-[var(--color-radio-muted)] font-normal"> FM</span>
            </span>
          </div>
          {isPlaying && (
            <div className="equalizer ml-2">
              <div className="bar" />
              <div className="bar" />
              <div className="bar" />
              <div className="bar" />
              <div className="bar" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-sm text-[var(--color-radio-muted)]">ON AIR</span>
          </div>

          {user && (
            <div className="flex items-center gap-2">
              {user.avatar_url && (
                <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full" />
              )}
              <span className="text-sm">{user.nickname}</span>
              <button
                onClick={handleLogout}
                className="text-xs text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)] ml-1"
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

import { useEffect, useState } from 'react'
import { useStore } from '../../store'
import { getPlaylists, syncPlaylists } from '../../api/playlists'

export default function PlaylistBrowser() {
  const { playlists, setPlaylists } = useStore()
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    loadPlaylists()
  }, [])

  const loadPlaylists = async () => {
    try {
      const data = await getPlaylists()
      setPlaylists(data)
    } catch {
      // silent
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await syncPlaylists()
      await loadPlaylists()
    } catch (e) {
      console.error('Sync failed:', e)
    }
    setSyncing(false)
  }

  return (
    <div className="py-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[var(--color-radio-muted)] uppercase tracking-wider">
          我的歌单
        </h3>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="text-xs text-[var(--color-radio-accent)] hover:text-[var(--color-radio-accent-dim)] disabled:opacity-50"
        >
          {syncing ? '同步中...' : playlists.length === 0 ? '导入歌单' : '刷新'}
        </button>
      </div>

      {playlists.length === 0 && !syncing ? (
        <div className="text-center py-8">
          <p className="text-xs text-[var(--color-radio-muted)] mb-3">
            还没有导入歌单
          </p>
          <button
            onClick={handleSync}
            className="px-4 py-2 bg-[var(--color-radio-accent)] text-white text-sm rounded-lg hover:bg-[var(--color-radio-accent-dim)] transition-colors"
          >
            从网易云导入
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {playlists.map((pl) => (
            <div
              key={pl.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--color-radio-card)]/50 transition-colors cursor-pointer group"
            >
              {pl.cover_url ? (
                <img src={pl.cover_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-[var(--color-radio-card)] flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[var(--color-radio-muted)]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                  </svg>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{pl.name}</p>
                <p className="text-xs text-[var(--color-radio-muted)]">
                  {pl.song_count} 首{pl.is_liked && ' · 我喜欢的'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

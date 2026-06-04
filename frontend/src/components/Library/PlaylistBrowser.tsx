import { useEffect, useState } from 'react'
import { useStore } from '../../store'
import { getPlaylists, syncPlaylists } from '../../api/playlists'
import { getAuthStatus } from '../../api/auth'
import { getMusicProfile } from '../../api/radio'
import type { MusicProfile } from '../../types'
import LibraryHealthPanel from './LibraryHealthPanel'
import PublicMusicImport from './PublicMusicImport'
import AIMaterialStation from './AIMaterialStation'

const GENRE_TAGS = ['全部', '华语', '欧美', '日语', '韩语', '电子', '摇滚', '轻音乐', '说唱', '民谣']

const GENRE_KEYWORDS: Record<string, string[]> = {
  华语: ['华语', '中文', '国语', '中国', 'c-pop'],
  欧美: ['欧美', '英文', '英语', 'english', '欧', '美'],
  日语: ['日语', '日文', '日本', 'japan', 'j-pop', 'anime', '动漫'],
  韩语: ['韩语', '韩文', '韩国', 'korea', 'k-pop'],
  电子: ['电子', '电音', 'edm', 'electronic', 'remix', '混音'],
  摇滚: ['摇滚', 'rock', '乐队', '金属', 'metal'],
  轻音乐: ['轻音乐', '纯音乐', '钢琴', '古典', 'classical', 'instrumental', '治愈', '安静'],
  说唱: ['说唱', 'rap', 'hip', 'hop', 'hiphop', '嘻哈'],
  民谣: ['民谣', 'folk', '吉他', '弹唱', '独立'],
}

function matchGenre(pl: { name: string; description?: string }, tag: string): boolean {
  if (tag === '全部') return true
  const text = (pl.name + (pl.description || '')).toLowerCase()
  const keywords = GENRE_KEYWORDS[tag] || []
  return keywords.some((kw) => text.includes(kw))
}

export default function PlaylistBrowser({ hideHeader }: { hideHeader?: boolean }) {
  const { playlists, setPlaylists, user, setNotice } = useStore()
  const [syncing, setSyncing] = useState(false)
  const [activeTag, setActiveTag] = useState('全部')
  const [profile, setProfile] = useState<MusicProfile | null>(null)

  useEffect(() => {
    loadPlaylists()
  }, [])

  const loadPlaylists = async () => {
    try {
      const data = await getPlaylists()
      setPlaylists(data)
      getMusicProfile().then(setProfile).catch(() => {})
    } catch (e) {
      console.warn('Playlists load failed:', e)
    }
  }

  const handleSync = async () => {
    // Pre-check: user must be logged into Netease
    if (!user || user.login_status !== 'logged_in') {
      setNotice('绑定网易云后才能同步私人歌单；也可以先在电台页免登录开播')
      return
    }

    // Double-check server-side (cookies may have expired)
    try {
      const status = await getAuthStatus()
      if (!status.logged_in) {
        setNotice('网易云登录已过期，请重新扫码登录')
        return
      }
    } catch (e) {
      console.warn('Auth status check failed:', e)
      setNotice('网络异常，请稍后重试')
      return
    }

    setSyncing(true)
    try {
      const result = await syncPlaylists()
      if (result.error) {
        setNotice(result.error)
      } else if (result.synced === 0) {
        setNotice('未发现新星系，请确认网易云账号中有歌单')
      } else {
        setNotice(`扫描完成！${result.synced} 个星系，${result.new_songs} 个星轨`)
        await loadPlaylists()
      }
    } catch (e) {
      console.warn('Playlist sync failed:', e)
      setNotice('同步失败，请确保后端服务已启动')
    }
    setSyncing(false)
  }

  const filtered = playlists.filter((pl) => matchGenre(pl, activeTag))
  const totalSongs = playlists.reduce((sum, pl) => sum + (pl.song_count || 0), 0)
  const likedCount = playlists.filter((pl) => pl.is_liked).length

  return (
    <div className={hideHeader ? 'playlist-library playlist-library--embedded' : 'playlist-library'}>
      <div className="playlist-library__header">
        <div>
          <span>AI 候选库</span>
          <h3>歌单与搜索素材</h3>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="playlist-sync-button"
        >
          {syncing ? '同步中' : playlists.length === 0 ? '同步' : '刷新'}
        </button>
      </div>

      {playlists.length > 0 && (
        <>
          <div className="playlist-material-zone">
            <div className="playlist-section-title">
              <span>素材扩展</span>
              <em>补歌只进入候选库，不会打断当前电台</em>
            </div>
            <AIMaterialStation onExpanded={loadPlaylists} />
          </div>
          <LibraryHealthPanel playlists={playlists} profile={profile} compact={hideHeader} />
          <div className="playlist-library__stats">
            <div>
              <strong>{playlists.length}</strong>
              <span>歌单</span>
            </div>
            <div>
              <strong>{totalSongs}</strong>
              <span>歌曲</span>
            </div>
            <div>
              <strong>{likedCount}</strong>
              <span>喜欢歌单</span>
            </div>
          </div>
        </>
      )}

      {!hideHeader && playlists.length === 0 && (
        <div className="playlist-library__hint">
          <p>绑定网易云后可同步私人歌单；未绑定时也可以先搜索网易云歌曲、导入公开歌单或直接让 AI 电台按心情补歌。</p>
        </div>
      )}

      {hideHeader && playlists.length === 0 && (
        <div className="playlist-library__hint playlist-library__hint--compact">
          <p>绑定网易云可同步私人歌单；未绑定也能先开播。</p>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="playlist-sync-button"
          >
            {syncing ? '同步中' : '立即同步'}
          </button>
        </div>
      )}

      {playlists.length > 0 && (
        <div className="playlist-list-section">
          <div className="playlist-section-title">
            <span>已同步歌单</span>
            <em>{activeTag === '全部' ? `${filtered.length} 个歌单参与 AI 召回` : `${activeTag} · ${filtered.length} 个歌单`}</em>
          </div>
          <div className="playlist-filter-row">
            {GENRE_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag)}
                className={activeTag === tag ? 'active' : ''}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {playlists.length === 0 && !syncing ? (
        <div className="playlist-empty-state">
          <div className="playlist-material-zone">
            <div className="playlist-section-title">
              <span>先补候选歌曲</span>
              <em>无需绑定网易云也能让 AI 有素材可选</em>
            </div>
            <AIMaterialStation onExpanded={loadPlaylists} />
          </div>
          <PublicMusicImport onImported={loadPlaylists} />
          <button
            onClick={handleSync}
            className="playlist-primary-button"
          >
            绑定后同步歌单
          </button>
        </div>
      ) : (
        <div className="playlist-list">
          {filtered.length === 0 && activeTag !== '全部' ? (
            <p className="playlist-empty-copy">
              这个分类下暂时没有歌单
            </p>
          ) : (
            filtered.map((pl) => (
              <div
                key={pl.id}
                className="playlist-row"
              >
                {pl.cover_url ? (
                  <img src={pl.cover_url} alt="" className="playlist-row__cover" />
                ) : (
                  <div className="playlist-row__cover playlist-row__cover--empty">
                    <svg fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                    </svg>
                  </div>
                )}
                <div className="playlist-row__body">
                  <p>{pl.name}</p>
                  <span>{pl.song_count} 首歌</span>
                </div>
                {pl.is_liked && <span className="playlist-liked-mark">喜欢</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

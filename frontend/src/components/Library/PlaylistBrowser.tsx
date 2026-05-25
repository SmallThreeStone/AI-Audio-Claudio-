import { useEffect, useState } from 'react'
import { useStore } from '../../store'
import { getPlaylists, syncPlaylists } from '../../api/playlists'

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

export default function PlaylistBrowser() {
  const { playlists, setPlaylists } = useStore()
  const [syncing, setSyncing] = useState(false)
  const [activeTag, setActiveTag] = useState('全部')

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
      if (import.meta.env.DEV) console.error('Sync failed:', e)
    }
    setSyncing(false)
  }

  const filtered = playlists.filter((pl) => matchGenre(pl, activeTag))

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

      {/* Genre filter chips */}
      {playlists.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {GENRE_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                activeTag === tag
                  ? 'border-[var(--color-radio-accent)] bg-[var(--color-radio-accent)]/10 text-[var(--color-radio-accent)]'
                  : 'border-[var(--color-radio-border)] text-[var(--color-radio-muted)] hover:border-[var(--color-radio-muted)]'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

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
          {filtered.length === 0 && activeTag !== '全部' ? (
            <p className="text-xs text-[var(--color-radio-muted)] text-center py-4">
              该分类下暂无歌单
            </p>
          ) : (
            filtered.map((pl) => (
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
            ))
          )}
        </div>
      )}
    </div>
  )
}

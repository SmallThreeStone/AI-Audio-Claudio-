import { useState } from 'react'
import { importPublicPlaylist, searchNeteaseSongs } from '../../api/songs'
import type { Song } from '../../types'

export default function PublicMusicImport({ onImported }: { onImported?: () => void }) {
  const [playlistUrl, setPlaylistUrl] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [results, setResults] = useState<Song[]>([])

  const handleImport = async () => {
    const value = playlistUrl.trim()
    if (!value || loading) return
    setLoading(true)
    setMessage('')
    try {
      const result = await importPublicPlaylist(value)
      if (result.error) setMessage(result.error)
      else {
        setMessage(`已导入「${result.name || '公开歌单'}」${result.imported || 0} 首新歌`)
        setPlaylistUrl('')
        onImported?.()
      }
    } catch {
      setMessage('导入失败，请确认链接有效')
    }
    setLoading(false)
  }

  const handleSearch = async () => {
    const value = query.trim()
    if (!value || loading) return
    setLoading(true)
    setMessage('')
    try {
      const data = await searchNeteaseSongs(value)
      setResults(data.songs || [])
      setMessage(data.songs?.length ? `找到 ${data.songs.length} 首歌，已加入你的 AI 搜索素材` : '没有搜到匹配歌曲')
    } catch {
      setMessage('搜索失败，请稍后再试')
    }
    setLoading(false)
  }

  return (
    <div className="public-import-card">
      <div className="public-import-card__head">
        <span>公开素材导入</span>
        <strong>把公开歌单或搜索结果收进 AI 候选库；真正播放由开播台统一编排</strong>
      </div>

      <div className="public-import-row">
        <input
          value={playlistUrl}
          onChange={(e) => setPlaylistUrl(e.target.value)}
          placeholder="粘贴网易云公开歌单链接或 ID，导入为候选库"
        />
        <button onClick={handleImport} disabled={loading || !playlistUrl.trim()}>
          导入
        </button>
      </div>

      <div className="public-import-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
          placeholder="搜索网易云歌曲或艺人，只加入候选库"
        />
        <button onClick={handleSearch} disabled={loading || !query.trim()}>
          搜索
        </button>
      </div>

      {message && <p className="public-import-message">{message}</p>}

      {results.length > 0 && (
        <div className="public-search-results">
          {results.slice(0, 5).map((song) => (
            <div key={song.id}>
              {song.cover_url ? <img src={song.cover_url} alt="" /> : <span />}
              <p>{song.name}<em>{song.artist || '未知艺人'}</em></p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

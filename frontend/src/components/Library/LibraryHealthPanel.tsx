import type { Playlist, MusicProfile } from '../../types'

function pct(value: number, total: number) {
  if (!total) return 0
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)))
}

export default function LibraryHealthPanel({
  playlists,
  profile,
  compact,
}: {
  playlists: Playlist[]
  profile?: MusicProfile | null
  compact?: boolean
}) {
  const totalSongs = profile?.total_songs || playlists.reduce((sum, pl) => sum + (pl.song_count || 0), 0)
  const playableSongs = profile?.playable_songs ?? totalSongs
  const taggedSongs = profile?.tagged_songs ?? 0
  const artistCount = profile?.artist_count || profile?.top_artists?.length || 0
  const syncTimes = playlists
    .map((pl) => pl.last_synced)
    .filter(Boolean)
    .sort()
  const lastSync = syncTimes.length ? syncTimes[syncTimes.length - 1] : undefined
  const playablePct = pct(playableSongs, totalSongs)
  const taggedPct = pct(taggedSongs, totalSongs)
  const health = Math.round((playablePct * 0.55) + (Math.min(100, artistCount * 5) * 0.2) + (taggedPct * 0.25))
  const advice = totalSongs
    ? taggedPct < 20
      ? '已启用全量歌单召回；补充情绪标签可继续提升精度'
      : '全量歌单和情绪标签都会参与 AI 调度'
    : '同步歌单后才能建立 AI 素材库'

  return (
    <div className={`library-health ${compact ? 'library-health--compact' : ''}`}>
      <div className="library-health__head">
        <div>
          <span>AI 曲库健康度</span>
          <strong>{totalSongs ? `${health}%` : '待同步'}</strong>
        </div>
        <em>{lastSync ? `最近同步 ${new Date(lastSync).toLocaleDateString('zh-CN')}` : '尚未建立曲库'}</em>
      </div>

      <div className="library-health__meter">
        <span style={{ width: `${totalSongs ? health : 6}%` }} />
      </div>

      <div className="library-health__stats">
        <div>
          <strong>{playableSongs}</strong>
          <span>可调度歌曲</span>
        </div>
        <div>
          <strong>{artistCount || '-'}</strong>
          <span>艺人覆盖</span>
        </div>
        <div>
          <strong>{taggedPct}%</strong>
          <span>情绪标签</span>
        </div>
      </div>
      <p className="library-health__advice">{advice}</p>
    </div>
  )
}

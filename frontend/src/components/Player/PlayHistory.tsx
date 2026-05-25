import { useStore } from '../../store'

export default function PlayHistory() {
  const { playHistory, session } = useStore()

  if (!session || playHistory.length === 0) return null

  const songs = playHistory.filter((item) => item.item_type === 'song')

  return (
    <div className="mt-3 space-y-1 max-h-60 overflow-y-auto">
      <h4 className="text-[10px] font-bold text-[var(--color-radio-muted)] uppercase tracking-wider px-1">
        播放历史 ({songs.length})
      </h4>
      {songs.slice(0, 20).map((item) => (
        <div
          key={`hist-${item.id}`}
          className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-white/5 transition-colors text-xs"
        >
          {item.cover_url ? (
            <img
              src={item.cover_url}
              alt=""
              className="w-6 h-6 rounded object-cover flex-shrink-0"
              loading="lazy"
            />
          ) : (
            <div className="w-6 h-6 rounded bg-[var(--color-radio-border)] flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[var(--color-radio-text)] truncate">{item.song_name || '未知歌曲'}</div>
            <div className="text-[10px] text-[var(--color-radio-muted)] truncate">{item.artist || '未知艺人'}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

import { useState, useEffect } from 'react'
import type { MusicProfile } from '../../types'
import { getMusicProfile } from '../../api/radio'

export default function MusicProfilePanel() {
  const [profile, setProfile] = useState<MusicProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMusicProfile()
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="py-3">
        <h3 className="text-xs font-semibold text-[var(--color-radio-muted)] uppercase tracking-wider mb-2">
          音乐画像
        </h3>
        <div className="h-32 animate-pulse bg-[var(--color-radio-card)]/50 rounded-lg" />
      </div>
    )
  }

  if (!profile || profile.total_songs === 0) return null

  const maxArtist = Math.max(...profile.top_artists.map((a) => a.count), 1)
  const maxMood = Math.max(...profile.moods.map((m) => m.count), 1)

  return (
    <div className="py-3 space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-[var(--color-radio-muted)] uppercase tracking-wider mb-1">
          音乐画像
        </h3>
        <p className="text-xs text-[var(--color-radio-muted)]">
          {profile.total_songs} 首歌曲 · {profile.top_artists.length > 0 ? profile.top_artists[0].name : ''} 等 {profile.top_artists.length} 位艺人
        </p>
      </div>

      {/* Top Artists */}
      {profile.top_artists.length > 0 && (
        <div>
          <p className="text-xs text-[var(--color-radio-muted)] mb-1.5">最常听的艺人</p>
          <div className="space-y-1">
            {profile.top_artists.slice(0, 6).map((a) => (
              <div key={a.name} className="flex items-center gap-2">
                <span className="text-xs w-16 truncate">{a.name}</span>
                <div className="flex-1 h-1.5 rounded-full bg-[var(--color-radio-border)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--color-radio-accent)]/60"
                    style={{ width: `${(a.count / maxArtist) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-[var(--color-radio-muted)] w-8 text-right">{a.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mood Tags */}
      {profile.moods.length > 0 && (
        <div>
          <p className="text-xs text-[var(--color-radio-muted)] mb-1.5">音乐情绪</p>
          <div className="flex flex-wrap gap-1">
            {profile.moods.map((m) => (
              <span
                key={m.name}
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: `rgba(233, 69, 96, ${0.1 + (m.count / maxMood) * 0.4})`,
                  color: 'var(--color-radio-text)',
                }}
              >
                {m.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Time Patterns */}
      {profile.time_patterns && (
        <div>
          <p className="text-xs text-[var(--color-radio-muted)] mb-1.5">听歌时段</p>
          <div className="grid grid-cols-4 gap-1">
            {[
              { key: 'morning', label: '早晨' },
              { key: 'afternoon', label: '下午' },
              { key: 'evening', label: '傍晚' },
              { key: 'night', label: '深夜' },
            ].map((t) => {
              const total = Math.max(
                profile.time_patterns.morning +
                profile.time_patterns.afternoon +
                profile.time_patterns.evening +
                profile.time_patterns.night,
                1
              )
              const pct = (profile.time_patterns[t.key as keyof typeof profile.time_patterns] / total) * 100
              return (
                <div key={t.key} className="text-center">
                  <div className="h-8 rounded bg-[var(--color-radio-card)]/50 relative overflow-hidden">
                    <div
                      className="absolute bottom-0 w-full rounded bg-[var(--color-radio-accent)]/40"
                      style={{ height: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--color-radio-muted)]">{t.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* High Completion Artists */}
      {profile.completed_artists && profile.completed_artists.length > 0 && (
        <div>
          <p className="text-xs text-[var(--color-radio-muted)] mb-1.5">最爱听完的艺人</p>
          <div className="space-y-1">
            {profile.completed_artists.slice(0, 4).map((a) => (
              <div key={a.name} className="flex items-center gap-2">
                <span className="text-xs w-14 truncate">{a.name}</span>
                <div className="flex-1 h-1 rounded-full bg-[var(--color-radio-border)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500/50"
                    style={{ width: `${a.completion_rate}%` }}
                  />
                </div>
                <span className="text-xs text-green-400 w-8 text-right">{a.completion_rate}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recently Played */}
      {profile.recently_played && profile.recently_played.length > 0 && (
        <div>
          <p className="text-xs text-[var(--color-radio-muted)] mb-1.5">最近听过</p>
          <div className="space-y-1">
            {profile.recently_played.slice(0, 5).map((s) => (
              <div key={s.song_id} className="flex items-center gap-2">
                <div className="w-5 h-5 rounded overflow-hidden flex-shrink-0">
                  {s.cover_url ? (
                    <img src={s.cover_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[var(--color-radio-border)]" />
                  )}
                </div>
                <span className="text-xs truncate flex-1">{s.name}</span>
                <span className="text-[10px] text-[var(--color-radio-muted)]">{s.artist}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import type { MusicProfile } from '../../types'
import { getMusicProfile } from '../../api/radio'

const MOOD_COLORS: Record<string, { bg: string; text: string }> = {
  欢快: { bg: 'rgba(234, 179, 8, 0.2)', text: '#eab308' },
  轻松: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e' },
  伤感: { bg: 'rgba(59, 130, 246, 0.2)', text: '#3b82f6' },
  激昂: { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444' },
  安静: { bg: 'rgba(139, 92, 246, 0.2)', text: '#8b5cf6' },
  浪漫: { bg: 'rgba(236, 72, 153, 0.2)', text: '#ec4899' },
  忧郁: { bg: 'rgba(107, 114, 128, 0.2)', text: '#9ca3af' },
  温暖: { bg: 'rgba(249, 115, 22, 0.2)', text: '#f97316' },
}

function moodColor(name: string) {
  for (const [key, val] of Object.entries(MOOD_COLORS)) {
    if (name.includes(key)) return val
  }
  return { bg: 'rgba(233, 69, 96, 0.15)', text: 'var(--color-radio-text)' }
}

const BPM_LABELS: Record<string, string> = {
  slow: '慢速', 'mid-slow': '中慢', mid: '中速', 'mid-fast': '中快', fast: '快速',
}

export default function MusicProfilePanel() {
  const [profile, setProfile] = useState<MusicProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchProfile = () => {
    setLoading(true)
    setError(false)
    getMusicProfile()
      .then(setProfile)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchProfile() }, [])

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

  if (error) {
    return (
      <div className="py-3">
        <h3 className="text-xs font-semibold text-[var(--color-radio-muted)] uppercase tracking-wider mb-2">
          音乐画像
        </h3>
        <div className="text-center py-4">
          <p className="text-xs text-[var(--color-radio-muted)] mb-2">加载失败</p>
          <button onClick={fetchProfile} className="text-xs text-[var(--color-radio-accent)] hover:underline">
            重试
          </button>
        </div>
      </div>
    )
  }

  if (!profile || (profile.total_songs === 0 && profile.total_listens === 0)) {
    return (
      <div className="py-3">
        <h3 className="text-xs font-semibold text-[var(--color-radio-muted)] uppercase tracking-wider mb-2">
          音乐画像
        </h3>
        <p className="text-xs text-[var(--color-radio-muted)] text-center py-4">
          暂无听歌数据，开始收听电台后将自动生成画像
        </p>
      </div>
    )
  }

  const maxArtist = Math.max(...profile.top_artists.map((a) => a.count), 1)
  const maxMood = Math.max(...profile.moods.map((m) => m.count), 1)
  const maxGenre = Math.max(...profile.genres.map((g) => g.count), 1)
  const timeTotal = Math.max(
    profile.time_patterns.morning + profile.time_patterns.afternoon +
    profile.time_patterns.evening + profile.time_patterns.night, 1
  )

  return (
    <div className="py-3 space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-semibold text-[var(--color-radio-muted)] uppercase tracking-wider">
            音乐画像
          </h3>
          <button onClick={fetchProfile} className="text-[10px] text-[var(--color-radio-accent)]/60 hover:text-[var(--color-radio-accent)]">
            刷新
          </button>
        </div>
        <p className="text-xs text-[var(--color-radio-muted)]">
          {profile.total_songs > 0 && <>{profile.total_songs} 首歌曲</>}
          {profile.total_likes > 0 && <> · {profile.total_likes} 次喜欢</>}
          {profile.total_listens > 0 && <> · {profile.total_listens} 次收听</>}
        </p>
        {profile.top_artists.length > 0 && (
          <p className="text-xs text-[var(--color-radio-muted)]">
            {profile.top_artists[0].name} 等 {profile.top_artists.length} 位艺人
          </p>
        )}
      </div>

      {/* Top Artists */}
      {profile.top_artists.length > 0 && (
        <Section title="最常听的艺人">
          {profile.top_artists.slice(0, 6).map((a) => (
            <BarRow key={a.name} name={a.name} value={a.count} max={maxArtist} color="bg-[var(--color-radio-accent)]/60" />
          ))}
        </Section>
      )}

      {/* Genres */}
      {profile.genres.length > 0 && (
        <Section title="曲风分布">
          {profile.genres.slice(0, 8).map((g) => (
            <BarRow key={g.name} name={g.name} value={g.count} max={maxGenre} color="bg-purple-400/50" />
          ))}
        </Section>
      )}

      {/* Mood Tags */}
      {profile.moods.length > 0 && (
        <Section title="音乐情绪">
          <div className="flex flex-wrap gap-1">
            {profile.moods.map((m) => {
              const c = moodColor(m.name)
              return (
                <span
                  key={m.name}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: c.bg, color: c.text }}
                >
                  {m.name} {m.count}
                </span>
              )
            })}
          </div>
        </Section>
      )}

      {/* BPM Buckets */}
      {profile.bpm_buckets && profile.bpm_buckets.length > 0 && (
        <Section title="歌曲速度">
          <div className="flex gap-1">
            {profile.bpm_buckets.map((b) => {
              const bpmMax = Math.max(...profile.bpm_buckets.map((x) => x.count), 1)
              const pct = Math.max((b.count / bpmMax) * 100, 3)
              return (
                <div key={b.name} className="flex-1 text-center">
                  <div className="h-8 rounded bg-[var(--color-radio-card)]/50 relative overflow-hidden">
                    <div
                      className="absolute bottom-0 w-full rounded bg-cyan-400/40"
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--color-radio-muted)]">
                    {BPM_LABELS[b.name] || b.name}
                  </span>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* Time Patterns */}
      {profile.time_patterns && timeTotal > 0 && (
        <Section title="听歌时段">
          <div className="grid grid-cols-4 gap-1">
            {[
              { key: 'morning', label: '早晨' },
              { key: 'afternoon', label: '下午' },
              { key: 'evening', label: '傍晚' },
              { key: 'night', label: '深夜' },
            ].map((t) => {
              const pct = (profile.time_patterns[t.key as keyof typeof profile.time_patterns] / timeTotal) * 100
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
        </Section>
      )}

      {/* Completed Artists */}
      {profile.completed_artists && profile.completed_artists.length > 0 && (
        <Section title="最爱听完的艺人">
          {profile.completed_artists.slice(0, 4).map((a) => (
            <BarRow key={a.name} name={a.name} value={a.completion_rate} max={100} color="bg-green-500/50" suffix="%" narrow />
          ))}
        </Section>
      )}

      {/* Skipped Artists */}
      {profile.skipped_artists && profile.skipped_artists.length > 0 && (
        <Section title="常跳过的艺人">
          {profile.skipped_artists.slice(0, 4).map((a) => (
            <BarRow key={a.name} name={a.name} value={a.skip_rate} max={100} color="bg-red-400/50" suffix="%" narrow />
          ))}
        </Section>
      )}

      {/* Recently Played */}
      {profile.recently_played && profile.recently_played.length > 0 && (
        <Section title="最近听过">
          {profile.recently_played.slice(0, 5).map((s) => (
            <div key={s.song_id} className="flex items-center gap-2">
              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded overflow-hidden flex-shrink-0">
                {s.cover_url ? (
                  <img src={s.cover_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-[var(--color-radio-border)]" />
                )}
              </div>
              <span className="text-xs truncate flex-1">{s.name}</span>
              <span className="text-[10px] text-[var(--color-radio-muted)] truncate max-w-[60px] sm:max-w-[80px]">{s.artist}</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  )
}

/* ---- mini helpers ---- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-[var(--color-radio-muted)] mb-1.5">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function BarRow({
  name, value, max, color, suffix = '', narrow,
}: {
  name: string; value: number; max: number; color: string; suffix?: string; narrow?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs truncate ${narrow ? 'w-12 sm:w-14' : 'w-14 sm:w-20'}`}>{name}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--color-radio-border)] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="text-xs text-[var(--color-radio-muted)] w-9 text-right tabular-nums">
        {value}{suffix}
      </span>
    </div>
  )
}

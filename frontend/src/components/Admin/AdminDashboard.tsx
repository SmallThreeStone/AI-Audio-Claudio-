import { useState, useEffect, lazy, Suspense } from 'react'
import { useStore } from '../../store'
import {
  getAdminOverview, getAdminUsers, getAdminSessions, getAdminListening,
  getAdminTrends, getAdminHourly, getAdminAnomalies,
  setUserRole, forceStopSession, getUserProfile,
  type AdminOverview, type AdminUser, type AdminSession, type AdminListenEvent,
  type AdminTrend, type AdminHourly, type AdminAnomaly, type UserProfile,
} from '../../api/admin'
import { getAnalyticsEvents } from '../../api/analytics'

const ChartsSection = lazy(() => import('./AdminCharts'))

type Tab = 'overview' | 'users' | 'sessions' | 'listening' | 'anomalies' | 'analytics'

const statusBadge: Record<string, string> = {
  logged_in: 'bg-green-500/20 text-green-400',
  logged_out: 'bg-gray-500/20 text-gray-400',
  qr_pending: 'bg-yellow-500/20 text-yellow-400',
}

const sessionStatusBadge: Record<string, string> = {
  generating: 'bg-blue-500/20 text-blue-400',
  refilling: 'bg-blue-500/20 text-blue-400',
  ready: 'bg-green-500/20 text-green-400',
  playing: 'bg-green-500/20 text-green-400',
  completed: 'bg-gray-500/20 text-gray-400',
  error: 'bg-red-500/20 text-red-400',
  pending: 'bg-yellow-500/20 text-yellow-400',
}

const eventBadge: Record<string, string> = {
  started: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-green-500/20 text-green-400',
  skipped: 'bg-red-500/20 text-red-400',
}

const beijingTimeFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const beijingDateFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

function parseAdminTime(value?: string | null) {
  if (!value) return null
  const normalized = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatAdminTime(value?: string | null) {
  const date = parseAdminTime(value)
  return date ? beijingTimeFormat.format(date) : '-'
}

function formatAdminDate(value?: string | null) {
  const date = parseAdminTime(value)
  return date ? beijingDateFormat.format(date) : '-'
}

export default function AdminDashboard() {
  const { setShowAdmin, user } = useStore()
  const isOwner = user?.role === 'owner'
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [sessions, setSessions] = useState<AdminSession[]>([])
  const [events, setEvents] = useState<AdminListenEvent[]>([])
  const [trends, setTrends] = useState<AdminTrend[]>([])
  const [hourly, setHourly] = useState<AdminHourly[]>([])
  const [anomalies, setAnomalies] = useState<AdminAnomaly[]>([])
  const [analyticsData, setAnalyticsData] = useState<{ event_counts: { event_name: string; count: number }[]; daily_events: { date: string; count: number }[]; total_events: number } | null>(null)
  const [viewProfile, setViewProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const refreshData = () => {
    Promise.all([
      getAdminUsers(),
      getAdminSessions(),
      getAdminListening(),
      getAdminAnomalies(),
    ]).then(([us, ss, ev, an]) => {
      setUsers(us)
      setSessions(ss)
      setEvents(ev)
      setAnomalies(an.alerts)
      setLoadError('')
    }).catch((e) => {
      console.warn('Admin overview load failed:', e)
      setLoadError('后台数据刷新失败，请检查管理权限或稍后重试')
    })
  }

  useEffect(() => {
    Promise.all([
      getAdminOverview(),
      getAdminUsers(),
      getAdminSessions(),
      getAdminListening(),
      getAdminTrends(),
      getAdminHourly(),
      getAdminAnomalies(),
      getAnalyticsEvents().catch(() => null),
    ]).then(([ov, us, ss, ev, tr, hr, an, anl]) => {
      setOverview(ov)
      setUsers(us)
      setSessions(ss)
      setEvents(ev)
      setTrends(tr)
      setHourly(hr)
      setAnomalies(an.alerts)
      if (anl) setAnalyticsData(anl)
      setLoadError('')
    }).catch((e) => {
      console.warn('Admin hourly/trends load failed:', e)
      setLoadError('后台数据加载失败，请重新验证管理密码后再试')
    }).finally(() => setLoading(false))
  }, [])

  const handleSetRole = async (userId: number, role: string) => {
    await setUserRole(userId, role)
    refreshData()
  }

  const handleForceStop = async (sessionId: number) => {
    if (!confirm('确定强制停止该会话吗？')) return
    await forceStopSession(sessionId)
    refreshData()
  }

  const handleViewProfile = async (userId: number) => {
    try {
      const profile = await getUserProfile(userId)
      setViewProfile(profile)
    } catch (e) {
      console.warn('User profile load failed:', e)
    }
  }

  if (loading) {
    return (
      <div className="radio-bg min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--color-radio-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'overview', label: '运营总览' },
    { key: 'users', label: '用户管理' },
    { key: 'sessions', label: '会话记录' },
    { key: 'listening', label: '播放记录' },
    { key: 'anomalies', label: '异常告警', badge: anomalies.length },
    { key: 'analytics', label: '事件统计' },
  ]

  const activeSessions = sessions.filter((s) => ['generating', 'refilling', 'ready', 'playing'].includes(s.status)).length
  const completedEvents = events.filter((e) => e.event === 'completed').length
  const skippedEvents = events.filter((e) => e.event === 'skipped').length
  const completionBase = completedEvents + skippedEvents
  const completionRate = completionBase > 0 ? Math.round((completedEvents / completionBase) * 100) : 0
  const topUser = [...users].sort((a, b) => b.listen_count - a.listen_count)[0]

  return (
    <div className="radio-bg min-h-screen">
      <header className="admin-shell__topbar">
        <div className="admin-shell__topbar-inner">
          <div className="admin-brand">
            <div className="admin-brand__mark">C</div>
            <div>
              <span>Claudio FM</span>
              <strong>管理面板</strong>
            </div>
          </div>
          <button onClick={() => setShowAdmin(false)} className="admin-return-button">
            返回电台
          </button>
        </div>
      </header>

      <main className="admin-shell">
        <section className="admin-hero">
          <div>
            <span>运营驾驶舱</span>
            <h1>电台数据总览</h1>
            <p>看用户、会话、播放和异常信号，判断 AI 电台是否真的在稳定服务。</p>
          </div>
          <button onClick={refreshData} className="admin-refresh-button">
            刷新数据
          </button>
        </section>

        {loadError && (
          <div className="admin-alert">
            {loadError}
          </div>
        )}

        {overview && (
          <section className="admin-metric-grid">
            <MetricCard label="总用户" value={overview.total_users} sub={`${overview.active_users} 位在线`} tone="accent" />
            <MetricCard label="总会话" value={overview.total_sessions} sub={`今日新增 ${overview.sessions_today}`} tone="gold" />
            <MetricCard label="歌曲库" value={overview.total_songs} sub="已导入歌曲总量" />
            <MetricCard label="播放事件" value={overview.total_listens} sub={`完播率 ${completionRate || 0}%`} />
            <MetricCard label="活跃会话" value={activeSessions} sub="生成/待播/播放中" tone={activeSessions > 0 ? 'accent' : 'muted'} />
            <MetricCard label="异常告警" value={anomalies.length} sub={anomalies.length ? '需要关注' : '暂无风险'} tone={anomalies.length ? 'gold' : 'muted'} />
          </section>
        )}

        <section className="admin-insight-grid">
          <InsightCard title="当前运营判断" value={activeSessions > 0 ? '有用户正在收听或生成' : '当前处于安静时段'} detail={topUser ? `最活跃用户：${topUser.nickname || `#${topUser.id}`} · ${topUser.listen_count} 次播放` : '暂无用户播放记录'} />
          <InsightCard title="播放质量" value={completionBase ? `${completionRate}% 完播倾向` : '样本不足'} detail={completionBase ? `${completedEvents} 次完播 · ${skippedEvents} 次跳过` : '有播放记录后会自动计算完播/跳过倾向'} />
          <InsightCard title="数据可信度" value={loadError ? '接口异常' : '接口正常'} detail="统计来自会话、队列、播放事件和前端埋点，后台密码验证后可读取。" />
        </section>

        <Suspense fallback={<div className="admin-chart-loading">加载图表中...</div>}>
          <div className="admin-chart-grid">
            <ChartsSection trends={trends} hourly={hourly} users={users} />
          </div>
        </Suspense>

        <div className="admin-tabs">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={activeTab === t.key ? 'active' : ''}
            >
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === t.key ? 'bg-white/20 text-white' : 'bg-[var(--color-radio-accent)]/20 text-[var(--color-radio-accent)]'
                }`}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        <div className="admin-table-panel">
          {activeTab === 'overview' && (
            <OverviewPanel users={users} sessions={sessions} events={events} anomalies={anomalies} analyticsData={analyticsData} />
          )}
          {activeTab === 'users' && (
            <UsersTable users={users} isOwner={isOwner} onSetRole={handleSetRole} onViewProfile={handleViewProfile} />
          )}
          {activeTab === 'sessions' && <SessionsTable sessions={sessions} isOwner={isOwner} onForceStop={handleForceStop} />}
          {activeTab === 'listening' && <ListeningTable events={events} />}
          {activeTab === 'anomalies' && <AnomaliesPanel alerts={anomalies} />}
          {activeTab === 'analytics' && <AnalyticsPanel data={analyticsData} />}
        </div>
      </main>

      {/* Profile Modal */}
      {viewProfile && (
        <ProfileModal profile={viewProfile} onClose={() => setViewProfile(null)} />
      )}
    </div>
  )
}

function ProfileModal({ profile, onClose }: { profile: UserProfile; onClose: () => void }) {
  const u = profile.user
  const tp = profile.time_patterns
  const total = tp.morning + tp.afternoon + tp.evening + tp.night || 1
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--color-radio-surface)] border border-[var(--color-radio-border)] rounded-xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--color-radio-text)]">
            {u.nickname || `#${u.id}`} 的画像
          </h3>
          <button onClick={onClose} className="text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)]">✕</button>
        </div>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[var(--color-radio-card)] rounded-lg p-3">
              <div className="text-[var(--color-radio-muted)] text-xs">总播放</div>
              <div className="text-xl font-bold text-[var(--color-radio-text)]">{profile.total_listens}</div>
            </div>
            <div className="bg-[var(--color-radio-card)] rounded-lg p-3">
              <div className="text-[var(--color-radio-muted)] text-xs">总会话</div>
              <div className="text-xl font-bold text-[var(--color-radio-text)]">{profile.session_count}</div>
            </div>
          </div>
          {profile.genres.length > 0 && (
            <div>
              <div className="text-[var(--color-radio-muted)] text-xs mb-2">偏好风格</div>
              <div className="flex flex-wrap gap-1">
                {profile.genres.slice(0, 6).map(g => (
                  <span key={g.name} className="text-xs bg-[var(--color-radio-card)] px-2 py-1 rounded-full text-[var(--color-radio-text)]">
                    {g.name} ({g.count})
                  </span>
                ))}
              </div>
            </div>
          )}
          {profile.artists.length > 0 && (
            <div>
              <div className="text-[var(--color-radio-muted)] text-xs mb-2">最爱艺人</div>
              <div className="flex flex-wrap gap-1">
                {profile.artists.slice(0, 6).map(a => (
                  <span key={a.name} className="text-xs bg-[var(--color-radio-card)] px-2 py-1 rounded-full text-[var(--color-radio-text)]">
                    {a.name} ({a.count})
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-[var(--color-radio-muted)] text-xs mb-2">时段偏好</div>
            <div className="flex h-6 rounded-full overflow-hidden bg-[var(--color-radio-card)]">
              <div style={{ width: `${(tp.morning / total) * 100}%` }} className="bg-yellow-500/60" title={`早晨 ${tp.morning}`} />
              <div style={{ width: `${(tp.afternoon / total) * 100}%` }} className="bg-orange-500/60" title={`下午 ${tp.afternoon}`} />
              <div style={{ width: `${(tp.evening / total) * 100}%` }} className="bg-purple-500/60" title={`傍晚 ${tp.evening}`} />
              <div style={{ width: `${(tp.night / total) * 100}%` }} className="bg-blue-500/60" title={`深夜 ${tp.night}`} />
            </div>
            <div className="flex justify-between text-[10px] text-[var(--color-radio-muted)] mt-1">
              <span>早{tp.morning}</span><span>下{tp.afternoon}</span><span>晚{tp.evening}</span><span>夜{tp.night}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, sub, tone = 'muted' }: { label: string; value: number; sub?: string; tone?: 'accent' | 'gold' | 'muted' }) {
  return (
    <div className={`admin-metric-card admin-metric-card--${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      {sub && <p>{sub}</p>}
    </div>
  )
}

function InsightCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="admin-insight-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  )
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="admin-empty-state">
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  )
}

function OverviewPanel({ users, sessions, events, anomalies, analyticsData }: {
  users: AdminUser[]
  sessions: AdminSession[]
  events: AdminListenEvent[]
  anomalies: AdminAnomaly[]
  analyticsData: AnalyticsEventsData | null
}) {
  const latestSession = sessions[0]
  const latestEvent = events[0]
  const topEvents = analyticsData?.event_counts.slice(0, 5) || []
  return (
    <div className="admin-overview-panel">
      <div className="admin-overview-card">
        <span>最近会话</span>
        {latestSession ? (
          <>
            <strong>{latestSession.user_request || latestSession.session_theme || '未命名会话'}</strong>
            <p>{latestSession.user_nickname} · {latestSession.status} · {formatAdminTime(latestSession.created_at)}</p>
          </>
        ) : (
          <p>暂无会话记录</p>
        )}
      </div>
      <div className="admin-overview-card">
        <span>最近播放</span>
        {latestEvent ? (
          <>
            <strong>{latestEvent.song_name}</strong>
            <p>{latestEvent.user_nickname} · {latestEvent.event} · {formatAdminTime(latestEvent.listened_at)}</p>
          </>
        ) : (
          <p>暂无播放事件</p>
        )}
      </div>
      <div className="admin-overview-card">
        <span>异常摘要</span>
        <strong>{anomalies.length ? `${anomalies.length} 条告警` : '暂无异常'}</strong>
        <p>{anomalies[0]?.detail || '当前没有版权失败、高跳过率或短会话告警。'}</p>
      </div>
      <div className="admin-overview-card">
        <span>事件热度</span>
        {topEvents.length ? (
          <div className="admin-event-list">
            {topEvents.map((e) => (
              <p key={e.event_name}>{e.event_name}<b>{e.count}</b></p>
            ))}
          </div>
        ) : (
          <p>暂无前端事件记录</p>
        )}
      </div>
      <div className="admin-overview-card admin-overview-card--wide">
        <span>用户概况</span>
        <strong>{users.length ? `${users.length} 位用户` : '暂无用户'}</strong>
        <p>{users.length ? `最近活跃：${users.slice(0, 4).map((u) => u.nickname || `#${u.id}`).join('、')}` : '用户登录后会自动出现在这里。'}</p>
      </div>
    </div>
  )
}

function UsersTable({ users, isOwner, onSetRole, onViewProfile }: { users: AdminUser[]; isOwner: boolean; onSetRole: (id: number, role: string) => void; onViewProfile: (id: number) => void }) {
  if (users.length === 0) {
    return <EmptyState title="暂无用户数据" detail="用户扫码或密码登录后，这里会展示身份、角色、会话数和播放数。" />
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-radio-border)]">
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">用户</th>
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">角色</th>
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">状态</th>
            <th className="text-right px-4 py-3 text-[var(--color-radio-muted)] font-medium">会话</th>
            <th className="text-right px-4 py-3 text-[var(--color-radio-muted)] font-medium">播放</th>
            <th className="text-right px-4 py-3 text-[var(--color-radio-muted)] font-medium">注册时间</th>
            {isOwner && <th className="text-right px-4 py-3 text-[var(--color-radio-muted)] font-medium">操作</th>}
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className="border-b border-[var(--color-radio-border)]/50 hover:bg-white/5">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {u.avatar_url && <img src={u.avatar_url} alt="" className="w-6 h-6 rounded-full" />}
                  <span className="text-[var(--color-radio-text)]">{u.nickname || `#${u.id}`}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                {isOwner && u.role !== 'owner' ? (
                  <select
                    value={u.role}
                    onChange={(e) => onSetRole(u.id, e.target.value)}
                    className={`text-xs px-2 py-0.5 rounded-full bg-transparent cursor-pointer ${
                      u.role === 'admin' ? 'bg-[var(--color-radio-gold)]/20 text-[var(--color-radio-gold)]' : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    <option value="user">用户</option>
                    <option value="admin">管理员</option>
                  </select>
                ) : (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    u.role === 'owner' ? 'bg-[var(--color-radio-accent)]/20 text-[var(--color-radio-accent)]' :
                    u.role === 'admin' ? 'bg-[var(--color-radio-gold)]/20 text-[var(--color-radio-gold)]' : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {u.role === 'owner' ? '拥有者' : u.role === 'admin' ? '管理员' : '用户'}
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge[u.login_status] || ''}`}>
                  {u.login_status === 'logged_in' ? '在线' : u.login_status === 'qr_pending' ? '待登录' : '离线'}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-[var(--color-radio-text)]">{u.session_count}</td>
              <td className="px-4 py-3 text-right text-[var(--color-radio-text)]">{u.listen_count}</td>
              <td className="px-4 py-3 text-right text-[var(--color-radio-muted)] text-xs">
                {formatAdminDate(u.created_at)}
              </td>
              {isOwner && (
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onViewProfile(u.id)}
                    className="text-xs text-[var(--color-radio-accent)] hover:underline"
                  >
                    查看画像
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SessionsTable({ sessions, isOwner, onForceStop }: { sessions: AdminSession[]; isOwner: boolean; onForceStop: (id: number) => void }) {
  if (sessions.length === 0) {
    return <EmptyState title="暂无会话记录" detail="用户生成电台后，会话主题、状态和播放进度会出现在这里。" />
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-radio-border)]">
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">用户</th>
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">请求</th>
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">主题</th>
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">状态</th>
            <th className="text-right px-4 py-3 text-[var(--color-radio-muted)] font-medium">进度</th>
            <th className="text-right px-4 py-3 text-[var(--color-radio-muted)] font-medium">时间</th>
            {isOwner && <th className="text-right px-4 py-3 text-[var(--color-radio-muted)] font-medium">操作</th>}
          </tr>
        </thead>
        <tbody>
          {sessions.map(s => (
            <tr key={s.id} className="border-b border-[var(--color-radio-border)]/50 hover:bg-white/5">
              <td className="px-4 py-3 text-[var(--color-radio-text)]">{s.user_nickname}</td>
              <td className="px-4 py-3 text-[var(--color-radio-text)] max-w-[200px] truncate">{s.user_request}</td>
              <td className="px-4 py-3 text-[var(--color-radio-muted)] max-w-[160px] truncate">{s.session_theme || '-'}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${sessionStatusBadge[s.status] || ''}`}>
                  {s.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-[var(--color-radio-muted)]">
                {s.played_items}/{s.total_items}
              </td>
              <td className="px-4 py-3 text-right text-[var(--color-radio-muted)] text-xs">
                {formatAdminTime(s.created_at)}
              </td>
              {isOwner && (
                <td className="px-4 py-3 text-right">
                  {(s.status === 'playing' || s.status === 'ready' || s.status === 'generating' || s.status === 'refilling') && (
                    <button
                      onClick={() => onForceStop(s.id)}
                      className="text-xs text-[var(--color-radio-accent)] hover:underline"
                    >
                      强制停止
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ListeningTable({ events }: { events: AdminListenEvent[] }) {
  if (events.length === 0) {
    return <EmptyState title="暂无播放记录" detail="歌曲开始、完播和跳过事件会在播放过程中自动记录。" />
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-radio-border)]">
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">用户</th>
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">歌曲</th>
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">事件</th>
            <th className="text-right px-4 py-3 text-[var(--color-radio-muted)] font-medium">完播率</th>
            <th className="text-right px-4 py-3 text-[var(--color-radio-muted)] font-medium">时间</th>
          </tr>
        </thead>
        <tbody>
          {events.map(e => (
            <tr key={e.id} className="border-b border-[var(--color-radio-border)]/50 hover:bg-white/5">
              <td className="px-4 py-3 text-[var(--color-radio-text)]">{e.user_nickname}</td>
              <td className="px-4 py-3 text-[var(--color-radio-text)] max-w-[200px] truncate">{e.song_name}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${eventBadge[e.event] || ''}`}>
                  {e.event === 'started' ? '开始' : e.event === 'completed' ? '完播' : e.event === 'skipped' ? '跳过' : e.event}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-[var(--color-radio-text)]">
                {e.completion_rate != null ? `${Math.round(e.completion_rate * 100)}%` : '-'}
              </td>
              <td className="px-4 py-3 text-right text-[var(--color-radio-muted)] text-xs">
                {formatAdminTime(e.listened_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type AnalyticsEventsData = { event_counts: { event_name: string; count: number }[]; daily_events: { date: string; count: number }[]; total_events: number }

function AnalyticsPanel({ data }: { data: AnalyticsEventsData | null }) {
  if (!data) {
    return <EmptyState title="暂无事件统计" detail="前端埋点事件还没有返回，刷新或产生操作后会显示趋势。" />
  }
  if (data.total_events === 0) {
    return <EmptyState title="暂无事件统计" detail="打开页面、生成电台、播放反馈等行为会逐步形成事件数据。" />
  }
  const maxDaily = Math.max(...data.daily_events.map(d => d.count), 1)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-radio-text)]">最近 7 天事件统计</h3>
        <span className="text-xs text-[var(--color-radio-muted)]">共 {data.total_events} 事件</span>
      </div>

      {/* Daily bar chart */}
      <div className="flex items-end gap-1 h-20">
        {data.daily_events.map((d) => (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-[var(--color-radio-accent)]/60 hover:bg-[var(--color-radio-accent)] transition-colors min-h-[2px]"
              style={{ height: `${Math.max((d.count / maxDaily) * 100, 2)}%` }}
              title={`${d.date}: ${d.count}`}
            />
            <span className="text-[9px] text-[var(--color-radio-muted)]">{d.date}</span>
          </div>
        ))}
      </div>

      {/* Event type counts */}
      <div className="space-y-1.5">
        {data.event_counts.map((e) => (
          <div key={e.event_name} className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-radio-text)] w-32 truncate">{e.event_name}</span>
            <div className="flex-1 h-2 rounded-full bg-[var(--color-radio-border)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-radio-accent)]/70"
                style={{ width: `${Math.max((e.count / (data.event_counts[0]?.count || 1)) * 100, 3)}%` }}
              />
            </div>
            <span className="text-xs text-[var(--color-radio-muted)] w-8 text-right tabular-nums">{e.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AnomaliesPanel({ alerts }: { alerts: AdminAnomaly[] }) {
  if (alerts.length === 0) {
    return <EmptyState title="暂无异常告警" detail="版权失败率、高跳过率和短会话都在正常范围内。" />
  }
  return (
    <div className="divide-y divide-[var(--color-radio-border)]">
      {alerts.map((a, i) => (
        <div key={i} className="p-4 hover:bg-white/5 transition-colors">
          <div className="flex items-start gap-3">
            <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
              a.level === 'warning' ? 'bg-[var(--color-radio-accent)]' : 'bg-[var(--color-radio-gold)]'
            }`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  a.level === 'warning' ? 'bg-[var(--color-radio-accent)]/20 text-[var(--color-radio-accent)]' : 'bg-[var(--color-radio-gold)]/20 text-[var(--color-radio-gold)]'
                }`}>
                  {a.level === 'warning' ? '警告' : '提示'}
                </span>
                <span className="text-sm font-medium text-[var(--color-radio-text)]">{a.title}</span>
              </div>
              <p className="text-sm text-[var(--color-radio-muted)] ml-0">{a.detail}</p>
              <p className="text-xs text-[var(--color-radio-muted)]/60 mt-1">建议：{a.suggestion}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

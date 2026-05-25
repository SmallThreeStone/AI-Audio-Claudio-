import { useState, useEffect } from 'react'
import { useStore } from '../../store'
import {
  getAdminOverview, getAdminUsers, getAdminSessions, getAdminListening,
  getAdminTrends, getAdminHourly, getAdminAnomalies,
  setUserRole, forceStopSession, getUserProfile,
  type AdminOverview, type AdminUser, type AdminSession, type AdminListenEvent,
  type AdminTrend, type AdminHourly, type AdminAnomaly, type UserProfile,
} from '../../api/admin'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

type Tab = 'users' | 'sessions' | 'listening' | 'anomalies'

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

export default function AdminDashboard() {
  const { setShowAdmin, user } = useStore()
  const isOwner = user?.role === 'owner'
  const [activeTab, setActiveTab] = useState<Tab>('users')
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [sessions, setSessions] = useState<AdminSession[]>([])
  const [events, setEvents] = useState<AdminListenEvent[]>([])
  const [trends, setTrends] = useState<AdminTrend[]>([])
  const [hourly, setHourly] = useState<AdminHourly[]>([])
  const [anomalies, setAnomalies] = useState<AdminAnomaly[]>([])
  const [viewProfile, setViewProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

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
    }).catch(() => {})
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
    ]).then(([ov, us, ss, ev, tr, hr, an]) => {
      setOverview(ov)
      setUsers(us)
      setSessions(ss)
      setEvents(ev)
      setTrends(tr)
      setHourly(hr)
      setAnomalies(an.alerts)
    }).catch(() => {}).finally(() => setLoading(false))
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
    } catch {
      // 403 etc
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
    { key: 'users', label: '用户管理' },
    { key: 'sessions', label: '会话记录' },
    { key: 'listening', label: '播放记录' },
    { key: 'anomalies', label: '异常告警', badge: anomalies.length },
  ]

  return (
    <div className="radio-bg min-h-screen">
      {/* Header */}
      <header className="border-b border-[var(--color-radio-border)] bg-[var(--color-radio-surface)]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[var(--color-radio-accent)] rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">C</span>
            </div>
            <span className="text-lg font-bold tracking-wide">
              Claudio<span className="text-[var(--color-radio-muted)] font-normal"> FM</span>
              <span className="text-[var(--color-radio-gold)] text-sm ml-2">管理面板</span>
            </span>
          </div>
          <button
            onClick={() => setShowAdmin(false)}
            className="text-sm text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)] transition-colors"
          >
            返回电台
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Overview Cards */}
        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="总用户" value={overview.total_users} sub={`${overview.active_users} 活跃`} />
            <Card label="总会话" value={overview.total_sessions} sub={`今日 ${overview.sessions_today}`} />
            <Card label="歌曲库" value={overview.total_songs} />
            <Card label="总播放" value={overview.total_listens} />
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-xl p-4">
            <h3 className="text-sm text-[var(--color-radio-muted)] mb-3">7 日趋势</h3>
            <TrendChart data={trends} />
          </div>
          <div className="bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-xl p-4">
            <h3 className="text-sm text-[var(--color-radio-muted)] mb-3">时段分布</h3>
            <HourlyChart data={hourly} />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[var(--color-radio-card)] rounded-lg p-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 py-2 px-4 rounded-md text-sm transition-colors ${
                activeTab === t.key
                  ? 'bg-[var(--color-radio-accent)] text-white'
                  : 'text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)]'
              }`}
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

        {/* Tab Content */}
        <div className="bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-xl overflow-hidden">
          {activeTab === 'users' && (
            <>
              {users.length >= 2 && (
                <div className="p-4 border-b border-[var(--color-radio-border)]">
                  <h3 className="text-sm text-[var(--color-radio-muted)] mb-3">用户活跃度 Top 10</h3>
                  <UserActivityChart users={users} />
                </div>
              )}
              <UsersTable users={users} isOwner={isOwner} onSetRole={handleSetRole} onViewProfile={handleViewProfile} />
            </>
          )}
          {activeTab === 'sessions' && <SessionsTable sessions={sessions} isOwner={isOwner} onForceStop={handleForceStop} />}
          {activeTab === 'listening' && <ListeningTable events={events} />}
          {activeTab === 'anomalies' && <AnomaliesPanel alerts={anomalies} />}
        </div>
      </div>

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

function Card({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-xl p-4">
      <div className="text-[var(--color-radio-muted)] text-xs mb-1">{label}</div>
      <div className="text-2xl font-bold text-[var(--color-radio-text)]">{value}</div>
      {sub && <div className="text-xs text-[var(--color-radio-muted)] mt-0.5">{sub}</div>}
    </div>
  )
}

function UsersTable({ users, isOwner, onSetRole, onViewProfile }: { users: AdminUser[]; isOwner: boolean; onSetRole: (id: number, role: string) => void; onViewProfile: (id: number) => void }) {
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
                {u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '-'}
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
                {s.created_at ? new Date(s.created_at).toLocaleString('zh-CN') : '-'}
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
                {e.listened_at ? new Date(e.listened_at).toLocaleString('zh-CN') : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AnomaliesPanel({ alerts }: { alerts: AdminAnomaly[] }) {
  if (alerts.length === 0) {
    return (
      <div className="p-6 text-center text-[var(--color-radio-muted)] text-sm">
        暂无异常告警
      </div>
    )
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

const CHART_COLORS = { accent: '#818cf8', gold: '#f59e0b', grid: '#ffffff10', text: '#9ca3af' }

function formatDate(v: unknown) {
  if (typeof v !== 'string') return String(v ?? '')
  const d = new Date(v)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function TrendChart({ data }: { data: AdminTrend[] }) {
  if (data.length === 0) {
    return <div className="h-40 flex items-center justify-center text-xs text-[var(--color-radio-muted)]">暂无数据</div>
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="date" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={formatDate} />
        <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
          labelFormatter={formatDate}
        />
        <Line type="monotone" dataKey="sessions" stroke={CHART_COLORS.accent} strokeWidth={2} dot={false} name="会话" />
        <Line type="monotone" dataKey="listens" stroke={CHART_COLORS.gold} strokeWidth={2} dot={false} name="播放" />
      </LineChart>
    </ResponsiveContainer>
  )
}

function HourlyChart({ data }: { data: AdminHourly[] }) {
  if (data.length === 0) {
    return <div className="h-40 flex items-center justify-center text-xs text-[var(--color-radio-muted)]">暂无数据</div>
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="hour" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={(h: number) => `${h}时`} />
        <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
          labelFormatter={(h) => `${h}:00`}
        />
        <Bar dataKey="count" fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} name="播放次数" />
      </BarChart>
    </ResponsiveContainer>
  )
}

function UserActivityChart({ users }: { users: AdminUser[] }) {
  const top = [...users]
    .sort((a, b) => b.listen_count - a.listen_count)
    .slice(0, 10)
    .map(u => ({ name: u.nickname || `#${u.id}`, listens: u.listen_count }))
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, top.length * 28)}>
      <BarChart data={top} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis type="number" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} width={80} />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="listens" fill={CHART_COLORS.gold} radius={[0, 4, 4, 0]} name="播放次数" />
      </BarChart>
    </ResponsiveContainer>
  )
}

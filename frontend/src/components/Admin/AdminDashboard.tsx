import { useState, useEffect } from 'react'
import { useStore } from '../../store'
import {
  getAdminOverview, getAdminUsers, getAdminSessions, getAdminListening,
  getAdminTrends, getAdminHourly,
  type AdminOverview, type AdminUser, type AdminSession, type AdminListenEvent,
  type AdminTrend, type AdminHourly,
} from '../../api/admin'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

type Tab = 'users' | 'sessions' | 'listening'

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
  const { setShowAdmin } = useStore()
  const [activeTab, setActiveTab] = useState<Tab>('users')
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [sessions, setSessions] = useState<AdminSession[]>([])
  const [events, setEvents] = useState<AdminListenEvent[]>([])
  const [trends, setTrends] = useState<AdminTrend[]>([])
  const [hourly, setHourly] = useState<AdminHourly[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getAdminOverview(),
      getAdminUsers(),
      getAdminSessions(),
      getAdminListening(),
      getAdminTrends(),
      getAdminHourly(),
    ]).then(([ov, us, ss, ev, tr, hr]) => {
      setOverview(ov)
      setUsers(us)
      setSessions(ss)
      setEvents(ev)
      setTrends(tr)
      setHourly(hr)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="radio-bg min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--color-radio-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'users', label: '用户管理' },
    { key: 'sessions', label: '会话记录' },
    { key: 'listening', label: '播放记录' },
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
              <UsersTable users={users} />
            </>
          )}
          {activeTab === 'sessions' && <SessionsTable sessions={sessions} />}
          {activeTab === 'listening' && <ListeningTable events={events} />}
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

function UsersTable({ users }: { users: AdminUser[] }) {
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
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  u.role === 'admin' ? 'bg-[var(--color-radio-gold)]/20 text-[var(--color-radio-gold)]' : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {u.role === 'admin' ? '管理员' : '用户'}
                </span>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SessionsTable({ sessions }: { sessions: AdminSession[] }) {
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

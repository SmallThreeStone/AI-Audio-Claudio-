import { useState } from 'react'
import { expandMaterial } from '../../api/aiMaterial'
import type { Song } from '../../types'

const MATERIAL_PRESETS = [
  '找梁博，适合晚上开车',
  '补充安静男声',
  '找下雨天有空间感的歌',
  '找工作专注但不困的歌',
]

export default function AIMaterialStation({
  compact,
  onExpanded,
}: {
  compact?: boolean
  onExpanded?: () => void
}) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [results, setResults] = useState<Song[]>([])
  const [signals, setSignals] = useState<string[]>([])

  const runExpand = async (value?: string) => {
    const prompt = (value || text).trim()
    if (!prompt || loading) return
    setLoading(true)
    setMessage('')
    try {
      const result = await expandMaterial(prompt)
      if (result.error) {
        setMessage(result.error)
        setResults([])
        setSignals([])
      } else {
        setMessage(result.message || `找到 ${result.found} 首候选，新加入 ${result.added} 首`)
        setResults(result.songs || [])
        setSignals([
          result.intent.artist ? `艺人 ${result.intent.artist}` : '',
          result.intent.scenes?.length ? `场景 ${result.intent.scenes.slice(0, 2).join('/')}` : '',
          result.intent.moods?.length ? `情绪 ${result.intent.moods.slice(0, 2).join('/')}` : '',
          result.intent.energy ? `能量 ${energyLabel(result.intent.energy)}` : '',
        ].filter(Boolean))
        setText('')
        onExpanded?.()
      }
    } catch {
      setMessage('AI 找歌失败，请稍后再试')
      setResults([])
    }
    setLoading(false)
  }

  return (
    <section className={`ai-material-station ${compact ? 'ai-material-station--compact' : ''}`}>
      <div className="ai-material-station__head">
        <div>
          <span>AI 找歌</span>
          <strong>说一句想找什么，我会去网易云补充到你的素材池</strong>
        </div>
        <em>免登录可用</em>
      </div>

      <div className="ai-material-station__bar">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runExpand() }}
          placeholder="比如：找梁博，适合晚上开车"
          disabled={loading}
        />
        <button onClick={() => runExpand()} disabled={loading || !text.trim()}>
          {loading ? '找' : '补歌'}
        </button>
      </div>

      {!compact && (
        <div className="ai-material-presets">
          {MATERIAL_PRESETS.map((preset) => (
            <button key={preset} onClick={() => runExpand(preset)} disabled={loading}>
              {preset}
            </button>
          ))}
        </div>
      )}

      {(message || signals.length > 0) && (
        <div className="ai-material-feedback">
          {signals.length > 0 && (
            <div className="ai-material-signals">
              {signals.map((signal) => <span key={signal}>{signal}</span>)}
            </div>
          )}
          {message && <p>{message}</p>}
        </div>
      )}

      {results.length > 0 && (
        <div className="ai-material-results">
          {results.slice(0, compact ? 3 : 5).map((song) => (
            <div key={song.id}>
              {song.cover_url ? <img src={song.cover_url} alt="" /> : <span />}
              <p>{song.name}<em>{song.artist || '未知艺人'}</em></p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function energyLabel(energy: string) {
  if (energy === 'high') return '偏高'
  if (energy === 'low') return '偏低'
  return '中等'
}

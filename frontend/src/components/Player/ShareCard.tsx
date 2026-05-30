import { useStore } from '../../store'
import { trackEvent } from '../../api/analytics'

async function generateShareImage(
  coverUrl: string | undefined,
  songName: string,
  artist: string,
  theme: string | undefined,
): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = 600
  canvas.height = 800
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, 800)
  bg.addColorStop(0, '#1a1a2e')
  bg.addColorStop(0.5, '#16213e')
  bg.addColorStop(1, '#0f3460')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 600, 800)

  // Try to load cover art
  if (coverUrl) {
    try {
      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const i = new Image()
        i.crossOrigin = 'anonymous'
        i.onload = () => resolve(i)
        i.onerror = () => resolve(null)
        i.src = coverUrl
      })
      if (img) {
        // Large blurred background
        ctx.save()
        ctx.filter = 'blur(40px)'
        ctx.globalAlpha = 0.3
        ctx.drawImage(img, -40, -40, 680, 680)
        ctx.restore()

        // Main cover art — centered, rounded style
        ctx.save()
        const cx = 300, cy = 240, r = 140
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.closePath()
        ctx.clip()
        ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2)
        ctx.restore()

        // Ring around cover
        ctx.strokeStyle = 'rgba(233, 69, 96, 0.4)'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(cx, cy, r + 6, 0, Math.PI * 2)
        ctx.stroke()
      }
    } catch {
      // ignore cover load errors
    }
  }

  // Song info
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 22px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(songName || 'Claudio FM', 300, 430)

  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = '16px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText(artist || '', 300, 460)

  if (theme) {
    ctx.fillStyle = 'rgba(233, 69, 96, 0.9)'
    ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillText(theme, 300, 495)
  }

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(150, 530)
  ctx.lineTo(450, 530)
  ctx.stroke()

  // Branding
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 28px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText('Claudio FM', 300, 580)

  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText('AI 私人电台 DJ · 用心情选歌', 300, 610)

  // Bottom QR hint
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText('扫码体验你的专属电台', 300, 660)

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}

export default function ShareCard() {
  const { currentItem, session } = useStore()

  const handleShare = async () => {
    if (!currentItem || currentItem.item_type.startsWith('tts')) return

    trackEvent('share_click', {
      song_name: currentItem.song_name,
      artist: currentItem.artist,
    })

    const blob = await generateShareImage(
      currentItem.cover_url,
      currentItem.song_name || '',
      currentItem.artist || '',
      session?.session_theme,
    )
    if (!blob) return

    const file = new File([blob], `claudio-fm-${currentItem.song_name || 'share'}.png`, { type: 'image/png' })

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `${currentItem.song_name} - ${currentItem.artist}`,
          text: `正在听 ${currentItem.song_name} · Claudio FM AI 私人电台`,
        })
      } catch {
        // user cancelled
      }
    } else {
      // Fallback: download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `claudio-fm-${currentItem.song_name || 'share'}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  if (!currentItem || currentItem.item_type.startsWith('tts')) return null

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-1 text-[11px] text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)] transition-colors"
      title="分享当前歌曲"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
      </svg>
      分享
    </button>
  )
}

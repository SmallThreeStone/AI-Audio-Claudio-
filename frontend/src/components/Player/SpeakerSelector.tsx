import { useState } from 'react'
import { useStore } from '../../store'
import { getDlnaDevices, pushToDevice, stopDevice } from '../../api/radio'

export default function SpeakerSelector() {
  const {
    dlnaDevices, activeDlnaDevice, isDiscovering,
    setDlnaDevices, setActiveDlnaDevice, setIsDiscovering,
    currentItem, session,
  } = useStore()
  const [error, setError] = useState<string | null>(null)

  const handleDiscover = async () => {
    setError(null)
    setIsDiscovering(true)
    // If we already have cached devices, keep showing them while refreshing
    try {
      const devices = await getDlnaDevices(dlnaDevices.length === 0) // force only if no cache
      setDlnaDevices(devices)
      if (devices.length === 0 && dlnaDevices.length === 0) {
        setError('未发现 DLNA 设备')
      }
    } catch (e) {
      console.warn('DLNA discover failed:', e)
      if (dlnaDevices.length === 0) setError('搜索失败')
    } finally {
      setIsDiscovering(false)
    }
  }

  const handleSelect = async (device: typeof dlnaDevices[0]) => {
    setError(null)
    setActiveDlnaDevice(device)

    // If currently playing a song, push it to the device
    if (currentItem?.song_id && session) {
      try {
        const title = currentItem.song_name
          ? `${currentItem.song_name} - ${currentItem.artist || 'AI Radio'}`
          : 'AI Radio'
        await pushToDevice(device.location, currentItem.song_id, title)
      } catch (e) {
        console.warn('DLNA push failed:', e)
        setError('推送失败')
      }
    }
  }

  const handleDisconnect = async () => {
    if (activeDlnaDevice) {
      try {
        await stopDevice(activeDlnaDevice.location)
      } catch { /* ignore */ }
      setActiveDlnaDevice(null)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {activeDlnaDevice ? (
        <div className="flex items-center gap-1 text-xs bg-white/10 rounded-full pl-2.5 pr-1 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-[var(--color-radio-text)] max-w-24 truncate">
            {activeDlnaDevice.name}
          </span>
          <button
            onClick={handleDisconnect}
            className="text-[var(--color-radio-muted)] hover:text-red-400 px-1 text-sm leading-none"
            title="断开"
          >
            ×
          </button>
        </div>
      ) : (
        <div className="relative">
          <button
            onClick={handleDiscover}
            disabled={isDiscovering}
            className="flex items-center gap-1 text-xs text-[var(--color-radio-muted)] hover:text-[var(--color-radio-accent)] transition-colors disabled:opacity-50"
            title="搜索音箱"
          >
            <span className={isDiscovering ? 'animate-spin' : ''}>🔊</span>
            {isDiscovering ? '搜索中...' : dlnaDevices.length > 0 ? '选择音箱' : '推送到音箱'}
          </button>

          {dlnaDevices.length > 0 && !activeDlnaDevice && (
            <div className="absolute bottom-full left-0 mb-1 bg-[var(--color-radio-surface)] border border-[var(--color-radio-border)] rounded-lg shadow-lg overflow-hidden min-w-40 z-10">
              {dlnaDevices.map((d) => (
                <button
                  key={d.udn || d.location}
                  onClick={() => handleSelect(d)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors flex items-center gap-2"
                >
                  <span>🔊</span>
                  <div>
                    <div className="text-[var(--color-radio-text)]">{d.name}</div>
                    {d.manufacturer && (
                      <div className="text-[10px] text-[var(--color-radio-muted)]">{d.manufacturer}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <span className="text-[10px] text-red-400">{error}</span>
      )}
    </div>
  )
}

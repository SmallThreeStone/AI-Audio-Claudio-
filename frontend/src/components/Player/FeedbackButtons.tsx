import { useStore } from '../../store'
import { recordFeedback } from '../../api/radio'
import { trackEvent } from '../../api/analytics'

export default function FeedbackButtons() {
  const { currentItem, queue, setQueue, currentIndex } = useStore()

  if (!currentItem || currentItem.item_type.startsWith('tts')) return null

  const handleFeedback = async (feedback: 'liked' | 'disliked') => {
    if (!currentItem) return

    try {
      await recordFeedback(currentItem.id, feedback)
      trackEvent(feedback === 'liked' ? 'feedback_like' : 'feedback_dislike', {
        song_name: currentItem.song_name,
        artist: currentItem.artist,
      })

      let updated = queue.map((item) =>
        item.id === currentItem.id ? { ...item, user_feedback: feedback } : item
      )

      // On dislike, move same-artist upcoming songs to end of queue
      if (feedback === 'disliked' && currentItem.artist) {
        const targetArtist = currentItem.artist
        const currentPos = currentItem.position

        // Partition upcoming items: keep different artists first, same artist last
        const before: typeof queue = []
        const sameArtist: typeof queue = []
        const after: typeof queue = []
        let foundCurrent = false

        for (const item of updated) {
          if (item.id === currentItem.id) {
            before.push(item)
            foundCurrent = true
            continue
          }
          if (!foundCurrent) {
            before.push(item)
          } else if (item.item_type.startsWith('tts')) {
            // Don't reorder TTS items
            after.push(item)
          } else if (item.artist === targetArtist) {
            sameArtist.push(item)
          } else {
            after.push(item)
          }
        }

        updated = [...before, ...after, ...sameArtist]
        // Re-assign positions
        updated = updated.map((item, i) => ({ ...item, position: i }))
      }

      setQueue(updated)
    } catch (e) {
      console.warn('Feedback submit failed:', e)
    }
  }

  const fb = currentItem.user_feedback

  return (
    <div className="flex items-center gap-2 mt-1">
      <button
        onClick={() => handleFeedback('liked')}
        disabled={!!fb}
        className={`p-1.5 rounded-full transition-all ${
          fb === 'liked'
            ? 'text-green-400 bg-green-400/10'
            : 'text-[var(--color-radio-muted)] hover:text-green-400 hover:bg-green-400/5'
        } disabled:cursor-default`}
        title="喜欢这首歌"
      >
        <svg className="w-4 h-4" fill={fb === 'liked' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
        </svg>
      </button>
      <button
        onClick={() => handleFeedback('disliked')}
        disabled={!!fb}
        className={`p-1.5 rounded-full transition-all ${
          fb === 'disliked'
            ? 'text-red-400 bg-red-400/10'
            : 'text-[var(--color-radio-muted)] hover:text-red-400 hover:bg-red-400/5'
        } disabled:cursor-default`}
        title="跳过类似歌曲"
      >
        <svg className="w-4 h-4" fill={fb === 'disliked' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
        </svg>
      </button>
    </div>
  )
}

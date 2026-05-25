import { useState, useRef, useCallback, useEffect } from 'react'

// SpeechRecognition is only available in Chrome/Edge
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

interface Props {
  onResult: (text: string) => void
}

export default function VoiceInput({ onResult }: Props) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const recognitionRef = useRef<any>(null)
  const barsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSupported(!!SpeechRecognition)
  }, [])

  const startListening = useCallback(() => {
    if (!SpeechRecognition) return
    const recognition = new SpeechRecognition()
    recognition.lang = 'zh-CN'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event: any) => {
      const text = event.results[0][0]?.transcript
      if (text) onResult(text)
    }

    recognition.onerror = () => {
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [onResult])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setListening(false)
  }, [])

  if (!supported) return null

  return (
    <button
      type="button"
      onMouseDown={startListening}
      onMouseUp={stopListening}
      onMouseLeave={stopListening}
      onTouchStart={startListening}
      onTouchEnd={stopListening}
      className={`relative flex items-center justify-center w-9 h-9 rounded-full border transition-all flex-shrink-0 ${
        listening
          ? 'border-[var(--color-radio-accent)] bg-[var(--color-radio-accent)]/20 scale-110'
          : 'border-[var(--color-radio-border)] hover:border-[var(--color-radio-muted)]'
      }`}
      title="长按说话（仅 Chrome/Edge）"
    >
      {listening ? (
        <div ref={barsRef} className="flex items-center gap-[2px]">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="voice-bar w-[2px] bg-[var(--color-radio-accent)] rounded-full"
              style={{
                height: `${8 + Math.random() * 12}px`,
                animation: `voice-bar-pulse 0.3s ease-in-out ${i * 0.1}s infinite alternate`,
              }}
            />
          ))}
        </div>
      ) : (
        <svg className="w-4 h-4 text-[var(--color-radio-muted)]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      )}
    </button>
  )
}

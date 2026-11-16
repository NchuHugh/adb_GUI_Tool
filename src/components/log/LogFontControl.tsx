import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { MAX_LOG_FONT_SIZE, MIN_LOG_FONT_SIZE, parseLogFontSize } from '../../utils/logFontSize'

interface Props {
  size: number
  onChange: (size: number) => void
}

export default function LogFontControl({ size, onChange }: Props) {
  const [draft, setDraft] = useState(String(size))
  useEffect(() => setDraft(String(size)), [size])

  const commit = () => {
    const next = parseLogFontSize(draft, size)
    setDraft(String(next))
    onChange(next)
  }

  const step = (delta: number) => {
    const next = size + delta
    setDraft(String(next))
    onChange(next)
  }

  return (
    <div role="group" aria-label="日志字号调节" className="inline-flex shrink-0 items-center rounded border border-divider bg-slate-900 text-xs">
      <button type="button" className="btn-ghost rounded-l p-1 disabled:opacity-40"
        title="缩小日志字号" aria-label="缩小日志字号" disabled={size <= MIN_LOG_FONT_SIZE}
        onClick={() => step(-1)}>
        <Minus size={12} />
      </button>
      <input
        aria-label="日志字号"
        title={`日志字号（${MIN_LOG_FONT_SIZE}–${MAX_LOG_FONT_SIZE} px）`}
        className="w-7 border-x border-divider bg-transparent py-0.5 text-center text-text-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={event => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
      />
      <button type="button" className="btn-ghost rounded-r p-1 disabled:opacity-40"
        title="放大日志字号" aria-label="放大日志字号" disabled={size >= MAX_LOG_FONT_SIZE}
        onClick={() => step(1)}>
        <Plus size={12} />
      </button>
    </div>
  )
}

import { useRef } from 'react'

interface Props {
  onResize: (deltaY: number) => void
  label?: string
}

export default function LogResizeHandle({ onResize, label = '调整日志面板高度' }: Props) {
  const lastY = useRef(0)
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="horizontal"
      tabIndex={0}
      onPointerDown={event => {
        if (event.button !== 0) return
        lastY.current = event.clientY
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        onResize(lastY.current - event.clientY)
        lastY.current = event.clientY
      }}
      onKeyDown={event => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
        event.preventDefault()
        onResize(event.key === 'ArrowUp' ? 16 : -16)
      }}
      className="h-2 w-full touch-none select-none cursor-row-resize bg-transparent hover:bg-blue-500/40 focus-visible:bg-blue-500/40 transition-colors group flex items-center justify-center flex-shrink-0"
      title={`拖动${label}`}
    >
      <div className="w-12 h-0.5 rounded-full bg-slate-600 group-hover:bg-blue-400 transition-colors" />
    </div>
  )
}

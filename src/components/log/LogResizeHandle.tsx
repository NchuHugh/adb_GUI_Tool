import { useRef } from 'react'

interface Props {
  onResize: (deltaY: number) => void
}

export default function LogResizeHandle({ onResize }: Props) {
  const isDragging = useRef(false)
  const lastY = useRef(0)

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    lastY.current = e.clientY

    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging.current) return
      const delta = lastY.current - event.clientY
      lastY.current = event.clientY
      onResize(delta)
    }

    const handleMouseUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      className="h-1.5 w-full cursor-row-resize bg-transparent hover:bg-blue-500/40 transition-colors group flex items-center justify-center flex-shrink-0"
      title="拖动调整日志面板高度"
    >
      <div className="w-12 h-0.5 rounded-full bg-slate-600 group-hover:bg-blue-400 transition-colors" />
    </div>
  )
}

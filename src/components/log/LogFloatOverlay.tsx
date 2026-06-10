import { useEffect } from 'react'
import { Minimize2 } from 'lucide-react'
import LogPanel from '../LogPanel'
import { useLogStore } from '../../store/logStore'

export default function LogFloatOverlay() {
  const setIsFloating = useLogStore(s => s.setIsFloating)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFloating(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [setIsFloating])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950"
      style={{ top: 48 }}
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-700 flex-shrink-0">
        <span className="text-sm text-slate-400 font-medium">日志输出</span>
        <button
          onClick={() => setIsFloating(false)}
          title="退出最大化（Esc）"
          className="flex items-center gap-1.5 px-2 py-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 text-xs"
        >
          <Minimize2 size={13} />
          退出最大化
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <LogPanel isFloating />
      </div>
    </div>
  )
}

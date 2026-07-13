import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, CheckCheck, ChevronDown, ChevronRight, Clock, Copy, Loader2, Square, Trash2, XCircle } from 'lucide-react'
import { LogSegment } from '../../types'
import { useLogStore } from '../../store/logStore'

interface Props {
  segment: LogSegment
  onToggle: (cmdId: string) => void
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })
}

function formatDuration(segment: LogSegment): string {
  if (!segment.endedAt) return ''
  const ms = segment.endedAt - segment.startedAt
  return `${(ms / 1000).toFixed(1)}s`
}

function SegmentStatus({ segment }: { segment: LogSegment }) {
  if (!segment.endedAt) {
    return <Loader2 size={14} className="text-primary animate-spin flex-shrink-0" />
  }
  if (segment.reason === 'timeout') {
    return <Clock size={14} className="text-amber-400 flex-shrink-0" />
  }
  if (segment.reason === 'killed') {
    return <Square size={12} className="text-slate-400 flex-shrink-0" fill="currentColor" />
  }
  if (segment.exitCode === 0) {
    return <CheckCircle2 size={14} className="text-success flex-shrink-0" />
  }
  return <XCircle size={14} className="text-error flex-shrink-0" />
}

export default function LogSegmentHeader({ segment, onToggle }: Props) {
  const [copied, setCopied] = useState(false)
  const [deleteState, setDeleteState] = useState<'idle' | 'confirming'>('idle')
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const getSegmentText = useLogStore(s => s.getSegmentText)
  const deleteSegment = useLogStore(s => s.deleteSegment)
  const duration = formatDuration(segment)

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    }
  }, [])

  const handleCopySegment = (e: React.MouseEvent) => {
    e.stopPropagation()
    const text = getSegmentText(segment.cmdId)
    window.electronAPI.copyToClipboard(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteState('confirming')
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    confirmTimerRef.current = setTimeout(() => setDeleteState('idle'), 3000)
  }

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    deleteSegment(segment.cmdId)
  }

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    setDeleteState('idle')
  }

  return (
    <div
      className="group flex items-center gap-2 px-3 h-10 bg-slate-900 border-b border-t border-slate-700 cursor-pointer hover:bg-slate-800 select-none"
      onClick={() => onToggle(segment.cmdId)}
      title={segment.resolvedCommand}
    >
      {segment.isCollapsed
        ? <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />
        : <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
      }
      <span className="font-medium text-slate-200 text-sm flex-shrink-0">
        {segment.commandLabel}
      </span>
      <span className="font-mono text-xs text-slate-400 truncate flex-1">
        {segment.resolvedCommand}
      </span>
      {segment.isCollapsed && (
        <span className="text-xs text-slate-500 flex-shrink-0">
          {segment.lineIds.length} 行{duration ? ` · ${duration}` : ''}
        </span>
      )}
      <span className="text-xs text-slate-500 flex-shrink-0">
        {formatTime(segment.startedAt)}
      </span>
      {segment.endedAt && deleteState === 'idle' && (
        <button
          onClick={handleCopySegment}
          title="复制此命令的输出"
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-700"
        >
          {copied
            ? <CheckCheck size={13} className="text-green-400" />
            : <Copy size={13} />
          }
        </button>
      )}
      {segment.endedAt && deleteState === 'idle' && (
        <button
          onClick={handleDeleteClick}
          title="删除此命令的输出"
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700"
        >
          <Trash2 size={13} />
        </button>
      )}
      {segment.endedAt && deleteState === 'confirming' && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleCancelDelete}
            title="取消"
            className="px-1.5 py-0.5 rounded text-xs text-slate-300 hover:bg-slate-700"
          >
            取消
          </button>
          <button
            onClick={handleConfirmDelete}
            title="确认删除"
            className="px-1.5 py-0.5 rounded text-xs text-white bg-red-600 hover:bg-red-500"
          >
            确认删除
          </button>
        </div>
      )}
      <SegmentStatus segment={segment} />
    </div>
  )
}

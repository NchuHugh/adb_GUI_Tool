import { CheckCircle2, ChevronDown, ChevronRight, Clock, Loader2, Square, XCircle } from 'lucide-react'
import { LogSegment } from '../../types'

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
  const duration = formatDuration(segment)

  return (
    <div
      className="flex items-center gap-2 px-3 h-10 bg-slate-900 border-b border-t border-slate-700 cursor-pointer hover:bg-slate-800 select-none"
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
      <SegmentStatus segment={segment} />
    </div>
  )
}

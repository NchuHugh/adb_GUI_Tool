import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, CheckCheck, ChevronDown, ChevronRight, Clock, Copy, Loader2, RotateCcw, Square, Trash2, XCircle } from 'lucide-react'
import { LogSegment } from '../../types'
import { useCommandStore } from '../../store/commandStore'
import { formatCommand, getCommandTool } from '../../utils/argParser'
import { confirmDangerousCommand } from '../../utils/commandExecutionUtils'
import { usePanelLogStore } from '../LogPanelStore'

interface Props {
  segment: LogSegment
  onToggle: (cmdId: string) => void
  allowReplay: boolean
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })
}

function formatDuration(segment: LogSegment): string {
  if (segment.endedAt === undefined || !segment.startedAt) return ''
  const ms = segment.endedAt - segment.startedAt
  return `${(ms / 1000).toFixed(1)}s`
}

function SegmentStatus({ segment }: { segment: LogSegment }) {
  if (segment.endedAt === undefined) {
    return <Loader2 size={14} className="text-primary animate-spin flex-shrink-0" />
  }
  if (segment.reason === 'timeout') {
    return <Clock size={14} className="text-amber-400 flex-shrink-0" />
  }
  if (segment.reason === 'killed') {
    return <Square size={12} className="text-slate-400 flex-shrink-0" fill="currentColor" />
  }
  if (segment.exitCode === undefined) return null
  if (segment.exitCode === 0) {
    return <CheckCircle2 size={14} className="text-success flex-shrink-0" />
  }
  return <XCircle size={14} className="text-error flex-shrink-0" />
}

export default function LogSegmentHeader({ segment, onToggle, allowReplay }: Props) {
  const [copied, setCopied] = useState(false)
  const [replaying, setReplaying] = useState(false)
  const [deleteState, setDeleteState] = useState<'idle' | 'confirming'>('idle')
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const getSegmentText = usePanelLogStore(s => s.getSegmentText)
  const deleteSegment = usePanelLogStore(s => s.deleteSegment)
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

  const handleReplay = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const { execution } = segment
    if (!allowReplay || !execution || segment.endedAt === undefined || replaying) return

    const { commandId, resolvedArgs, tool } = execution
    const { commands, executionStates, recordPendingMeta, updateExecutionState, consumePendingMeta } = useCommandStore.getState()
    const dialogWindow = event.currentTarget.ownerDocument.defaultView ?? window
    const command = commands.find(item => item.id === commandId)
    if (!command || command.invalid || getCommandTool(command.template) !== tool) {
      dialogWindow.alert('原命令已删除、失效或切换了工具，无法再次执行。')
      return
    }
    if (command.timeout === 0 && Array.from(executionStates.values()).some(
      state => state.commandId === commandId && state.status === 'running',
    )) {
      dialogWindow.alert('此命令正在运行，请先中止后再执行。')
      return
    }
    const template = formatCommand(tool, resolvedArgs)
    if (!confirmDangerousCommand({ ...command, template }, dialogWindow)) return

    const cmdId = crypto.randomUUID()
    setReplaying(true)
    recordPendingMeta(cmdId, commandId, resolvedArgs, segment.commandLabel)
    updateExecutionState(cmdId, { commandId, status: 'running', startTime: Date.now() })
    try {
      await window.electronAPI.runCommand({ cmdId, commandId, resolvedArgs })
    } catch (error) {
      consumePendingMeta(cmdId)
      updateExecutionState(cmdId, { status: 'idle' })
      const message = error instanceof Error ? error.message : String(error)
      dialogWindow.alert(`再次执行失败：${message}`)
    } finally {
      setReplaying(false)
    }
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
        {segment.startedAt ? formatTime(segment.startedAt) : ''}
      </span>
      {allowReplay && segment.execution && segment.endedAt !== undefined && deleteState === 'idle' && (
        <button
          type="button"
          onClick={handleReplay}
          disabled={replaying}
          title="再执行一次"
          aria-label="再执行一次"
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40 transition-opacity p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-700"
        >
          <RotateCcw size={13} />
        </button>
      )}
      {segment.endedAt !== undefined && deleteState === 'idle' && (
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
      {segment.endedAt !== undefined && deleteState === 'idle' && (
        <button
          onClick={handleDeleteClick}
          title="删除此命令的输出"
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700"
        >
          <Trash2 size={13} />
        </button>
      )}
      {segment.endedAt !== undefined && deleteState === 'confirming' && (
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

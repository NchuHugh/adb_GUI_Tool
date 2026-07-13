import { ArrowDownToLine, ArrowUpToLine, ChevronDown, ChevronUp, Copy, Trash2, Square, Maximize2 } from 'lucide-react'
import { useCommandStore } from '../../store/commandStore'
import { useLogStore } from '../../store/logStore'
import { LogLevel } from '../../types'
import { getVisibleLineIds, stripAnsi } from '../../utils/logUtils'
import LogLevelFilter from './LogLevelFilter'

interface Props {
  isFloating?: boolean
}

export default function LogToolbar({ isFloating = false }: Props) {
  const executionStates = useCommandStore(s => s.executionStates)
  const lines = useLogStore(s => s.lines)
  const lineOrder = useLogStore(s => s.lineOrder)
  const segments = useLogStore(s => s.segments)
  const levelFilter = useLogStore(s => s.levelFilter)
  const streamFilter = useLogStore(s => s.streamFilter)
  const autoScroll = useLogStore(s => s.autoScroll)
  const segmentOrderDisplay = useLogStore(s => s.segmentOrderDisplay)
  const setAutoScroll = useLogStore(s => s.setAutoScroll)
  const clearLog = useLogStore(s => s.clearLog)
  const collapseAll = useLogStore(s => s.collapseAll)
  const expandAll = useLogStore(s => s.expandAll)
  const toggleSegmentOrder = useLogStore(s => s.toggleSegmentOrder)
  const toggleLevelFilter = useLogStore(s => s.toggleLevelFilter)
  const setLevelFilter = useLogStore(s => s.setLevelFilter)
  const setStreamFilter = useLogStore(s => s.setStreamFilter)
  const setIsFloating = useLogStore(s => s.setIsFloating)

  const runningCmdIds = Array.from(executionStates.values())
    .filter(state => state.status === 'running')
    .map(state => state.cmdId)

  const handleAbort = () => {
    runningCmdIds.forEach(cmdId => window.electronAPI.killCommand(cmdId))
  }

  const handleCopyVisible = () => {
    const ids = getVisibleLineIds({ lineOrder, lines, segments, levelFilter, streamFilter })
    const text = ids
      .map(id => stripAnsi(lines.get(id)?.raw ?? ''))
      .join('\n')
    window.electronAPI.copyToClipboard(text)
  }

  return (
    <div className="toolbar bg-slate-800 border-b border-divider flex-shrink-0 min-w-0">
      {runningCmdIds.length > 0 && (
        <button
          onClick={handleAbort}
          className="flex items-center gap-1.5 px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-medium text-white transition-colors"
          title="中止所有正在执行的命令"
        >
          <Square size={12} fill="currentColor" />
          中止
        </button>
      )}

      <div className="h-5 border-l border-divider" />

      <button className="btn-ghost px-2 py-1 rounded text-xs flex items-center gap-1" onClick={collapseAll}>
        <ChevronDown size={13} />
        全部折叠
      </button>
      <button className="btn-ghost px-2 py-1 rounded text-xs flex items-center gap-1" onClick={expandAll}>
        <ChevronUp size={13} />
        全部展开
      </button>
      <button
        onClick={toggleSegmentOrder}
        title={segmentOrderDisplay === 'asc' ? '切换为逆序（最新在上）' : '切换为正序（最新在下）'}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
          segmentOrderDisplay === 'desc'
            ? 'bg-blue-500/20 text-blue-400'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
        }`}
      >
        {segmentOrderDisplay === 'desc'
          ? <><ArrowDownToLine size={13} /> 逆序</>
          : <><ArrowUpToLine size={13} /> 正序</>
        }
      </button>

      <div className="h-5 border-l border-divider" />

      <LogLevelFilter
        levelFilter={levelFilter}
        streamFilter={streamFilter}
        onToggleLevel={toggleLevelFilter}
        onClearLevels={() => setLevelFilter(new Set<LogLevel>())}
        onStreamFilterChange={setStreamFilter}
      />

      <div className="flex-1 min-w-2" />

      <button
        className={`btn-ghost px-2 py-1 rounded text-xs flex items-center gap-1 ${autoScroll ? 'text-primary' : 'text-text-secondary'}`}
        onClick={() => setAutoScroll(!autoScroll)}
        title={autoScroll ? '自动滚动（开）' : '自动滚动（关）'}
      >
        <span className={`w-2 h-2 rounded-full ${autoScroll ? 'bg-success' : 'bg-slate-500'}`} />
        自动滚动
      </button>
      <button className="btn-ghost p-1 rounded" title="复制可见日志" onClick={handleCopyVisible}>
        <Copy size={14} />
      </button>
      {!isFloating && (
        <button
          className="btn-ghost p-1 rounded"
          title="最大化日志面板"
          onClick={() => setIsFloating(true)}
        >
          <Maximize2 size={14} />
        </button>
      )}
      <button className="btn-ghost p-1 rounded" title="清除日志" onClick={clearLog}>
        <Trash2 size={14} />
      </button>
    </div>
  )
}

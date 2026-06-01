import { useLogStore } from '../store/logStore'
import { useCommandStore } from '../store/commandStore'
import { RotateCcw, X, Trash2, Clock } from 'lucide-react'

export default function HistoryPanel() {
  const history = useLogStore(s => s.history)
  const isHistoryOpen = useLogStore(s => s.isHistoryOpen)
  const toggleHistory = useLogStore(s => s.toggleHistory)
  const clearHistory = useLogStore(s => s.clearHistory)
  const addEntry = useLogStore(s => s.addEntry)

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString)
      return d.toLocaleTimeString('zh-CN', { hour12: false })
    } catch {
      return isoString
    }
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const handleReExecute = (entry: typeof history[0]) => {
    const cmd = useCommandStore.getState().commands.find(c => c.id === entry.commandId)
    if (!cmd) {
      // 命令已从配置中删除，无法重新执行
      alert('命令已不存在于配置中')
      return
    }

    if (!entry.hasParams) {
      // 无参数命令：直接执行
      const cmdId = crypto.randomUUID()
      const request = {
        cmdId,
        commandId: entry.commandId,
        resolvedArgs: entry.resolvedArgs,
      }
      useCommandStore.getState().recordPendingMeta(cmdId, entry.commandId, entry.resolvedArgs, entry.commandLabel)
      useCommandStore.getState().updateExecutionState(cmdId, {
        cmdId,
        commandId: entry.commandId,
        status: 'running',
        startTime: Date.now(),
      })
      window.electronAPI.runCommand(request).catch(console.error)
    } else {
      // 有参数命令：打开 ParamDialog，预填上次参数
      // F3 实现时此逻辑生效
      const initialValues: Record<string, string> = {}
      cmd.params.forEach((p, i) => {
        initialValues[p.key] = entry.resolvedArgs[i] ?? p.default
      })
      useCommandStore.getState().openParamDialog(cmd, initialValues)
    }
  }

  const handleClear = () => {
    if (window.confirm('确认清空全部历史记录？此操作不可撤销。')) {
      clearHistory()
    }
  }

  if (!isHistoryOpen) return null

  return (
    <>
      {/* 遮罩层（点击关闭抽屉）*/}
      <div
        className="fixed inset-0 z-40"
        style={{ top: 48, bottom: '35%' }}
        onClick={toggleHistory}
      />

      {/* 抽屉面板 */}
      <div
        className="fixed right-0 z-50 flex flex-col bg-sidebar-bg border-l border-divider shadow-2xl transition-transform duration-200 ease-out"
        style={{ top: 48, bottom: '35%', width: 360, transform: isHistoryOpen ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-divider flex-shrink-0">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-text-secondary" />
            <span className="text-sm font-semibold text-text-primary">历史记录</span>
            <span className="text-xs text-text-secondary">({history.length})</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="btn-ghost p-1 rounded"
              title="清空历史"
              onClick={handleClear}
            >
              <Trash2 size={14} />
            </button>
            <button
              className="btn-ghost p-1 rounded"
              title="关闭"
              onClick={toggleHistory}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto">
          {history.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-text-secondary text-sm">
              暂无历史记录
            </div>
          ) : (
            history.map((entry) => (
              <div
                key={entry.id}
                className="px-4 py-3 border-b border-divider/50 hover:bg-slate-800/50 transition-colors cursor-pointer group"
              >
                {/* 命令标签 + 重新执行按钮 */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-text-primary truncate flex-1">
                    {entry.commandLabel}
                  </span>
                  <button
                    className="opacity-0 group-hover:opacity-100 btn-ghost p-1 rounded transition-opacity"
                    title="重新执行"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleReExecute(entry)
                    }}
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>

                {/* 完整命令 */}
                <div className="text-xs font-mono text-text-secondary truncate mb-1.5">
                  {entry.resolvedCommand}
                </div>

                {/* 时间 · 耗时 · 状态 */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">{formatTime(entry.executedAt)}</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-500">{formatDuration(entry.durationMs)}</span>
                  <span className="text-slate-600">·</span>
                  {entry.exitCode === 0 ? (
                    <span className="text-success">✓ 成功</span>
                  ) : entry.exitCode === -1 ? (
                    <span className="text-amber-500">⏱ 超时</span>
                  ) : (
                    <span className="text-error">✗ 失败 ({entry.exitCode})</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}

import { useState } from 'react'
import { CommandDef, RunRequest } from '../types'
import { useCommandStore } from '../store/commandStore'
import { Loader2, CheckCircle2, XCircle, ChevronRight, Trash2, Pencil, Star } from 'lucide-react'
import { useFavoriteStore } from '../store/favoriteStore'
import { confirmDangerousCommand, isDangerousCommand } from '../utils/commandExecutionUtils'
import { templateToAdbArgs } from '../utils/argParser'

interface Props {
  command: CommandDef
}

export default function CommandCard({ command }: Props) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const executionStates = useCommandStore(s => s.executionStates)

  const hasParams = command.params.length > 0

  // 查找此命令最近的执行状态
  const recentExec = Array.from(executionStates.values())
    .filter(e => e.commandId === command.id)
    .sort((a, b) => b.startTime - a.startTime)[0]

  // Bug 8 fix: 流式命令（timeout=0）运行时禁止再次点击
  const isStreamRunning = command.timeout === 0 && recentExec?.status === 'running'

  const isDangerous = isDangerousCommand(command.id)

  const handleClick = async () => {
    setErrorMsg(null)

    // Bug 8 fix: 流式命令正在运行中，阻止重复执行
    if (isStreamRunning) return

    if (command.invalid) return

    if (!confirmDangerousCommand(command)) return

    // F3: 带参数的命令 → 打开 ParamDialog
    if (hasParams) {
      useCommandStore.getState().openParamDialog(command)
      return
    }

    // 无参数命令 → 直接执行
    // 生成执行 ID
    const cmdId = crypto.randomUUID()

    // 构建 resolvedArgs：从 template 中分离出参数（去除 'adb' 前缀）
    const resolvedArgs = templateToAdbArgs(command.template)

    const request: RunRequest = {
      cmdId,
      commandId: command.id,
      resolvedArgs,
    }

    // 记录元信息（供 App.tsx 在 ADB_DONE 时构造 HistoryEntry）
    useCommandStore.getState().recordPendingMeta(cmdId, command.id, resolvedArgs, command.label)

    // 更新执行状态
    useCommandStore.getState().updateExecutionState(cmdId, {
      cmdId,
      commandId: command.id,
      status: 'running',
      startTime: Date.now(),
    })

    try {
      await window.electronAPI.runCommand(request)
    } catch (err: any) {
      setErrorMsg(err.message || '执行失败')
    }
  }

  // 收藏切换
  const handleFavoriteToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    const favStore = useFavoriteStore.getState()
    const isFav = favStore.isFavorited(command.id)

    if (isFav) {
      const entries = favStore.favorites.filter(f => f.commandId === command.id)
      if (entries.length > 0) {
        const oldest = entries.sort((a, b) => a.pinnedAt.localeCompare(b.pinnedAt))[0]
        favStore.removeFavorite(oldest.id)
      }
    } else {
      if (command.params.length === 0) {
        favStore.addFavorite({
          commandId: command.id,
          commandLabel: command.label,
          nickname: command.label,
          resolvedArgs: {},
          hasParams: false,
        })
      } else {
        useCommandStore.getState().openParamDialogForFavorite(command)
      }
    }
  }

  const isFav = useFavoriteStore(s => s.isFavorited(command.id))

  // 删除自定义命令
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    const confirmed = window.confirm(`确认删除自定义命令「${command.label}」？\n\n此操作不可撤销，该命令将从配置文件中永久移除。`)
    if (!confirmed) return

    try {
      const result = await window.electronAPI.deleteCommand(command.id)
      if (result.success && result.config) {
        useCommandStore.getState().setConfig(result.config)
      } else {
        alert(result.error || '删除失败')
      }
    } catch (err: any) {
      alert(err.message || '删除失败')
    }
  }

  const statusIcon = () => {
    if (recentExec?.status === 'running') {
      return <Loader2 size={16} className="text-primary animate-spin" />
    }
    if (recentExec?.status === 'success') {
      return <CheckCircle2 size={16} className="text-success" />
    }
    if (recentExec?.status === 'failed' || recentExec?.status === 'timeout') {
      return <XCircle size={16} className="text-error" />
    }
    return null
  }

  // Bug fix: 外按钮内不能嵌套 <button>（HTML 规范禁止），改用 <div role="button">
  // 否则删除按钮在 Chromium/Electron 中不渲染或无效
  const isDisabled = command.invalid || isStreamRunning

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <div
      className={`command-card text-left relative ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      onClick={isDisabled ? undefined : handleClick}
      onKeyDown={isDisabled ? undefined : handleKeyDown}
      title={isStreamRunning ? '命令正在运行中...' : command.invalid ? command.invalidReason : command.description}
    >
      {/* 状态图标 + 收藏按钮 */}
      <div className="absolute top-3 right-3 flex items-center gap-1">
        {statusIcon()}
        <button
          type="button"
          onClick={handleFavoriteToggle}
          title={isFav ? '取消收藏' : '收藏命令'}
          className={`p-0.5 rounded transition-colors ${
            isFav
              ? 'text-amber-400 hover:text-slate-400'
              : 'text-slate-600 hover:text-amber-400'
          }`}
        >
          <Star size={14} fill={isFav ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* 命令标签 */}
      <div className="text-sm font-semibold text-text-primary mb-1 pr-6">
        {command.label}
      </div>

      {/* 命令描述 */}
      <div className="text-xs text-text-secondary line-clamp-2">
        {command.description}
      </div>

      {/* 危险命令标记 */}
      {isDangerous && (
        <div className="mt-2 text-xs text-amber-500">
          ⚠ 谨慎操作
        </div>
      )}

      {/* 参数指示 */}
      {hasParams && (
        <div className="mt-2 flex items-center gap-1 text-xs text-primary">
          <ChevronRight size={12} />
          <span>{command.params.length} 个参数（点击配置）</span>
        </div>
      )}
      {!hasParams && !isStreamRunning && (
        <div className="mt-2 text-xs text-success">
          直接执行
        </div>
      )}
      {isStreamRunning && (
        <div className="mt-2 text-xs text-primary flex items-center gap-1">
          <Loader2 size={10} className="animate-spin" />
          运行中...
        </div>
      )}

      {/* 无效标记 */}
      {command.invalid && (
        <div className="mt-1 text-xs text-error">
          ⚠ 配置无效
        </div>
      )}

      {/* 自定义命令标记 + 编辑/删除按钮 */}
      {command.custom && (
        <div className="mt-2 pt-2 border-t border-slate-700 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">自定义</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-blue-400 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                useCommandStore.getState().openCommandEditor(command)
              }}
              title="编辑命令"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              className="p-1 rounded hover:bg-red-900/30 text-slate-400 hover:text-red-400 transition-colors"
              onClick={handleDelete}
              title="删除自定义命令"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 执行错误 */}
      {errorMsg && (
        <div className="mt-1 text-xs text-error truncate">
          {errorMsg}
        </div>
      )}
    </div>
  )
}

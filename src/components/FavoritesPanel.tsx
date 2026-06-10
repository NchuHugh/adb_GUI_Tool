import { useState, useRef, useEffect } from 'react'
import { useFavoriteStore } from '../store/favoriteStore'
import { useCommandStore } from '../store/commandStore'
import { useLogStore } from '../store/logStore'
import { Star, X, Play, Trash2 } from 'lucide-react'
import { FavoriteEntry } from '../types'
import { templateToAdbArgs } from '../utils/argParser'

/** 根据收藏条目 + 命令配置，构建可读的命令预览 */
function buildPreviewCommand(entry: FavoriteEntry, template: string | undefined): string {
  if (!template) {
    // 命令已被删除：回退到参数值拼接
    const vals = Object.values(entry.resolvedArgs)
    return vals.length > 0 ? `[已删除] ${vals.join(' ')}` : '[已删除]'
  }
  let cmd = template
  for (const [key, val] of Object.entries(entry.resolvedArgs)) {
    cmd = cmd.replace(`{${key}}`, val || `{${key}}`)
  }
  return cmd
}

export default function FavoritesPanel() {
  const favorites = useFavoriteStore(s => s.favorites)
  const isOpen = useFavoriteStore(s => s.isFavoritesOpen)
  const toggleFavorites = useFavoriteStore(s => s.toggleFavorites)
  const removeFavorite = useFavoriteStore(s => s.removeFavorite)
  const updateNickname = useFavoriteStore(s => s.updateNickname)
  const commands = useCommandStore(s => s.commands)
  const isHistoryOpen = useLogStore(s => s.isHistoryOpen)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // 打开收藏面板时关闭历史面板（两者互斥）
  useEffect(() => {
    if (isOpen && isHistoryOpen) {
      useLogStore.getState().toggleHistory()
    }
  }, [isOpen, isHistoryOpen])

  // 聚焦重命名输入框
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingId])

  if (!isOpen) return null

  const startRename = (entry: FavoriteEntry) => {
    setRenamingId(entry.id)
    setRenameValue(entry.nickname)
  }

  const commitRename = () => {
    if (renamingId) {
      updateNickname(renamingId, renameValue)
      setRenamingId(null)
    }
  }

  const cancelRename = () => {
    setRenamingId(null)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') cancelRename()
  }

  const handleExecuteFavorite = (entry: FavoriteEntry) => {
    const command = commands.find(c => c.id === entry.commandId)
    if (!command) return

    if (!entry.hasParams || command.params.length === 0) {
      // 无参数：直接执行
      const cmdId = crypto.randomUUID()
      const resolvedArgs = templateToAdbArgs(command.template, entry.resolvedArgs)
      useCommandStore.getState().recordPendingMeta(cmdId, command.id, resolvedArgs, command.label)
      useCommandStore.getState().updateExecutionState(cmdId, {
        cmdId,
        commandId: command.id,
        status: 'running',
        startTime: Date.now(),
      })
      window.electronAPI.runCommand({ cmdId, commandId: command.id, resolvedArgs })
    } else {
      // 有参数：打开 ParamDialog 预填
      useCommandStore.getState().openParamDialog(command, entry.resolvedArgs)
    }
  }

  return (
    <div
      className="fixed right-0 top-12 bottom-0 z-40 bg-slate-800 border-l border-divider shadow-2xl flex flex-col transition-transform duration-200 ease-out"
      style={{ width: 360, transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-divider flex-shrink-0">
        <div className="flex items-center gap-2">
          <Star size={16} className="text-amber-400" fill="currentColor" />
          <span className="font-semibold text-sm text-text-primary">收藏命令</span>
          {favorites.length > 0 && (
            <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
              {favorites.length}
            </span>
          )}
        </div>
        <button className="btn-ghost p-1 rounded-md" onClick={toggleFavorites} title="关闭">
          <X size={16} />
        </button>
      </div>

      {/* 列表内容 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {favorites.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-12">
            <Star size={32} className="mx-auto mb-3 text-slate-600" />
            <p>暂无收藏命令</p>
            <p className="text-xs mt-1">点击命令卡片上的 ★ 图标添加收藏</p>
          </div>
        ) : (
          favorites
            .sort((a, b) => a.order - b.order)
            .map(entry => {
              const command = commands.find(c => c.id === entry.commandId)
              const isCommandDeleted = !command
              const isRenaming = renamingId === entry.id

              return (
                <div key={entry.id} className="bg-slate-800/50 rounded-lg p-3 border border-divider">
                  {/* 标题行 */}
                  <div className="flex items-center gap-2 mb-1">
                    <Star size={13} className="text-amber-400 flex-shrink-0" fill="currentColor" />
                    {isRenaming ? (
                      <input
                        ref={renameInputRef}
                        type="text"
                        className="input-field text-sm flex-1"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={handleRenameKeyDown}
                      />
                    ) : (
                      <span className="font-medium text-sm text-text-primary truncate">
                        {entry.nickname}
                      </span>
                    )}
                    {!isRenaming && entry.nickname !== entry.commandLabel && (
                      <span className="text-xs text-slate-500 truncate">({entry.commandLabel})</span>
                    )}
                  </div>

                  {/* 命令预览 */}
                  <p className="text-xs font-mono text-slate-400 truncate mb-2">
                    {buildPreviewCommand(entry, command?.template)}
                  </p>

                  {/* 命令已删除警告 */}
                  {isCommandDeleted && (
                    <p className="text-xs text-amber-500 mb-2">⚠ 原命令已被删除</p>
                  )}

                  {/* 操作行 */}
                  <div className="flex items-center justify-between">
                    {!isRenaming && (
                      <button
                        onClick={() => startRename(entry)}
                        className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        重命名
                      </button>
                    )}
                    {isRenaming && <div />}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleExecuteFavorite(entry)}
                        disabled={isCommandDeleted}
                        className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded text-xs text-white transition-colors"
                      >
                        <Play size={11} />
                        执行
                      </button>
                      <button
                        onClick={() => removeFavorite(entry.id)}
                        className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors"
                        title="取消收藏"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
        )}
      </div>

      {/* 底部提示 */}
      <div className="px-4 py-2 border-t border-divider text-xs text-slate-500 text-center flex-shrink-0">
        收藏的命令将在此处一键执行
      </div>
    </div>
  )
}

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useCommandStore } from '../store/commandStore'
import { useFavoriteStore } from '../store/favoriteStore'
import ParamField from './ParamField'
import { X, BookmarkPlus } from 'lucide-react'
import { RunRequest } from '../types'
import { templateToAdbArgs } from '../utils/argParser'

export default function ParamDialog() {
  const paramDialog = useCommandStore(s => s.paramDialog)
  const closeParamDialog = useCommandStore(s => s.closeParamDialog)
  const updateExecutionState = useCommandStore(s => s.updateExecutionState)

  const { isOpen, command, initialValues, mode } = paramDialog
  const isFavoriteMode = mode === 'favorite'

  // 参数值状态
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  // 打开弹窗时初始化参数值
  useEffect(() => {
    if (command) {
      const init: Record<string, string> = {}
      for (const p of command.params) {
        init[p.key] = initialValues[p.key] ?? p.default ?? ''
      }
      setValues(init)
      setErrors({})
    }
  }, [command, initialValues])

  // 更新单个参数值
  const handleChange = useCallback((key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }))
    // 清除该字段的错误
    setErrors(prev => {
      if (prev[key]) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return prev
    })
  }, [])

  // 预览命令
  const previewCommand = useMemo(() => {
    if (!command) return ''
    let cmd = command.template
    for (const [key, val] of Object.entries(values)) {
      cmd = cmd.replace(`{${key}}`, val || `{${key}}`)
    }
    return cmd
  }, [command, values])

  // 校验并执行
  const handleExecute = async () => {
    if (!command) return

    const newErrors: Record<string, string> = {}
    for (const p of command.params) {
      if (p.required && !values[p.key]?.trim()) {
        newErrors[p.key] = '此字段必填'
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    // 构造 RunRequest
    const cmdId = crypto.randomUUID()
    const finalArgs = templateToAdbArgs(command.template, values)

    const request: RunRequest = { cmdId, commandId: command.id, resolvedArgs: finalArgs }

    // 记录元信息（供 App.tsx 在 ADB_DONE 时构造 HistoryEntry）
    useCommandStore.getState().recordPendingMeta(cmdId, command.id, finalArgs, command.label)

    updateExecutionState(cmdId, {
      cmdId,
      commandId: command.id,
      status: 'running',
      startTime: Date.now(),
    })

    // Bug 7 fix: 立即关闭弹窗，不等命令完成（流式命令如 logcat 会一直运行）
    closeParamDialog()

    try {
      await window.electronAPI.runCommand(request)
    } catch (err: any) {
      console.error('执行失败:', err)
    }
  }

  // 收藏模式下保存收藏
  const handleSaveFavorite = async () => {
    if (!command) return

    const newErrors: Record<string, string> = {}
    for (const p of command.params) {
      if (p.required && !values[p.key]?.trim()) {
        newErrors[p.key] = '此字段必填'
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    await useFavoriteStore.getState().addFavorite({
      commandId: command.id,
      commandLabel: command.label,
      nickname: command.label,
      resolvedArgs: { ...values },
      hasParams: command.params.length > 0,
    })

    closeParamDialog()
  }

  // Escape 键关闭
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeParamDialog()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, closeParamDialog])

  if (!isOpen || !command) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      {/* Modal */}
      <div className="dialog-content max-h-[80vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-divider flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {isFavoriteMode ? `收藏：${command.label}` : command.label}
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              {isFavoriteMode ? '填写参数以创建收藏快捷方式' : command.description}
            </p>
          </div>
          <button className="btn-ghost p-1 rounded-md" onClick={closeParamDialog} title="关闭">
            <X size={18} />
          </button>
        </div>

        {/* 参数区域（可滚动） */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {command.params.map(p => (
            <ParamField
              key={p.key}
              param={p}
              value={values[p.key] || ''}
              error={errors[p.key]}
              onChange={handleChange}
              onFillRequest={p.fillable ? (key) => {
                useCommandStore.getState().openFillPicker(key, p, (selectedValue) => {
                  setValues(prev => ({ ...prev, [key]: selectedValue }))
                })
              } : undefined}
            />
          ))}

          {/* 预览命令 */}
          <div className="pt-2">
            <div className="text-xs text-text-secondary mb-1.5">预览命令</div>
            <div className="bg-slate-900 rounded p-3 font-mono text-sm text-text-primary overflow-x-auto whitespace-pre-wrap break-all">
              {previewCommand.split(/(\{[^}]+\})/).map((part, i) => {
                if (part.match(/^\{[^}]+\}$/)) {
                  return <span key={i} className="text-red-400">{part}</span>
                }
                return <span key={i}>{part}</span>
              })}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-divider flex-shrink-0">
          <button className="btn btn-secondary" onClick={closeParamDialog}>
            取消
          </button>
          {!isFavoriteMode && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                useCommandStore.getState().openCommandEditorFromParam(command, values)
              }}
              title="将当前参数值保存为新命令"
            >
              <BookmarkPlus size={14} />
              另存为命令
            </button>
          )}
          {isFavoriteMode ? (
            <button className="btn btn-primary" onClick={handleSaveFavorite}>
              <BookmarkPlus size={14} />
              保存为收藏
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleExecute}>
              执行
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

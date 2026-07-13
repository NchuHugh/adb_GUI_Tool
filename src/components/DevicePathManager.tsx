import { useEffect, useState } from 'react'
import { useDevicePathStore } from '../store/devicePathStore'
import { X, Plus, Trash2, Pencil } from 'lucide-react'

interface Props {
  onClose: () => void
}

interface EditState {
  id: string
  label: string
  path: string
}

const NO_SPELL = {
  spellCheck: false,
  autoCorrect: 'off' as const,
  autoCapitalize: 'off' as const,
  autoComplete: 'off' as const,
}

export default function DevicePathManager({ onClose }: Props) {
  const customPaths = useDevicePathStore(s => s.customPaths)
  const addCustomPath = useDevicePathStore(s => s.addCustomPath)
  const removeCustomPath = useDevicePathStore(s => s.removeCustomPath)
  const updateCustomPath = useDevicePathStore(s => s.updateCustomPath)

  const [showAddForm, setShowAddForm] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newPath, setNewPath] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleAdd = async () => {
    setFormError(null)
    const result = await addCustomPath(newLabel, newPath)
    if (result.success) {
      setNewLabel('')
      setNewPath('')
      setShowAddForm(false)
    } else {
      setFormError(result.error || '添加失败')
    }
  }

  const handleStartEdit = (id: string, label: string, path: string) => {
    setEditing({ id, label, path })
    setEditError(null)
  }

  const handleConfirmEdit = async () => {
    if (!editing) return
    setEditError(null)
    const result = await updateCustomPath(editing.id, editing.label, editing.path)
    if (result.success) {
      setEditing(null)
    } else {
      setEditError(result.error || '更新失败')
    }
  }

  const handleDelete = async (id: string) => {
    await removeCustomPath(id)
    if (editing?.id === id) setEditing(null)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="dialog-content max-h-[80vh] w-[560px] max-w-[95vw] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-divider flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">管理常用设备路径</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              自定义路径保存到用户配置目录，重启后仍可用
            </p>
          </div>
          <button className="btn-ghost p-1 rounded-md" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">我的自定义路径（{customPaths.length}）</span>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-primary hover:text-blue-400 transition-colors"
              onClick={() => {
                setShowAddForm(prev => !prev)
                setFormError(null)
              }}
            >
              <Plus size={14} /> 添加路径
            </button>
          </div>

          {/* 内联新增表单 */}
          {showAddForm && (
            <div className="bg-slate-900 rounded-lg p-3 border border-divider space-y-2">
              <input
                type="text"
                className="input-field w-full text-sm"
                placeholder="标签（如：我的应用目录）"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                {...NO_SPELL}
              />
              <input
                type="text"
                className="input-field w-full text-sm font-mono"
                placeholder="路径（必须以 / 开头，如 /data/custom/）"
                value={newPath}
                onChange={e => setNewPath(e.target.value)}
                {...NO_SPELL}
              />
              {formError && (
                <div className="text-xs text-red-400">{formError}</div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  className="btn btn-secondary text-xs"
                  onClick={() => {
                    setShowAddForm(false)
                    setNewLabel('')
                    setNewPath('')
                    setFormError(null)
                  }}
                >
                  取消
                </button>
                <button className="btn btn-primary text-xs" onClick={handleAdd}>
                  确认添加
                </button>
              </div>
            </div>
          )}

          {/* 自定义路径列表 */}
          {customPaths.length === 0 && !showAddForm ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              暂无自定义路径，点击右上角「添加路径」开始创建
            </p>
          ) : (
            customPaths.map(p => (
              <div
                key={p.id}
                className="bg-slate-900 rounded-lg p-3 border border-divider"
              >
                {editing?.id === p.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      className="input-field w-full text-sm"
                      placeholder="标签"
                      value={editing.label}
                      onChange={e => setEditing({ ...editing, label: e.target.value })}
                      {...NO_SPELL}
                    />
                    <input
                      type="text"
                      className="input-field w-full text-sm font-mono"
                      placeholder="路径"
                      value={editing.path}
                      onChange={e => setEditing({ ...editing, path: e.target.value })}
                      {...NO_SPELL}
                    />
                    {editError && <div className="text-xs text-red-400">{editError}</div>}
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="btn btn-secondary text-xs"
                        onClick={() => {
                          setEditing(null)
                          setEditError(null)
                        }}
                      >
                        取消
                      </button>
                      <button className="btn btn-primary text-xs" onClick={handleConfirmEdit}>
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-text-primary truncate">{p.label}</div>
                      <div className="text-xs text-slate-500 font-mono truncate">{p.path}</div>
                    </div>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-200 transition-colors flex-shrink-0"
                      onClick={() => handleStartEdit(p.id, p.label, p.path)}
                      title="编辑"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="text-red-400 hover:text-red-300 transition-colors flex-shrink-0"
                      onClick={() => handleDelete(p.id)}
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-divider flex-shrink-0">
          <button className="btn btn-secondary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  )
}

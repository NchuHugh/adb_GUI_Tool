import { useState, useMemo, useEffect } from 'react'
import { useCommandStore } from '../store/commandStore'
import { CommandDef, CommandParam, OutputMode, ParamType } from '../types'
import { X, Plus, Trash2 } from 'lucide-react'
import { commandDefToFormData, EMPTY_FORM_DATA, formDataToCommandDef } from '../utils/commandEditorUtils'

const PARAM_TYPES: { value: ParamType; label: string }[] = [
  { value: 'text', label: '文本 (text)' },
  { value: 'file', label: '文件选择 (file)' },
  { value: 'directory', label: '目录选择 (directory)' },
  { value: 'select', label: '下拉菜单 (select)' },
]

const OUTPUT_MODES: { value: OutputMode; label: string }[] = [
  { value: 'stream', label: '实时流 (stream)' },
  { value: 'once', label: '一次性 (once)' },
]

const NO_SPELL = {
  spellCheck: false,
  autoCorrect: 'off' as const,
  autoCapitalize: 'off' as const,
  autoComplete: 'off' as const,
}

function emptyParam(): CommandParam {
  return { key: '', label: '', type: 'text', required: false, default: '' }
}

export default function CommandEditor() {
  const isOpen = useCommandStore(s => s.commandEditorOpen)
  const editingCommand = useCommandStore(s => s.editingCommand)
  const prefilledTemplate = useCommandStore(s => s.prefilledTemplate)
  const close = useCommandStore(s => s.closeCommandEditor)
  const groups = useCommandStore(s => s.groups)
  const commands = useCommandStore(s => s.commands)
  const setConfig = useCommandStore(s => s.setConfig)

  const isEditMode = !!editingCommand

  // 表单状态
  const [id, setId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState('adb ')
  const [params, setParams] = useState<CommandParam[]>([])
  const [outputMode, setOutputMode] = useState<OutputMode>('once')
  const [timeout, setTimeout_] = useState(10000)
  const [tags, setTags] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // 打开弹窗时初始化表单（三分支：编辑 / 预填模板 / 新建）
  useEffect(() => {
    if (!isOpen) return

    let formData
    if (editingCommand) {
      // F1：编辑已有自定义命令
      formData = commandDefToFormData(editingCommand)
    } else if (prefilledTemplate) {
      // F2：从 ParamDialog 另存为自定义命令
      formData = commandDefToFormData(prefilledTemplate)
    } else {
      // 新建模式
      formData = { ...EMPTY_FORM_DATA, groupId: groups.length > 0 ? groups[0].id : '' }
    }

    setId(formData.id)
    setGroupId(formData.groupId)
    setLabel(formData.label)
    setDescription(formData.description)
    setTemplate(formData.template)
    setParams(formData.params)
    setOutputMode(formData.outputMode)
    setTimeout_(formData.timeout)
    setTags(formData.tags)
    setError(null)
    setSuccessMsg(null)
  }, [isOpen, editingCommand, prefilledTemplate, groups])

  if (!isOpen) return null

  // 弹窗标题
  const title = editingCommand
    ? `编辑命令：${editingCommand.label}`
    : prefilledTemplate
      ? `从「${prefilledTemplate.label.replace('（副本）', '')}」创建自定义命令`
      : '新增命令'

  // 添加参数
  const addParam = () => {
    setParams(prev => [...prev, emptyParam()])
  }

  // 移除参数
  const removeParam = (idx: number) => {
    setParams(prev => prev.filter((_, i) => i !== idx))
  }

  // 更新参数
  const updateParam = (idx: number, field: Partial<CommandParam>) => {
    setParams(prev => prev.map((p, i) => (i === idx ? { ...p, ...field } : p)))
  }

  // 校验
  const validate = (): string | null => {
    if (!id.trim()) return '命令 ID 不能为空'
    if (!/^[a-z][a-z0-9_]*$/.test(id.trim())) return '命令 ID 只能包含小写字母、数字、下划线，且必须以字母开头'
    // 编辑模式下排除自身
    if (commands.some(c => c.id === id.trim() && c.id !== editingCommand?.id)) {
      return `命令 ID "${id.trim()}" 已存在`
    }
    if (!groupId) return '请选择所属分组'
    if (!label.trim()) return '命令名称不能为空'
    if (!template.trim()) return '命令模板不能为空'

    for (const p of params) {
      if (!p.key.trim()) return '所有参数必须填写 key'
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(p.key.trim())) return `参数 key "${p.key}" 格式不正确`
      if (!template.includes(`{${p.key}}`)) return `参数 "{${p.key}}" 未在模板中使用`
    }

    // 检查模板中的占位符是否都有对应参数
    const placeholders = template.match(/\{(\w+)\}/g) || []
    for (const ph of placeholders) {
      const key = ph.slice(1, -1)
      if (!params.some(p => p.key === key)) {
        return `模板中的 "{${key}}" 缺少对应参数定义`
      }
    }

    return null
  }

  // 提交保存
  const handleSave = async () => {
    setError(null)
    setSuccessMsg(null)

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)

    // 编辑模式下保留自定义标记
    const commandDef = formDataToCommandDef(
      { id, groupId, label, description, template, params, outputMode, timeout, tags },
      true
    )

    try {
      let result
      if (isEditMode) {
        result = await window.electronAPI.updateCommand(commandDef)
      } else {
        result = await window.electronAPI.addCommand(commandDef)
      }

      if (result.success && result.config) {
        setConfig(result.config)
        setSuccessMsg(isEditMode ? `命令「${label}」已更新` : `命令「${label}」已保存`)
        setTimeout(() => {
          close()
        }, 800)
      } else {
        setError(result.error || (isEditMode ? '更新失败' : '保存失败'))
      }
    } catch (err: any) {
      setError(err.message || (isEditMode ? '更新失败' : '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  // 关闭
  const handleClose = () => {
    close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="dialog-content max-h-[85vh] w-[640px] max-w-[95vw] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-divider flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              {isEditMode ? '修改后将覆盖原有配置' : '自定义 adb 命令将保存到用户配置目录'}
            </p>
          </div>
          <button className="btn-ghost p-1 rounded-md" onClick={handleClose} title="关闭">
            <X size={18} />
          </button>
        </div>

        {/* 表单区域（可滚动） */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-secondary mb-1">命令 ID *</label>
              <input
                type="text"
                className={`input-field w-full text-sm ${isEditMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                placeholder="如 adb_custom_cmd"
                value={id}
                onChange={e => setId(e.target.value)}
                disabled={isEditMode}
                {...NO_SPELL}
              />
              {isEditMode ? (
                <p className="text-xs text-slate-500 mt-0.5">命令 ID 不可修改</p>
              ) : (
                <p className="text-xs text-slate-500 mt-0.5">小写字母+数字+下划线，全局唯一</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">所属分组 *</label>
              <select
                className="input-field w-full text-sm"
                value={groupId}
                onChange={e => setGroupId(e.target.value)}
              >
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">命令名称 *</label>
            <input
              type="text"
              className="input-field w-full text-sm"
              placeholder="如：我的自定义命令"
              value={label}
              onChange={e => setLabel(e.target.value)}
              {...NO_SPELL}
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">命令描述</label>
            <input
              type="text"
              className="input-field w-full text-sm"
              placeholder="简要描述该命令的功能"
              value={description}
              onChange={e => setDescription(e.target.value)}
              {...NO_SPELL}
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">命令模板 *</label>
            <input
              type="text"
              className="input-field w-full text-sm font-mono"
              placeholder="adb shell {cmd}"
              value={template}
              onChange={e => setTemplate(e.target.value)}
              {...NO_SPELL}
            />
            <p className="text-xs text-slate-500 mt-0.5">使用 {'{key}'} 作为参数占位符</p>
          </div>

          {/* 输出模式 + 超时 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-secondary mb-1">输出模式</label>
              <select
                className="input-field w-full text-sm"
                value={outputMode}
                onChange={e => setOutputMode(e.target.value as OutputMode)}
              >
                {OUTPUT_MODES.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">超时 (ms)</label>
              <input
                type="number"
                className="input-field w-full text-sm"
                value={timeout}
                onChange={e => setTimeout_(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-slate-500 mt-0.5">0 = 不超时（用于流式命令）</p>
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">标签</label>
            <input
              type="text"
              className="input-field w-full text-sm"
              placeholder="如：custom, debug（逗号分隔）"
              value={tags}
              onChange={e => setTags(e.target.value)}
              {...NO_SPELL}
            />
          </div>

          {/* 参数定义 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-text-secondary">命令参数</label>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-primary hover:text-blue-400 transition-colors"
                onClick={addParam}
              >
                <Plus size={14} /> 添加参数
              </button>
            </div>

            {params.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">无参数（直接执行的命令）</p>
            ) : (
              <div className="space-y-3">
                {params.map((p, i) => (
                  <div key={i} className="bg-slate-900 rounded-lg p-3 border border-divider">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-text-secondary font-medium">参数 #{i + 1}</span>
                      <button
                        type="button"
                        className="text-red-400 hover:text-red-300 transition-colors"
                        onClick={() => removeParam(i)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        className="input-field text-sm"
                        placeholder="key（如：package）"
                        value={p.key}
                        onChange={e => updateParam(i, { key: e.target.value })}
                        {...NO_SPELL}
                      />
                      <select
                        className="input-field text-sm"
                        value={p.type}
                        onChange={e => updateParam(i, { type: e.target.value as ParamType })}
                      >
                        {PARAM_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        className="input-field text-sm"
                        placeholder="显示标签"
                        value={p.label}
                        onChange={e => updateParam(i, { label: e.target.value })}
                        {...NO_SPELL}
                      />
                      <input
                        type="text"
                        className="input-field text-sm"
                        placeholder="默认值"
                        value={p.default}
                        onChange={e => updateParam(i, { default: e.target.value })}
                        {...NO_SPELL}
                      />
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <label className="flex items-center gap-1 text-xs text-text-secondary">
                        <input
                          type="checkbox"
                          checked={p.required}
                          onChange={e => updateParam(i, { required: e.target.checked })}
                          className="rounded"
                        />
                        必填
                      </label>
                      <label className="flex items-center gap-1 text-xs text-text-secondary">
                        <input
                          type="checkbox"
                          checked={p.fillable || false}
                          onChange={e => updateParam(i, { fillable: e.target.checked })}
                          className="rounded"
                        />
                        可填入
                      </label>
                      {p.fillable && (
                        <input
                          type="text"
                          className="input-field text-xs w-40"
                          placeholder="fillSourceCommandId"
                          value={p.fillSourceCommandId || ''}
                          onChange={e => updateParam(i, { fillSourceCommandId: e.target.value })}
                          {...NO_SPELL}
                        />
                      )}
                    </div>
                    {p.type === 'select' && (
                      <input
                        type="text"
                        className="input-field text-sm mt-2 w-full"
                        placeholder="选项列表（逗号分隔）：option1, option2, option3"
                        value={p.options?.join(', ') || ''}
                        onChange={e => updateParam(i, {
                          options: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                        })}
                        {...NO_SPELL}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 命令预览 */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">命令预览</label>
            <pre className="bg-slate-900 rounded-lg p-3 text-sm font-mono text-text-primary overflow-x-auto whitespace-pre-wrap">
              {template}
            </pre>
            <p className="text-xs text-slate-500 mt-0.5">
              参数: {params.length} 个 · 超时: {timeout === 0 ? '不超时' : `${timeout}ms`} · 输出: {outputMode}
            </p>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* 成功提示 */}
          {successMsg && (
            <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-3 text-sm text-green-400">
              ✓ {successMsg}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-divider flex-shrink-0">
          <button className="btn btn-secondary" onClick={handleClose}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中...' : isEditMode ? '保存修改' : '保存命令'}
          </button>
        </div>
      </div>
    </div>
  )
}

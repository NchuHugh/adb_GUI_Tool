import { useState } from 'react'
import * as Icons from 'lucide-react'
import { Folder, FolderCog, Pencil, Trash2, X } from 'lucide-react'
import { useCommandStore } from '../store/commandStore'
import { CommandGroup } from '../types'

const ICONS = ['Folder', 'Smartphone', 'Terminal', 'Settings', 'Bug', 'Star', 'Database', 'Shield']

export default function GroupManager() {
  const groups = useCommandStore(s => s.groups)
  const commands = useCommandStore(s => s.commands)
  const setConfig = useCommandStore(s => s.setConfig)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CommandGroup | null>(null)
  const [label, setLabel] = useState('')
  const [icon, setIcon] = useState('Folder')
  const [id, setId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const customGroups = groups.filter(group => group.custom)
  const start = (group?: CommandGroup) => { setEditing(group ?? null); setId(group?.id ?? ''); setLabel(group?.label ?? ''); setIcon(group?.icon ?? 'Folder'); setError(null); setOpen(true) }
  const save = async () => {
    setError(null)
    const nextLabel = label.trim()
    const nextId = id.trim()
    if (!nextLabel) { setError('分组名称不能为空：请填写用户看到的显示名称。'); return }
    if (!editing && !nextId) { setError('分组 ID 不能为空：它是配置中引用分组的唯一标识，例如 my-tools。'); return }
    if (!editing && !/^[a-z][a-z0-9_-]*$/.test(nextId)) {
      setError('分组 ID 无效：必须以小写字母开头，只能包含小写字母、数字、下划线和短横线，例如 my-tools。')
      return
    }
    const duplicate = !editing && groups.find(group => group.id === nextId)
    if (duplicate) {
      setError(`分组 ID「${nextId}」已被${duplicate.custom ? '自定义' : '系统'}分组「${duplicate.label}」占用：请换一个未使用的 ID。`)
      return
    }
    const result = editing
      ? await window.electronAPI.updateCommandGroup({ ...editing, label: nextLabel, icon })
      : await window.electronAPI.createCommandGroup({ id: nextId, label: nextLabel, icon })
    if (!result.success || !result.config) { setError(result.error || '保存失败'); return }
    setConfig(result.config); setOpen(false)
  }
  const remove = async (group: CommandGroup) => {
    const count = commands.filter(command => command.groupId === group.id && command.custom).length
    if (!window.confirm(`确认删除分组「${group.label}」？\n\n将同时删除该分组中的 ${count} 个自定义命令。`)) return
    const result = await window.electronAPI.deleteCommandGroup(group.id)
    if (!result.success || !result.config) window.alert(result.error || '删除失败'); else setConfig(result.config)
  }
  return <>
    <button className="sidebar-group-item mx-2 w-full" onClick={() => start()}>
      <FolderCog size={18} />
      <span>管理分组</span>
    </button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,.6)' }}>
      <div className="dialog-content w-[520px] max-w-[95vw] p-5">
        <div className="flex justify-between items-center mb-4"><h2 className="text-lg">管理命令分组</h2><button onClick={() => setOpen(false)} title="关闭"><X size={18} /></button></div>
        <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">{customGroups.length === 0 ? <p className="text-sm text-slate-500 py-2">暂无自定义分组</p> : customGroups.map(group => { const Icon = (Icons as any)[group.icon] || Folder; return <div key={group.id} className="flex items-center gap-2 p-2 bg-slate-800 rounded"><Icon size={16} /><span className="flex-1">{group.label}</span><span className="text-xs text-slate-500">{group.id}</span><button onClick={() => start(group)} title="编辑"><Pencil size={14} /></button><button onClick={() => remove(group)} title="删除"><Trash2 size={14} /></button></div> })}</div>
        <div className="border-t border-divider pt-4 space-y-3"><input className="input-field w-full" placeholder="分组 ID（新增时填写）" value={id} disabled={!!editing} onChange={e => setId(e.target.value)} /><input className="input-field w-full" placeholder="分组名称" value={label} onChange={e => setLabel(e.target.value)} /><div><p className="text-xs text-text-secondary mb-2">选择图标</p><div className="grid grid-cols-8 gap-2">{ICONS.map(item => { const Icon = (Icons as any)[item] || Folder; return <button key={item} type="button" title={`选择 ${item} 图标`} aria-label={`选择 ${item} 图标`} className={`p-2 rounded border ${icon === item ? 'border-primary bg-primary/20 text-primary' : 'border-divider text-slate-400 hover:text-white hover:bg-slate-700'}`} onClick={() => setIcon(item)}><Icon size={18} className="mx-auto" /></button> })}</div></div>{error && <p className="text-sm text-red-400">{error}</p>}<div className="flex justify-end gap-2"><button className="btn btn-secondary" onClick={() => setOpen(false)}>关闭</button><button className="btn btn-primary" onClick={save}>{editing ? '保存修改' : '新增分组'}</button></div></div>
      </div>
    </div>}
  </>
}

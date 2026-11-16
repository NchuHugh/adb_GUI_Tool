import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUp, Download, File, Folder, FolderPlus, Link2, Pencil, RefreshCw, Terminal, Trash2, Upload } from 'lucide-react'
import { useDeviceStore } from '../store/deviceStore'
import type { DeviceDirectory, DeviceFileAction } from '../types'
import LogResizeHandle from './log/LogResizeHandle'

type Feedback = {
  id: number
  label: string
  state: '进行中' | '成功' | '失败' | '已取消'
  detail?: string
  stdout?: string
  stderr?: string
}

function limitOutput(text: string) {
  const limit = 65_536
  return text.length <= limit ? text : text.slice(0, limit) + '\n[输出已截断]'
}

function describeFileAction(action: DeviceFileAction) {
  if (action.type === 'upload') return `上传文件到 ${action.directory}`
  const path = `${action.directory.replace(/\/$/, '')}/${action.name}`
  switch (action.type) {
    case 'download': return `下载 ${path}`
    case 'delete': return `删除 ${path}`
    case 'mkdir': return `新建目录 ${path}`
    case 'rename': return `重命名 ${path} → ${action.newName}`
  }
}

function DeviceShellSession({ serial, visible }: { serial: string; visible: boolean }) {
  const [directory, setDirectory] = useState<DeviceDirectory>()
  const [address, setAddress] = useState('')
  const [selected, setSelected] = useState<string>()
  const [nameEditor, setNameEditor] = useState<{ type: 'mkdir' | 'rename'; value: string }>()
  const [script, setScript] = useState('')
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [outputHeight, setOutputHeight] = useState(144)
  const [busy, setBusy] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const outputRef = useRef<HTMLDivElement>(null)
  const followOutput = useRef(true)
  const nextFeedbackId = useRef(0)
  const busyRef = useRef(false)

  function addFeedback(label: string, state: Feedback['state']) {
    const id = ++nextFeedbackId.current
    setFeedback(items => [...items.slice(-99), { id, label, state }])
    return id
  }

  async function report(
    label: string,
    action: () => Promise<Pick<Feedback, 'state' | 'detail' | 'stdout' | 'stderr'>>,
  ) {
    const id = addFeedback(label, '进行中')
    let result: Pick<Feedback, 'state' | 'detail' | 'stdout' | 'stderr'>
    try {
      result = await action()
    } catch (err) {
      const detail = err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(err)
      result = { state: '失败', detail }
    }
    setFeedback(items => items.map(item => item.id === id ? { ...item, ...result } : item))
  }

  async function perform(action: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await action()
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function readDirectory(path?: string) {
    const next = await window.electronAPI.listDeviceDirectory(serial, path)
    next.entries.sort((a, b) =>
      Number(b.kind === 'directory') - Number(a.kind === 'directory') || a.name.localeCompare(b.name, undefined, { numeric: true }))
    setDirectory(next)
    setAddress(next.path)
    setSelected(undefined)
    setNameEditor(undefined)
    return next
  }

  function reportDirectory(label: string, path?: string) {
    return report(label, async () => {
      const next = await readDirectory(path)
      return { state: '成功', detail: `${next.path} · ${next.entries.length} 项` }
    })
  }

  useLayoutEffect(() => {
    const output = outputRef.current
    if (visible && output && followOutput.current) output.scrollTop = output.scrollHeight
  }, [feedback, outputHeight, visible])

  useEffect(() => {
    void perform(() => reportDirectory('读取设备当前目录'))
  }, [serial])

  const openDirectory = (path: string) => void perform(() => reportDirectory(`打开目录 ${path}`, path))
  const cwd = directory?.path
  const entry = directory?.entries.find(item => item.name === selected)
  const itemPath = (name: string) => (cwd === '/' ? '' : cwd) + '/' + name

  function manage(action: DeviceFileAction) {
    void perform(async () => {
      let changed = false
      await report(describeFileAction(action), async () => {
        changed = await window.electronAPI.manageDeviceFile(serial, action)
        return { state: changed ? '成功' : '已取消' }
      })
      if (changed && action.type !== 'download') {
        setNameEditor(undefined)
        await reportDirectory('刷新目录', action.directory)
      }
    })
  }

  function submitName(event: FormEvent) {
    event.preventDefault()
    if (!cwd || !nameEditor || !nameEditor.value) return
    if (nameEditor.type === 'mkdir') manage({ type: 'mkdir', directory: cwd, name: nameEditor.value })
    else if (entry) manage({ type: 'rename', directory: cwd, name: entry.name, newName: nameEditor.value })
  }

  function runShell(event: FormEvent) {
    event.preventDefault()
    if (!cwd || !script.trim()) return
    void perform(async () => {
      let nextPath: string | undefined
      await report(`$ ${script}`, async () => {
        const output = await window.electronAPI.runDeviceShell(serial, cwd, script)
        nextPath = output.path
        return {
          state: output.exitCode === 0 ? '成功' : '失败',
          detail: `退出码 ${output.exitCode}`,
          stdout: limitOutput(output.stdout),
          stderr: limitOutput(output.stderr),
        }
      })
      if (!nextPath) return
      if (nextPath !== cwd) {
        setDirectory({ path: nextPath, entries: [] })
        setAddress(nextPath)
        setSelected(undefined)
        setNameEditor(undefined)
      }
      await reportDirectory('刷新目录', nextPath)
    })
  }

  return (
    <section ref={sectionRef} aria-label="设备 Shell" className="flex h-full min-h-0 flex-col bg-app-bg">
      <div className="border-b border-divider px-4 py-3">
        <h1 className="flex items-center gap-2 font-semibold text-text-primary">
          <Terminal size={18} /> 设备 Shell
        </h1>
        <form onSubmit={event => { event.preventDefault(); openDirectory(address) }} className="mt-3 flex items-center gap-2">
          <button type="button" className="btn btn-secondary px-2" aria-label="上一级" title="上一级"
            disabled={busy || !cwd || cwd === '/'}
            onClick={() => openDirectory(cwd?.slice(0, cwd.lastIndexOf('/')) || '/')}>
            <ArrowUp size={16} />
          </button>
          <button type="button" className="btn btn-secondary px-2" aria-label="刷新目录" title="刷新目录"
            disabled={busy} onClick={() => void perform(() => reportDirectory('刷新目录', cwd))}>
            <RefreshCw size={16} />
          </button>
          <input aria-label="设备目录" className="input-field min-w-0 flex-1 font-mono" spellCheck={false} disabled={busy}
            value={address} placeholder="/sdcard" onChange={event => setAddress(event.currentTarget.value)} />
          <button className="btn btn-secondary" disabled={busy || !address}>前往</button>
        </form>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button className="btn btn-ghost h-8 px-2 text-xs" disabled={busy || !cwd}
            onClick={() => setNameEditor({ type: 'mkdir', value: '' })}><FolderPlus size={15} />新建目录</button>
          <button className="btn btn-ghost h-8 px-2 text-xs" disabled={busy || !cwd}
            onClick={() => cwd && manage({ type: 'upload', directory: cwd })}><Upload size={15} />上传文件</button>
          <button className="btn btn-ghost h-8 px-2 text-xs" disabled={busy || !cwd || !entry || entry.kind === 'link'}
            onClick={() => cwd && entry && manage({ type: 'download', directory: cwd, name: entry.name })}><Download size={15} />下载</button>
          <button className="btn btn-ghost h-8 px-2 text-xs" disabled={busy || !entry}
            onClick={() => entry && setNameEditor({ type: 'rename', value: entry.name })}><Pencil size={15} />重命名</button>
          <button className="btn btn-ghost h-8 px-2 text-xs" disabled={busy || !cwd || !entry}
            onClick={() => {
              if (!cwd || !entry) return
              const action = { type: 'delete' as const, directory: cwd, name: entry.name }
              if (window.confirm(`删除设备上的「${itemPath(entry.name)}」？目录必须为空。`)) manage(action)
              else addFeedback(describeFileAction(action), '已取消')
            }}><Trash2 size={15} />删除</button>
          <span role="status" className="ml-auto text-xs text-text-secondary">{busy ? '正在处理…' : directory ? `${directory.entries.length} 项` : ''}</span>
        </div>
        {nameEditor && (
          <form onSubmit={submitName} className="mt-2 flex items-center gap-2">
            <input autoFocus className="input-field min-w-0 flex-1" disabled={busy} aria-label={nameEditor.type === 'mkdir' ? '目录名称' : '新名称'}
              value={nameEditor.value} onChange={event => setNameEditor({ ...nameEditor, value: event.currentTarget.value })} />
            <button className="btn btn-primary" disabled={busy || !nameEditor.value}>确定</button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => {
              addFeedback(nameEditor.type === 'mkdir' ? '新建目录' : '重命名', '已取消')
              setNameEditor(undefined)
            }}>取消</button>
          </form>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
        {directory && directory.entries.length === 0 && !busy && <p className="py-3 text-sm text-text-secondary">目录为空</p>}
        <ul aria-label="设备文件" className="space-y-0.5">
          {directory?.entries.map(item => {
            const ItemIcon = item.kind === 'directory' ? Folder : item.kind === 'link' ? Link2 : File
            const canOpen = item.kind !== 'file'
            return (
              <li key={item.name}>
                <button type="button" aria-pressed={selected === item.name}
                  className={`flex w-full items-center gap-3 rounded px-2 py-1.5 text-left text-sm ${selected === item.name ? 'bg-primary/15 text-primary' : 'text-text-primary hover:bg-card-hover'}`}
                  onClick={() => { setSelected(item.name); setNameEditor(undefined) }}
                  onDoubleClick={() => { if (canOpen) openDirectory(itemPath(item.name)) }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && canOpen) { event.preventDefault(); openDirectory(itemPath(item.name)) }
                  }}>
                  <ItemIcon size={16} className="shrink-0 text-text-secondary" />
                  <span className="min-w-0 flex-1 truncate" title={item.name}>{item.name}</span>
                  <span className="text-xs text-text-secondary">{item.kind === 'directory' ? '目录' : item.kind === 'link' ? '链接' : '文件'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <LogResizeHandle label="调整操作记录高度" onResize={delta => {
        const maxHeight = Math.max(64, (sectionRef.current?.clientHeight ?? 480) * 0.55)
        setOutputHeight(height => Math.max(64, Math.min(maxHeight, height + delta)))
      }} />
      <div className="shrink-0 border-t border-divider bg-sidebar-bg px-4 pb-3 pt-2">
        <div
          ref={outputRef}
          role="log"
          aria-label="设备 Shell 操作记录"
          tabIndex={0}
          className="mb-2 space-y-2 overflow-auto rounded bg-slate-950 px-2 py-1.5 text-xs"
          style={{ height: outputHeight, maxHeight: 'max(64px, calc((100dvh - 48px) * 0.55))' }}
          onScroll={event => {
            const element = event.currentTarget
            if (!visible || element.clientHeight === 0) return
            followOutput.current = element.scrollHeight - element.clientHeight - element.scrollTop <= 8
          }}
        >
          {feedback.map(item => (
            <div key={item.id} className="break-words">
              <p className="whitespace-pre-wrap font-mono text-text-secondary">
                <span className={item.state === '失败' ? 'text-error' : item.state === '成功' ? 'text-success' : ''}>
                  [{item.state}]
                </span>{' '}{item.label}{item.detail && ` · ${item.detail}`}
              </p>
              {item.stdout && <pre className="whitespace-pre-wrap break-words">{item.stdout}</pre>}
              {item.stderr && <pre className="whitespace-pre-wrap break-words text-error">{item.stderr}</pre>}
            </div>
          ))}
        </div>
        <form onSubmit={runShell} className="flex items-center gap-2">
          <Terminal size={16} className="shrink-0 text-text-secondary" />
          <input aria-label="Shell 命令" className="input-field min-w-0 flex-1 font-mono" spellCheck={false}
            placeholder="在当前目录运行，例如 pwd 或 cd /sdcard" value={script}
            onChange={event => setScript(event.currentTarget.value)} />
          <button className="btn btn-primary" disabled={busy || !cwd || !script.trim()}>执行</button>
        </form>
      </div>
    </section>
  )
}

export default function DeviceShell({ visible }: { visible: boolean }) {
  const serial = useDeviceStore(state =>
    state.devices.find(device => device.serial === state.selectedSerial && device.state === 'device')?.serial)
  return serial ? <DeviceShellSession key={serial} serial={serial} visible={visible} /> : (
    <section className="flex h-full flex-col items-center justify-center gap-2 text-text-secondary">
      <Terminal size={24} />
      <h1 className="font-semibold text-text-primary">设备 Shell</h1>
      <p className="text-sm">请连接设备、允许 USB 调试，并在顶部选择设备。</p>
    </section>
  )
}

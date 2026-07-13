import { useEffect, useState, useMemo } from 'react'
import { useCommandStore } from '../store/commandStore'
import { useLogStore } from '../store/logStore'
import { useDevicePathStore } from '../store/devicePathStore'
import { processOutput } from '../utils/outputProcessor'
import { X, Loader2, Star, Search, FolderOpen, ChevronLeft, Plus } from 'lucide-react'
import { CommandDef, HistoryEntry } from '../types'
import DevicePathManager from './DevicePathManager'

interface SourceItem {
  type: 'recommended' | 'history'
  commandId: string
  label: string
  cached: boolean
}

function buildSourceList(
  param: { fillSourceCommandId?: string } | null,
  history: HistoryEntry[],
  commands: CommandDef[],
  outputCache: Map<string, string>,
): SourceItem[] {
  const items: SourceItem[] = []

  // 1. 推荐来源（param.fillSourceCommandId 指定的命令）
  if (param?.fillSourceCommandId) {
    const cmd = commands.find(c => c.id === param.fillSourceCommandId)
    if (cmd) {
      items.push({
        type: 'recommended',
        commandId: cmd.id,
        label: cmd.label,
        cached: outputCache.has(cmd.id),
      })
    }
  }

  // 2. 历史命令（过滤 fillable: false，且有 outputCache，且行数 ≤ 5 或 fillable: true）
  const seen = new Set(items.map(i => i.commandId))
  const historyItems = history
    .filter(entry => {
      const cmd = commands.find(c => c.id === entry.commandId)
      if (!cmd) return false
      if (cmd.fillable === false) return false
      if (!outputCache.has(entry.commandId)) return false
      const output = outputCache.get(entry.commandId) ?? ''
      const lineCount = output.split('\n').filter(l => l.trim()).length
      if (cmd.fillable !== true && lineCount > 5) return false
      return true
    })
    .slice(0, 5)
    .map(entry => ({
      type: 'history' as const,
      commandId: entry.commandId,
      label: entry.commandLabel,
      cached: true,
    }))

  for (const item of historyItems) {
    if (!seen.has(item.commandId)) {
      items.push(item)
      seen.add(item.commandId)
    }
  }

  return items
}

export default function FillPicker() {
  const fillPicker = useCommandStore(s => s.fillPicker)
  const closeFillPicker = useCommandStore(s => s.closeFillPicker)
  const setFillPickerOutput = useCommandStore(s => s.setFillPickerOutput)
  const setFillPickerLoading = useCommandStore(s => s.setFillPickerLoading)
  const setFillPickerFilter = useCommandStore(s => s.setFillPickerFilter)
  const history = useLogStore(s => s.history)
  const commands = useCommandStore(s => s.commands)
  const outputCache = useLogStore(s => s.outputCache)
  const getOutputCache = useLogStore(s => s.getOutputCache)

  // Phase 7 N3：设备路径相关
  const builtinGroups = useDevicePathStore(s => s.builtinGroups)
  const customPaths = useDevicePathStore(s => s.customPaths)

  const { isOpen, sourceCommandId, sourceCommandLabel, outputLines, isLoading, filterText } = fillPicker

  // Bug 4 fix: useState 必须在 early return 之前调用（React hooks 规则）
  // Phase 7 N3: view 状态 — 'source' = 来源选择；'paths' = 设备路径选择
  const [showSourceSelect, setShowSourceSelect] = useState(true)
  const [view, setView] = useState<'source' | 'paths'>('source')
  const [pathFilter, setPathFilter] = useState('')
  const [pathManagerOpen, setPathManagerOpen] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setShowSourceSelect(true)
      setView('source')
      setPathFilter('')
    }
  }, [isOpen])

  // Bug 4 fix: useMemo 必须在 early return 之前调用
  const filteredLines = useMemo(() => {
    if (!filterText.trim()) return outputLines
    const q = filterText.toLowerCase()
    return outputLines.filter(l => l.toLowerCase().includes(q))
  }, [outputLines, filterText])

  // Phase 7 N4：构建来源列表
  const sourceItems = useMemo(() => {
    // param 信息在 fillPicker 状态中没有完整保存，这里用 sourceCommandId 作为推荐来源
    const fakeParam = sourceCommandId ? { fillSourceCommandId: sourceCommandId } : null
    return buildSourceList(fakeParam, history, commands, outputCache)
  }, [sourceCommandId, history, commands, outputCache])

  // Phase 7 N3：过滤后的路径列表（内置 + 自定义）
  const filteredPathGroups = useMemo(() => {
    const q = pathFilter.trim().toLowerCase()
    const filterFn = (p: { label: string; path: string }) =>
      !q || p.label.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)
    return [
      ...builtinGroups.map(g => ({
        ...g,
        paths: g.paths.filter(filterFn),
      })).filter(g => g.paths.length > 0),
      ...(customPaths.filter(filterFn).length > 0
        ? [{ id: '__custom__', label: '我的自定义路径', paths: customPaths.filter(filterFn) }]
        : []),
    ]
  }, [builtinGroups, customPaths, pathFilter])

  // Bug 4 fix: 所有 hooks 调用完毕后才能 early return
  if (!isOpen) return null

  const handleSelectSource = async (cmdId: string, cmdLabel: string, useCache: boolean) => {
    // 先检查缓存
    const cached = getOutputCache(cmdId)
    if (useCache && cached) {
      try {
        const lines = processOutput(cmdId, cached)
        setFillPickerOutput(lines, cmdLabel)
        setShowSourceSelect(false)
      } catch {
        setFillPickerOutput([], cmdLabel)
      }
      return
    }

    // 后台执行
    setFillPickerLoading(true)
    setShowSourceSelect(false)

    try {
      const result = await window.electronAPI.runCommandSilent(cmdId)
      const lines = processOutput(cmdId, result.output)
      setFillPickerOutput(lines, cmdLabel)
    } catch (err: any) {
      setFillPickerOutput([`错误: ${err.message || '执行失败'}`], cmdLabel)
    }
  }

  const handleSelectLine = (line: string) => {
    closeFillPicker(line)
  }

  const handleSelectPath = (path: string) => {
    closeFillPicker(path)
  }

  // Stage 1: 选择来源（含常用设备路径入口）
  if (showSourceSelect && view === 'source') {
    return (
      <>
        <div
          className="fixed inset-0 z-[60]"
          onClick={() => closeFillPicker()}
        />
        <div className="fixed z-[70] bg-slate-800 border border-divider rounded-lg shadow-2xl overflow-hidden"
          style={{ width: 320, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-divider">
            <span className="text-sm font-semibold text-text-primary">选择数据来源</span>
            <button className="btn-ghost p-1 rounded" onClick={() => closeFillPicker()}>
              <X size={14} />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {/* Phase 7 N3：常用设备路径入口 */}
            <button
              className="w-full px-4 py-2.5 text-left hover:bg-slate-700 transition-colors flex items-center gap-2"
              onClick={() => setView('paths')}
            >
              <FolderOpen size={14} className="text-blue-400 flex-shrink-0" />
              <span className="text-sm text-text-primary">常用设备路径</span>
              <ChevronLeft size={14} className="text-text-secondary ml-auto rotate-180" />
            </button>
            <div className="mx-4 border-t border-divider" />

            {/* 推荐来源 + 历史来源（N4 过滤后） */}
            {sourceItems.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <div className="text-sm text-text-secondary mb-1">暂无可用来源</div>
                <div className="text-xs text-slate-500">
                  执行 pm list packages 等命令后<br />其结果将出现在此处
                </div>
              </div>
            ) : (
              <>
                {sourceItems.filter(i => i.type === 'recommended').map(item => (
                  <div key={`rec-${item.commandId}`}>
                    <div className="px-4 py-2 text-xs text-text-secondary">推荐</div>
                    <button
                      className="w-full px-4 py-2.5 text-left hover:bg-slate-700 transition-colors flex items-center gap-2"
                      onClick={() => handleSelectSource(item.commandId, item.label, true)}
                    >
                      <Star size={14} className="text-amber-500 flex-shrink-0" />
                      <span className="text-sm text-text-primary">{item.label}</span>
                      {getOutputCache(item.commandId) && (
                        <span className="text-xs text-success ml-auto">已缓存</span>
                      )}
                    </button>
                    <div className="mx-4 border-t border-divider" />
                  </div>
                ))}

                {sourceItems.filter(i => i.type === 'history').length > 0 && (
                  <>
                    <div className="px-4 py-2 text-xs text-text-secondary">最近执行</div>
                    {sourceItems.filter(i => i.type === 'history').map(item => {
                      const histEntry = history.find(h => h.commandId === item.commandId)
                      return (
                        <button
                          key={`hist-${item.commandId}`}
                          className="w-full px-4 py-2.5 text-left hover:bg-slate-700 transition-colors flex items-center gap-2"
                          onClick={() => handleSelectSource(item.commandId, item.label, true)}
                        >
                          <span className="text-sm text-text-primary truncate flex-1">{item.label}</span>
                          {histEntry && (
                            <span className="text-xs text-slate-500 flex-shrink-0">
                              {new Date(histEntry.executedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </>
                )}
              </>
            )}
          </div>
        </div>
        {pathManagerOpen && <DevicePathManager onClose={() => setPathManagerOpen(false)} />}
      </>
    )
  }

  // Phase 7 N3: Stage 1b — 设备路径选择面板
  if (showSourceSelect && view === 'paths') {
    return (
      <>
        <div
          className="fixed inset-0 z-[60]"
          onClick={() => closeFillPicker()}
        />
        <div className="fixed z-[70] bg-slate-800 border border-divider rounded-lg shadow-2xl overflow-hidden flex flex-col"
          style={{ width: 380, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxHeight: '80vh' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-divider flex-shrink-0">
            <div className="flex items-center gap-2">
              <button
                className="btn-ghost p-1 rounded"
                onClick={() => setView('source')}
                title="返回"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-sm font-semibold text-text-primary">常用设备路径</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                className="btn-ghost p-1 rounded"
                onClick={() => setPathManagerOpen(true)}
                title="管理自定义路径"
              >
                <Plus size={14} />
              </button>
              <button className="btn-ghost p-1 rounded" onClick={() => closeFillPicker()}>
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="px-4 py-2 border-b border-divider flex-shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                type="text"
                className="w-full bg-slate-700 rounded pl-8 pr-3 py-1.5 text-sm text-text-primary placeholder:text-slate-500 focus:outline-none focus:border-blue-500 border border-transparent"
                placeholder="过滤路径..."
                value={pathFilter}
                onChange={e => setPathFilter(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredPathGroups.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-text-secondary text-sm">
                无匹配路径
              </div>
            ) : (
              filteredPathGroups.map(group => (
                <div key={group.id}>
                  <div className="px-4 py-2 text-xs text-text-secondary sticky top-0 bg-slate-800">
                    {group.label}
                  </div>
                  {group.paths.map(devicePath => (
                    <button
                      key={devicePath.id}
                      onClick={() => handleSelectPath(devicePath.path)}
                      className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-700 rounded text-sm group"
                      title={devicePath.path}
                    >
                      <span className="text-slate-300 truncate">{devicePath.label}</span>
                      <span className="text-slate-500 font-mono text-xs truncate ml-2 max-w-[180px] group-hover:text-slate-300">
                        {devicePath.path}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
        {pathManagerOpen && <DevicePathManager onClose={() => setPathManagerOpen(false)} />}
      </>
    )
  }

  // Stage 2: 选择具体的输出行
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-slate-800 border border-divider rounded-lg shadow-2xl overflow-hidden flex flex-col"
        style={{ width: 480, maxHeight: '80vh' }}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-divider flex-shrink-0">
          <span className="text-sm font-semibold text-text-primary">
            从「{sourceCommandLabel}」中选取
          </span>
          <button className="btn-ghost p-1 rounded" onClick={() => closeFillPicker()}>
            <X size={14} />
          </button>
        </div>

        {/* 搜索过滤 */}
        <div className="px-4 py-2 border-b border-divider flex-shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input
              type="text"
              className="w-full bg-slate-700 rounded pl-8 pr-3 py-1.5 text-sm text-text-primary placeholder:text-slate-500 focus:outline-none focus:border-blue-500 border border-transparent"
              placeholder="过滤..."
              value={filterText}
              onChange={e => setFillPickerFilter(e.target.value)}
            />
          </div>
        </div>

        {/* 行列表 */}
        <div className="flex-1 overflow-y-auto max-h-96">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-text-secondary">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">正在执行命令...</span>
            </div>
          ) : filteredLines.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-text-secondary text-sm">
              {outputLines.length === 0 ? '无可用数据' : '无匹配结果'}
            </div>
          ) : (
            filteredLines.map((line, i) => (
              <button
                key={i}
                className="w-full px-4 py-1.5 text-left text-sm font-mono text-text-primary hover:bg-primary/20 transition-colors truncate"
                onClick={() => handleSelectLine(line)}
                title={line}
              >
                {line}
              </button>
            ))
          )}
        </div>

        {/* 底部统计 */}
        <div className="px-4 py-2 border-t border-divider flex-shrink-0 text-xs text-text-secondary">
          共 {outputLines.length} 项{filterText && ` · 过滤后 ${filteredLines.length} 项`}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState, useMemo } from 'react'
import { useCommandStore } from '../store/commandStore'
import { useLogStore } from '../store/logStore'
import { processOutput } from '../utils/outputProcessor'
import { X, Loader2, Star, Search } from 'lucide-react'

export default function FillPicker() {
  const fillPicker = useCommandStore(s => s.fillPicker)
  const closeFillPicker = useCommandStore(s => s.closeFillPicker)
  const setFillPickerOutput = useCommandStore(s => s.setFillPickerOutput)
  const setFillPickerLoading = useCommandStore(s => s.setFillPickerLoading)
  const setFillPickerFilter = useCommandStore(s => s.setFillPickerFilter)
  const history = useLogStore(s => s.history)
  const commands = useCommandStore(s => s.commands)
  const getOutputCache = useLogStore(s => s.getOutputCache)

  const { isOpen, sourceCommandId, sourceCommandLabel, outputLines, isLoading, filterText } = fillPicker

  // Bug 4 fix: useState 必须在 early return 之前调用（React hooks 规则）
  const [showSourceSelect, setShowSourceSelect] = useState(true)

  useEffect(() => {
    if (isOpen) {
      setShowSourceSelect(true)
    }
  }, [isOpen])

  // Bug 4 fix: useMemo 必须在 early return 之前调用
  const filteredLines = useMemo(() => {
    if (!filterText.trim()) return outputLines
    const q = filterText.toLowerCase()
    return outputLines.filter(l => l.toLowerCase().includes(q))
  }, [outputLines, filterText])

  // Bug 4 fix: 所有 hooks 调用完毕后才能 early return
  if (!isOpen) return null

  // 确定推荐的来源命令
  const recommendedCmd = sourceCommandId
    ? commands.find(c => c.id === sourceCommandId)
    : null

  // 最近 5 条有输出的历史
  const recentWithOutput = history
    .filter(h => h.outputText && h.outputText.trim().length > 0)
    .slice(0, 5)

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

  // Stage 1: 选择来源
  if (showSourceSelect) {
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
            {/* 推荐来源 */}
            {recommendedCmd && (
              <>
                <div className="px-4 py-2 text-xs text-text-secondary">推荐</div>
                <button
                  className="w-full px-4 py-2.5 text-left hover:bg-slate-700 transition-colors flex items-center gap-2"
                  onClick={() => handleSelectSource(recommendedCmd.id, recommendedCmd.label, true)}
                >
                  <Star size={14} className="text-amber-500 flex-shrink-0" />
                  <span className="text-sm text-text-primary">{recommendedCmd.label}</span>
                  {getOutputCache(recommendedCmd.id) && (
                    <span className="text-xs text-success ml-auto">已缓存</span>
                  )}
                </button>
                <div className="mx-4 border-t border-divider" />
              </>
            )}

            {/* 最近有输出的历史 */}
            {recentWithOutput.length > 0 && (
              <>
                <div className="px-4 py-2 text-xs text-text-secondary">最近执行</div>
                {recentWithOutput.map(h => (
                  <button
                    key={h.id}
                    className="w-full px-4 py-2.5 text-left hover:bg-slate-700 transition-colors flex items-center gap-2"
                    onClick={() => handleSelectSource(h.commandId, h.commandLabel, true)}
                  >
                    <span className="text-sm text-text-primary truncate flex-1">{h.commandLabel}</span>
                    <span className="text-xs text-slate-500 flex-shrink-0">
                      {new Date(h.executedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </button>
                ))}
                <div className="mx-4 border-t border-divider" />
              </>
            )}

            {/* 全部潜在来源命令 */}
            <div className="px-4 py-2 text-xs text-text-secondary">执行并获取数据</div>
            {commands
              .filter(c => c.params.length === 0 && c.outputMode !== 'stream')
              .slice(0, 10)
              .map(c => (
                <button
                  key={c.id}
                  className="w-full px-4 py-2.5 text-left hover:bg-slate-700 transition-colors"
                  onClick={() => handleSelectSource(c.id, c.label, false)}
                >
                  <span className="text-sm text-text-primary">{c.label}</span>
                </button>
              ))}
          </div>
        </div>
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

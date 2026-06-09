import { useEffect, useRef } from 'react'
import DeviceStatusBar from './components/DeviceStatusBar'
import Sidebar from './components/Sidebar'
import CommandList from './components/CommandList'
import LogPanel from './components/LogPanel'
import AdbMissingModal from './components/AdbMissingModal'
import HistoryPanel from './components/HistoryPanel'
import ParamDialog from './components/ParamDialog'
import FillPicker from './components/FillPicker'
import CommandEditor from './components/CommandEditor'
import FavoritesPanel from './components/FavoritesPanel'
import { useCommandStore } from './store/commandStore'
import { useDeviceStore } from './store/deviceStore'
import { useLogStore } from './store/logStore'
import { useFavoriteStore } from './store/favoriteStore'
import { HistoryEntry, ExecutionState } from './types'

export default function App() {
  const setConfig = useCommandStore(s => s.setConfig)
  const setDevices = useDeviceStore(s => s.setDevices)
  const setAdbAvailability = useDeviceStore(s => s.setAdbAvailability)
  const addEntry = useLogStore(s => s.addEntry)
  const loadHistory = useLogStore(s => s.loadHistory)
  const setOutputCache = useLogStore(s => s.setOutputCache)
  const openSegment = useLogStore(s => s.openSegment)
  const appendLine = useLogStore(s => s.appendLine)
  const closeSegment = useLogStore(s => s.closeSegment)
  const clearLog = useLogStore(s => s.clearLog)
  const consumePendingMeta = useCommandStore(s => s.consumePendingMeta)
  const updateExecutionState = useCommandStore(s => s.updateExecutionState)
  const executionStates = useCommandStore(s => s.executionStates)

  // 用 ref 累积命令输出（避免渲染重绘）
  const outputBuffers = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    // 加载命令配置
    window.electronAPI.getCommands().then(config => {
      setConfig(config)
    }).catch(err => {
      console.error('加载命令配置失败:', err)
    })

    // 加载历史记录
    loadHistory()

    // F3: 加载收藏
    useFavoriteStore.getState().loadFavorites()

    // 监听设备状态
    const unsubDevices = window.electronAPI.onDeviceStatus((devices) => {
      setDevices(devices)
    })

    // F1: 监听 adb 可用性检测结果
    const unsubAdb = window.electronAPI.onAdbAvailability((result) => {
      setAdbAvailability(result.available, result.version, result.error)
    })

    // 监听命令输出（累积完整输出文本）
    const unsubOutput = window.electronAPI.onAdbOutput((chunk) => {
      const buf = outputBuffers.current
      const existing = buf.get(chunk.cmdId) || ''
      buf.set(chunk.cmdId, existing + chunk.text)

      const meta = useCommandStore.getState().pendingCommandMetas.get(chunk.cmdId)
      const resolvedCommand = meta ? ['adb', ...meta.resolvedArgs].join(' ') : ''
      const segmentExists = useLogStore.getState().segments.has(chunk.cmdId)
      if (!segmentExists) {
        openSegment(chunk.cmdId, {
          commandLabel: meta?.commandLabel ?? chunk.cmdId.slice(0, 8),
          resolvedCommand,
          startedAt: Date.now(),
        })
      }

      const lines = chunk.text.split(/\r?\n/)
      lines.forEach((raw, index) => {
        if (!raw && index === lines.length - 1) return
        appendLine({
          cmdId: chunk.cmdId,
          stream: chunk.stream,
          raw,
          timestamp: Date.now(),
        })
      })
    })

    // 监听命令完成（构造 HistoryEntry + 更新执行状态）
    const unsubDone = window.electronAPI.onAdbDone((event) => {
      // Bug 3 fix: 更新执行状态（停止转圈）
      // Bug 2 fix: 流式命令被用户中止不应标记为 'failed'
      const currentState = useCommandStore.getState().executionStates.get(event.cmdId)
      if (currentState) {
        const newStatus: ExecutionState['status'] =
          event.reason === 'timeout' ? 'timeout' :
          event.reason === 'killed' ? 'idle' :  // 用户中止 → 回到空闲态
          event.exitCode === 0 ? 'success' : 'failed'
        updateExecutionState(event.cmdId, {
          status: newStatus,
          exitCode: event.exitCode,
          durationMs: event.durationMs,
        })

        // Bug 2 fix: 成功/失败图标 3 秒后自动清除
        if (newStatus === 'success' || newStatus === 'failed' || newStatus === 'timeout') {
          setTimeout(() => {
            updateExecutionState(event.cmdId, { status: 'idle' })
          }, 3000)
        }
      }

      // 从 store 取出执行前记录的元信息（由 CommandCard/ParamDialog 在执行前写入）
      const meta = consumePendingMeta(event.cmdId)
      const output = outputBuffers.current.get(event.cmdId) || ''
      const resolvedCommand = meta ? ['adb', ...meta.resolvedArgs].join(' ') : ''

      if (meta?.commandId === 'adb_logcat_clear' && event.exitCode === 0) {
        clearLog()
      }

      if (!useLogStore.getState().segments.has(event.cmdId)) {
        openSegment(event.cmdId, {
          commandLabel: meta?.commandLabel ?? event.cmdId.slice(0, 8),
          resolvedCommand,
          startedAt: Date.now() - event.durationMs,
        })
      }
      closeSegment(event.cmdId, event.exitCode, event.reason)

      // 缓存输出（F4 FillPicker 用）
      if (meta && output.trim()) {
        setOutputCache(meta.commandId, output)
      }

      if (meta) {
        const command = useCommandStore.getState().commands.find(c => c.id === meta.commandId)
        const entry: HistoryEntry = {
          id: event.cmdId,
          commandId: meta.commandId,
          commandLabel: meta.commandLabel,
          resolvedCommand: ['adb', ...meta.resolvedArgs].join(' '),
          resolvedArgs: meta.resolvedArgs,
          exitCode: event.exitCode,
          durationMs: event.durationMs,
          executedAt: new Date().toISOString(),
          hasParams: (command?.params.length ?? 0) > 0,
          outputText: output,
        }
        addEntry(entry)
      }

      // 清理 buffer
      outputBuffers.current.delete(event.cmdId)
    })

    return () => {
      unsubDevices()
      unsubAdb()
      unsubOutput()
      unsubDone()
    }
  }, [])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 顶部设备状态栏 */}
      <DeviceStatusBar />

      {/* 主体区域：侧边栏 + 命令区 + 日志面板 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 侧边栏 */}
        <Sidebar />

        {/* 命令区 + 日志面板（垂直分割）*/}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <CommandList />
          </div>
          <LogPanel />
        </div>
      </div>

      {/* F1: adb 未找到模态框 */}
      <AdbMissingModal />

      {/* F2: 历史记录抽屉 */}
      <HistoryPanel />

      {/* F3: 收藏面板 */}
      <FavoritesPanel />

      {/* F3: 参数弹窗 */}
      <ParamDialog />

      {/* F4: 一键填入 */}
      <FillPicker />

      {/* 新增命令编辑器 */}
      <CommandEditor />
    </div>
  )
}

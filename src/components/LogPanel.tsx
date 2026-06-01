import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useLogStore } from '../store/logStore'
import { useCommandStore } from '../store/commandStore'
import { Trash2, Copy, ChevronDown, Square } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'

export default function LogPanel() {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const lineCountRef = useRef(0)
  const autoScroll = useLogStore(s => s.autoScroll)
  const setAutoScroll = useLogStore(s => s.setAutoScroll)

  // F5: 追踪运行中的命令
  const [runningCmdIds, setRunningCmdIds] = useState<Set<string>>(new Set())
  const executionStates = useCommandStore(s => s.executionStates)

  // 同步 runningCmdIds
  useEffect(() => {
    const ids = new Set(
      Array.from(executionStates.values())
        .filter(e => e.status === 'running')
        .map(e => e.cmdId)
    )
    setRunningCmdIds(ids)
  }, [executionStates])

  // 初始化 xterm.js
  useEffect(() => {
    if (!terminalRef.current) return

    const term = new Terminal({
      theme: {
        background: '#0f172a',
        foreground: '#f1f5f9',
        cursor: '#3b82f6',
        selectionBackground: '#334155',
        black: '#1e293b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f1f5f9',
        brightBlack: '#475569',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#f8fafc',
      },
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
      cursorBlink: true,
      convertEol: true,
      scrollback: 10000,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    // Bug 5 fix: Ctrl+C 复制选中文本到系统剪贴板
    term.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.key === 'c' && term.hasSelection()) {
        const selected = term.getSelection()
        window.electronAPI.copyToClipboard(selected)
        return false // 阻止默认行为
      }
      return true
    })

    term.open(terminalRef.current)
    fitAddon.fit()

    term.writeln('\x1b[36m╔══════════════════════════════════════════════╗')
    term.writeln('║          ADB GUI 调试工具 v1.0               ║')
    term.writeln('║  所有命令输出将显示在此面板中                 ║')
    term.writeln('╚══════════════════════════════════════════════╝\x1b[0m')
    term.writeln('')

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    return () => {
      term.dispose()
    }
  }, [])

  // 监听命令输出
  useEffect(() => {
    let lastCmdId = ''

    const unsubOutput = window.electronAPI.onAdbOutput((chunk) => {
      const term = xtermRef.current
      if (!term) return

      const color = chunk.stream === 'stderr' ? '\x1b[31m' : ''

      if (chunk.cmdId !== lastCmdId) {
        lastCmdId = chunk.cmdId
        const now = new Date().toLocaleTimeString('zh-CN', { hour12: false })
        // Bug 4 fix: 显示命令名称而非 cmdId 片段
        const label = useCommandStore.getState().commandLabels.get(chunk.cmdId) || chunk.cmdId.slice(0, 8)
        term.writeln(`\x1b[33m─── [${now}] ${label} ───\x1b[0m`)
      }
      term.write(`${color}${chunk.text}\x1b[0m`)

      lineCountRef.current += chunk.text.split('\n').length

      if (lineCountRef.current > 10000) {
        term.clear()
        lineCountRef.current = 0
      }

      if (autoScroll) {
        term.scrollToBottom()
      }
    })

    // F5: 按 reason 渲染不同结束行（Bug 4 fix: 显示命令名称）
    const unsubDone = window.electronAPI.onAdbDone((event) => {
      // Bug 5 fix: logcat clear 命令执行成功后清除终端面板
      const meta = useCommandStore.getState().pendingCommandMetas.get(event.cmdId)
      if (meta?.commandId === 'adb_logcat_clear' && event.exitCode === 0) {
        xtermRef.current?.clear()
        lineCountRef.current = 0
      }
      const term = xtermRef.current
      if (!term) return

      const duration = (event.durationMs / 1000).toFixed(2)
      const label = useCommandStore.getState().commandLabels.get(event.cmdId) || event.cmdId.slice(0, 8)
      let color: string
      let message: string

      switch (event.reason) {
        case 'timeout':
          color = '\x1b[33m'
          message = `─── [${label}] 超时 [已终止, 耗时: ${duration}s] ───`
          break
        case 'killed':
          color = '\x1b[90m'
          message = `─── [${label}] 已中止 [用户手动停止, 耗时: ${duration}s] ───`
          break
        case 'adb_unavailable':
          color = '\x1b[31m'
          message = `─── [${label}] 错误 [adb 不可用] ───`
          break
        case 'normal':
        default:
          if (event.exitCode === 0) {
            color = '\x1b[32m'
            message = `─── [${label}] 完成 [退出码: 0, 耗时: ${duration}s] ───`
          } else {
            color = '\x1b[31m'
            message = `─── [${label}] 失败 [退出码: ${event.exitCode}, 耗时: ${duration}s] ───`
          }
      }

      term.writeln(`${color}${message}\x1b[0m`)
      term.writeln('')

      if (autoScroll) {
        term.scrollToBottom()
      }
    })

    return () => {
      unsubOutput()
      unsubDone()
    }
  }, [autoScroll])

  // 窗口大小变化时重新适配
  useEffect(() => {
    const handleResize = () => {
      try {
        fitAddonRef.current?.fit()
      } catch {
        // fit 失败时忽略
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleClear = useCallback(() => {
    xtermRef.current?.clear()
    lineCountRef.current = 0
  }, [])

  const handleCopy = useCallback(() => {
    const term = xtermRef.current
    if (!term) return
    const buffer = term.buffer.active
    const lines: string[] = []
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i)
      if (line) {
        lines.push(line.translateToString())
      }
    }
    // Bug 5 fix: 使用 Electron clipboard API（绕过 CSP 限制）
    window.electronAPI.copyToClipboard(lines.join('\n'))
  }, [])

  const handleAbort = useCallback(() => {
    runningCmdIds.forEach(cmdId => {
      window.electronAPI.killCommand(cmdId)
    })
  }, [runningCmdIds])

  return (
    <div className="flex flex-col border-t border-divider" style={{ minHeight: 80, height: '35%' }}>
      {/* 工具栏 */}
      <div className="toolbar bg-slate-800 border-b border-divider flex-shrink-0">
        {/* F5: 中止按钮（运行中时显示） */}
        {runningCmdIds.size > 0 && (
          <button
            onClick={handleAbort}
            className="flex items-center gap-1.5 px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-medium text-white mr-2 transition-colors"
            title="中止所有正在执行的命令"
          >
            <Square size={12} fill="currentColor" />
            中止执行
          </button>
        )}

        <span className="text-xs text-text-secondary mr-auto">终端</span>

        <button
          className={`btn-ghost p-1 rounded text-xs ${autoScroll ? 'text-primary' : 'text-text-secondary'}`}
          title={autoScroll ? '自动滚动（开）' : '自动滚动（关）'}
          onClick={() => setAutoScroll(!autoScroll)}
        >
          <ChevronDown size={14} />
        </button>

        <button
          className="btn-ghost p-1 rounded"
          title="复制全部"
          onClick={handleCopy}
        >
          <Copy size={14} />
        </button>

        <button
          className="btn-ghost p-1 rounded"
          title="清除终端"
          onClick={handleClear}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* xterm 终端 */}
      <div ref={terminalRef} className="flex-1 overflow-hidden" />
    </div>
  )
}

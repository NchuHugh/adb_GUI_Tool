// ============================================================
// AdbRunner — 管理 adb 子进程
// 使用 child_process.spawn 流式执行 adb 命令
// 通过 IPC 将 stdout/stderr 批量推送到渲染进程
// ============================================================

import { ChildProcess, spawn, exec } from 'child_process'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS, RunRequest, OutputChunk, DoneEvent } from '../src/types'

interface ActiveJob {
  process: ChildProcess
  cmdId: string
  startTime: number
  timeoutHandle?: ReturnType<typeof setTimeout>
  terminationReason?: DoneEvent['reason']
  stdoutBuffer: StreamBuffer
  stderrBuffer: StreamBuffer
}

interface StreamBuffer {
  pendingLine: string
  lines: string[]
  flushTimer: ReturnType<typeof setTimeout> | null
}

const FLUSH_INTERVAL_MS = 50
const MAX_BUFFER_LINES = 200

function createStreamBuffer(): StreamBuffer {
  return { pendingLine: '', lines: [], flushTimer: null }
}

export interface AdbCheckResult {
  available: boolean
  version?: string
  error?: string
}

// 模块级 adb 可用性缓存（run() 方法二次检查用）
let _adbAvailable = true

export function setAdbAvailable(available: boolean) {
  _adbAvailable = available
}

export function isAdbAvailable(): boolean {
  return _adbAvailable
}

/** 启动时检测 adb 是否可用 */
export function checkAdbAvailability(): Promise<AdbCheckResult> {
  return new Promise((resolve) => {
    exec('adb version', { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        const isEnoent = (err as any).code === 'ENOENT' ||
          (err as any).errno === -4058 ||
          err.message?.includes('not found') ||
          err.message?.includes('ENOENT')
        const result: AdbCheckResult = {
          available: false,
          error: isEnoent
            ? 'adb 未在系统 PATH 中找到。请确认已安装 Android SDK Platform Tools。'
            : stderr || err.message,
        }
        _adbAvailable = false
        resolve(result)
        return
      }

      const versionMatch = stdout.match(/Android Debug Bridge version ([\d.]+)/)
      const result: AdbCheckResult = {
        available: true,
        version: versionMatch ? versionMatch[1] : stdout.trim().split('\n')[0],
      }
      _adbAvailable = true
      resolve(result)
    })
  })
}

export class AdbRunner {
  private activeJobs: Map<string, ActiveJob> = new Map()

  run(
    request: RunRequest,
    deviceSerial: string | null,
    window: BrowserWindow,
    timeoutMs: number = 30000,
  ): Promise<void> {
    return new Promise((resolve) => {
      const { cmdId, resolvedArgs } = request

      if (!_adbAvailable) {
        this.sendLines(window, cmdId, 'stderr', ['\x1b[31m[ERROR] adb 不可用，请先配置 PATH 环境变量\x1b[0m'])
        window.webContents.send(IPC_CHANNELS.ADB_DONE, {
          cmdId,
          exitCode: -2,
          durationMs: 0,
          reason: 'adb_unavailable',
        } satisfies DoneEvent)
        resolve()
        return
      }

      const args: string[] = []
      if (deviceSerial) {
        args.push('-s', deviceSerial)
      }
      args.push(...resolvedArgs)

      console.log(`[AdbRunner] 执行: adb ${args.join(' ')}`)

      const proc = spawn('adb', args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      const startTime = Date.now()
      const job: ActiveJob = {
        process: proc,
        cmdId,
        startTime,
        stdoutBuffer: createStreamBuffer(),
        stderrBuffer: createStreamBuffer(),
      }
      this.activeJobs.set(cmdId, job)

      if (timeoutMs > 0) {
        job.timeoutHandle = setTimeout(() => {
          if (this.activeJobs.has(cmdId)) {
            this.sendLines(window, cmdId, 'stderr', ['\x1b[33m⚠ 命令已超时，正在终止进程...\x1b[0m'])
            this.killJob(cmdId, 'timeout')
          }
        }, timeoutMs)
      }

      proc.stdout?.on('data', (data: Buffer) => {
        this.appendChunk(window, cmdId, 'stdout', job.stdoutBuffer, data.toString())
      })

      proc.stderr?.on('data', (data: Buffer) => {
        this.appendChunk(window, cmdId, 'stderr', job.stderrBuffer, data.toString())
      })

      proc.on('close', (code) => {
        const durationMs = Date.now() - startTime
        if (job.timeoutHandle) clearTimeout(job.timeoutHandle)

        this.flushBuffer(window, cmdId, 'stdout', job.stdoutBuffer, true)
        this.flushBuffer(window, cmdId, 'stderr', job.stderrBuffer, true)

        const reason = job.terminationReason ?? 'normal'
        this.activeJobs.delete(cmdId)

        window.webContents.send(IPC_CHANNELS.ADB_DONE, {
          cmdId,
          exitCode: reason === 'normal' ? (code ?? -1) : -1,
          durationMs,
          reason,
        } satisfies DoneEvent)
        console.log(`[AdbRunner] 完成: 退出码=${code}, 耗时=${durationMs}ms, reason=${reason}`)
        resolve()
      })

      proc.on('error', (err) => {
        const durationMs = Date.now() - startTime
        if (job.timeoutHandle) clearTimeout(job.timeoutHandle)

        this.flushBuffer(window, cmdId, 'stdout', job.stdoutBuffer, true)
        this.flushBuffer(window, cmdId, 'stderr', job.stderrBuffer, true)
        this.sendLines(window, cmdId, 'stderr', [`\x1b[31m进程错误: ${err.message}\x1b[0m`])

        const reason = job.terminationReason ?? 'normal'
        this.activeJobs.delete(cmdId)

        window.webContents.send(IPC_CHANNELS.ADB_DONE, {
          cmdId,
          exitCode: -1,
          durationMs,
          reason,
        } satisfies DoneEvent)
        resolve()
      })
    })
  }

  private appendChunk(
    window: BrowserWindow,
    cmdId: string,
    stream: 'stdout' | 'stderr',
    buffer: StreamBuffer,
    text: string,
  ) {
    const combined = buffer.pendingLine + text
    const parts = combined.split('\n')
    buffer.pendingLine = parts.pop() ?? ''
    buffer.lines.push(...parts)

    if (buffer.lines.length >= MAX_BUFFER_LINES) {
      this.flushBuffer(window, cmdId, stream, buffer, false)
      return
    }

    if (!buffer.flushTimer) {
      buffer.flushTimer = setTimeout(() => {
        this.flushBuffer(window, cmdId, stream, buffer, false)
      }, FLUSH_INTERVAL_MS)
    }
  }

  private flushBuffer(
    window: BrowserWindow,
    cmdId: string,
    stream: 'stdout' | 'stderr',
    buffer: StreamBuffer,
    includePending: boolean,
  ) {
    if (buffer.flushTimer) {
      clearTimeout(buffer.flushTimer)
      buffer.flushTimer = null
    }

    const batch = [...buffer.lines]
    buffer.lines = []

    if (includePending && buffer.pendingLine) {
      batch.push(buffer.pendingLine)
      buffer.pendingLine = ''
    }

    if (batch.length === 0) return
    this.sendLines(window, cmdId, stream, batch)
  }

  private sendLines(
    window: BrowserWindow,
    cmdId: string,
    stream: 'stdout' | 'stderr',
    lines: string[],
  ) {
    if (window.isDestroyed() || lines.length === 0) return
    const chunk: OutputChunk = { cmdId, stream, lines }
    window.webContents.send(IPC_CHANNELS.ADB_OUTPUT, chunk)
  }

  private killJob(cmdId: string, reason: 'timeout' | 'killed' | 'quit') {
    const job = this.activeJobs.get(cmdId)
    if (!job) return

    console.log(`[AdbRunner] ${reason === 'timeout' ? '超时' : '中止'}终止: ${cmdId}`)
    job.terminationReason = reason === 'quit' ? 'killed' : reason
    job.process.kill('SIGTERM')

    setTimeout(() => {
      try {
        if (!job.process.killed) {
          job.process.kill('SIGKILL')
        }
      } catch {
        // 进程可能已经退出
      }
    }, 3000)

    if (job.timeoutHandle) {
      clearTimeout(job.timeoutHandle)
    }
  }

  kill(cmdId: string): boolean {
    const job = this.activeJobs.get(cmdId)
    if (!job) return false

    console.log(`[AdbRunner] 用户中止命令: ${cmdId}`)
    this.killJob(cmdId, 'killed')
    return true
  }

  killAll() {
    for (const [cmdId] of this.activeJobs) {
      this.kill(cmdId)
    }
  }

  get activeCount(): number {
    return this.activeJobs.size
  }
}

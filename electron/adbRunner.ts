// ============================================================
// AdbRunner — 管理 adb 子进程
// 使用 child_process.spawn 流式执行 adb 命令
// 通过 IPC 将 stdout/stderr 实时推送到渲染进程
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
        // ENOENT = adb 不在 PATH 中
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

      // 解析版本号
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

  /**
   * 执行一条 adb 命令
   * @param request  命令运行请求
   * @param deviceSerial  当前选中的设备序列号（多设备时自动注入 -s）
   * @param window  BrowserWindow 实例，用于 IPC 推送
   * @param timeoutMs  超时时间（ms），默认 30000
   */
  run(
    request: RunRequest,
    deviceSerial: string | null,
    window: BrowserWindow,
    timeoutMs: number = 30000,
  ): Promise<void> {
    return new Promise((resolve) => {
      const { cmdId, resolvedArgs } = request

      // F1: 执行时二次检查 adb 可用性
      if (!_adbAvailable) {
        const chunk: OutputChunk = {
          cmdId,
          stream: 'stderr',
          text: '\x1b[31m[ERROR] adb 不可用，请先配置 PATH 环境变量\x1b[0m\n',
        }
        window.webContents.send(IPC_CHANNELS.ADB_OUTPUT, chunk)

        const doneEvent: DoneEvent = {
          cmdId,
          exitCode: -2,
          durationMs: 0,
          reason: 'adb_unavailable',
        }
        window.webContents.send(IPC_CHANNELS.ADB_DONE, doneEvent)
        resolve()
        return
      }

      // 构建完整命令行：adb [-s serial] <args...>
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
      const job: ActiveJob = { process: proc, cmdId, startTime }
      this.activeJobs.set(cmdId, job)

      // F5: 超时计时器
      if (timeoutMs > 0) {
        job.timeoutHandle = setTimeout(() => {
          if (this.activeJobs.has(cmdId)) {
            this.sendOutput(window, cmdId, 'stderr', '\x1b[33m⚠ 命令已超时，正在终止进程...\x1b[0m\n')
            this.killJob(cmdId, 'timeout')
          }
        }, timeoutMs)
      }

      // stdout 流式推送
      proc.stdout?.on('data', (data: Buffer) => {
        this.sendOutput(window, cmdId, 'stdout', data.toString())
      })

      // stderr 流式推送
      proc.stderr?.on('data', (data: Buffer) => {
        this.sendOutput(window, cmdId, 'stderr', data.toString())
      })

      // 进程结束
      proc.on('close', (code) => {
        const durationMs = Date.now() - startTime

        // 清除超时计时器
        if (job.timeoutHandle) {
          clearTimeout(job.timeoutHandle)
        }

        const reason = job.terminationReason ?? 'normal'

        this.activeJobs.delete(cmdId)

        const doneEvent: DoneEvent = {
          cmdId,
          exitCode: reason === 'normal' ? (code ?? -1) : -1,
          durationMs,
          reason,
        }

        console.log(`[AdbRunner] 完成: 退出码=${code}, 耗时=${durationMs}ms, reason=${doneEvent.reason}`)
        window.webContents.send(IPC_CHANNELS.ADB_DONE, doneEvent)
        resolve()
      })

      // 进程错误
      proc.on('error', (err) => {
        const durationMs = Date.now() - startTime

        if (job.timeoutHandle) {
          clearTimeout(job.timeoutHandle)
        }

        this.activeJobs.delete(cmdId)

        this.sendOutput(window, cmdId, 'stderr', `\x1b[31m进程错误: ${err.message}\x1b[0m\n`)

        const reason = job.terminationReason ?? 'normal'
        const doneEvent: DoneEvent = {
          cmdId,
          exitCode: -1,
          durationMs,
          reason,
        }
        window.webContents.send(IPC_CHANNELS.ADB_DONE, doneEvent)
        resolve()
      })
    })
  }

  /** 推送输出到渲染进程 */
  private sendOutput(window: BrowserWindow, cmdId: string, stream: 'stdout' | 'stderr', text: string) {
    if (!window.isDestroyed()) {
      const chunk: OutputChunk = { cmdId, stream, text }
      window.webContents.send(IPC_CHANNELS.ADB_OUTPUT, chunk)
    }
  }

  /** 统一 kill 逻辑 */
  private killJob(cmdId: string, reason: 'timeout' | 'killed' | 'quit') {
    const job = this.activeJobs.get(cmdId)
    if (!job) return

    console.log(`[AdbRunner] ${reason === 'timeout' ? '超时' : '中止'}终止: ${cmdId}`)
    job.terminationReason = reason === 'quit' ? 'killed' : reason
    job.process.kill('SIGTERM')

    // 3 秒后 SIGKILL 兜底
    const forceKillHandle = setTimeout(() => {
      try {
        if (!job.process.killed) {
          job.process.kill('SIGKILL')
        }
      } catch {
        // 进程可能已经退出
      }
    }, 3000)

    // 清理超时计时器
    if (job.timeoutHandle) {
      clearTimeout(job.timeoutHandle)
    }

    // ADB_DONE 统一由 close/error 回调发送，避免 timeout/killed 双发完成事件。
  }

  /** 中止指定命令（用户手动触发） */
  kill(cmdId: string): boolean {
    const job = this.activeJobs.get(cmdId)
    if (!job) return false

    console.log(`[AdbRunner] 用户中止命令: ${cmdId}`)
    this.killJob(cmdId, 'killed')
    return true
  }

  /** 中止所有正在执行的命令（退出前清理） */
  killAll() {
    for (const [cmdId] of this.activeJobs) {
      this.kill(cmdId)
    }
  }

  /** 获取正在执行的命令数量 */
  get activeCount(): number {
    return this.activeJobs.size
  }
}

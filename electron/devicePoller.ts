// ============================================================
// DevicePoller — 定时轮询 adb devices -l，推送设备状态到渲染进程
// 轮询间隔：2 秒
// ============================================================

import { BrowserWindow } from 'electron'
import { exec } from 'child_process'
import { IPC_CHANNELS, DeviceInfo } from '../src/types'

const POLL_INTERVAL_MS = 2000

export class DevicePoller {
  private timer: ReturnType<typeof setInterval> | null = null
  private devices: DeviceInfo[] = []
  private selectedSerial: string | null = null

  /** 启动定时轮询 */
  start(window: BrowserWindow) {
    // 立即执行一次
    this.poll(window)

    this.timer = setInterval(() => {
      this.poll(window)
    }, POLL_INTERVAL_MS)
  }

  /** 停止轮询 */
  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** 获取当前选中的设备序列号 */
  getSelectedSerial(): string | null {
    // 单设备自动选中
    if (this.devices.length === 1 && this.devices[0].state === 'device') {
      return this.devices[0].serial
    }
    return this.selectedSerial
  }

  /** 手动选择设备 */
  selectDevice(serial: string | null) {
    this.selectedSerial = serial
  }

  /** 执行一次轮询 */
  private poll(window: BrowserWindow) {
    exec('adb devices -l', { timeout: 5000 }, (err, stdout) => {
      if (err) {
        // adb 未找到或执行失败，发送空列表
        this.devices = []
        this.sendUpdate(window)
        return
      }

      this.devices = this.parseDevices(stdout)

      // 自动选择唯一设备
      if (this.devices.length === 1 && this.devices[0].state === 'device') {
        this.selectedSerial = this.devices[0].serial
      } else if (this.devices.length === 0) {
        this.selectedSerial = null
      }

      this.sendUpdate(window)
    })
  }

  /** 解析 adb devices -l 输出 */
  private parseDevices(output: string): DeviceInfo[] {
    const lines = output.split('\n').slice(1) // 跳过第一行 "List of devices attached"
    const devices: DeviceInfo[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const parts = trimmed.split(/\s+/)
      if (parts.length < 2) continue

      const serial = parts[0]
      const state = parts[1] as DeviceInfo['state']

      // 只有这三种状态是有效的
      if (!['device', 'offline', 'unauthorized'].includes(state)) continue

      // 从 -l 输出中提取 model: 字段
      let model: string | undefined
      const modelMatch = trimmed.match(/model:(\S+)/)
      if (modelMatch) {
        model = modelMatch[1]
      }

      devices.push({ serial, state, model })
    }

    return devices
  }

  /** 推送设备状态到渲染进程 */
  private sendUpdate(window: BrowserWindow) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.DEVICE_STATUS, this.devices)
    }
  }
}

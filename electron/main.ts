// ============================================================
// Electron 主进程入口
// 负责创建窗口、加载 preload、管理应用生命周期
// ============================================================

import { app, BrowserWindow, ipcMain, dialog, shell, clipboard } from 'electron'
import path from 'path'
import fs from 'fs'
import { ConfigLoader } from './configLoader'
import { AdbRunner, checkAdbAvailability, setAdbAvailable } from './adbRunner'
import { DevicePoller } from './devicePoller'
import { IPC_CHANNELS } from '../src/types'
import { templateToAdbArgs } from '../src/utils/argParser'

// 设为 true 可打开 DevTools
const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let configLoader: ConfigLoader
let adbRunner: AdbRunner
let devicePoller: DevicePoller

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0f172a',
    title: 'ADB GUI',
    titleBarStyle: 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  })

  // 加载页面
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

function registerIpcHandlers() {
  // 返回命令配置列表
  ipcMain.handle(IPC_CHANNELS.COMMANDS_LIST, async () => {
    return configLoader.getConfig()
  })

  // 执行命令
  ipcMain.handle(IPC_CHANNELS.ADB_RUN, async (_event, request) => {
    const deviceSerial = devicePoller.getSelectedSerial()
    const command = configLoader.getConfig().commands.find(c => c.id === request.commandId)
    const timeoutMs = command?.timeout ?? 30000
    await adbRunner.run(request, deviceSerial, mainWindow!, timeoutMs)
  })

  // 中止命令
  ipcMain.on(IPC_CHANNELS.ADB_KILL, (_event, cmdId: string) => {
    adbRunner.kill(cmdId)
  })

  // 文件选择对话框
  ipcMain.handle('dialog:selectFile', async (_event, options?) => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: options?.filters,
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // 目录选择对话框
  ipcMain.handle('dialog:selectDirectory', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // F1: 在系统浏览器中打开链接
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url)
  })

  // Bug 5 fix: 写入剪贴板
  ipcMain.handle('clipboard:write', async (_event, text: string) => {
    clipboard.writeText(text)
  })

  // F2: 读取历史记录
  ipcMain.handle('history:load', async () => {
    const historyPath = path.join(
      process.env.APPDATA || path.join(process.env.HOME || '', 'AppData', 'Roaming'),
      'adb-gui',
      'history.json'
    )
    try {
      if (fs.existsSync(historyPath)) {
        const raw = fs.readFileSync(historyPath, 'utf-8')
        return JSON.parse(raw)
      }
    } catch {
      // 文件损坏或不存在，返回空数组
    }
    return []
  })

  // F2: 保存历史记录
  ipcMain.handle('history:save', async (_event, entries) => {
    const appDataDir = path.join(
      process.env.APPDATA || path.join(process.env.HOME || '', 'AppData', 'Roaming'),
      'adb-gui'
    )
    const historyPath = path.join(appDataDir, 'history.json')
    try {
      if (!fs.existsSync(appDataDir)) {
        fs.mkdirSync(appDataDir, { recursive: true })
      }
      fs.writeFileSync(historyPath, JSON.stringify(entries.slice(0, 50), null, 2), 'utf-8')
    } catch (err) {
      console.error('[Main] 保存历史记录失败:', err)
    }
  })

  // F4: 后台静默执行命令（FillPicker 用，不推送输出到日志面板）
  ipcMain.handle('adb:runSilent', async (_event, commandId: string) => {
    const command = configLoader.getConfig().commands.find(c => c.id === commandId)
    if (!command) return { success: false, output: '', exitCode: -1 }

    const deviceSerial = devicePoller.getSelectedSerial()
    return new Promise((resolve) => {
      const args: string[] = []
      if (deviceSerial) args.push('-s', deviceSerial)
      args.push(...templateToAdbArgs(command.template))

      const { spawn } = require('child_process')
      const proc = spawn('adb', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })

      let output = ''
      proc.stdout?.on('data', (d: Buffer) => { output += d.toString() })
      proc.stderr?.on('data', (d: Buffer) => { output += d.toString() })

      const timeoutMs = Math.min(command.timeout || 10000, 10000) // 最大 10 秒
      const timer = setTimeout(() => {
        proc.kill()
        resolve({ success: false, output, exitCode: -1 })
      }, timeoutMs)

      proc.on('close', (code: number) => {
        clearTimeout(timer)
        resolve({ success: code === 0, output, exitCode: code ?? -1 })
      })

      proc.on('error', (err: Error) => {
        clearTimeout(timer)
        resolve({ success: false, output: err.message, exitCode: -1 })
      })
    })
  })

  // F4: 同步选中的设备序列号到主进程
  ipcMain.handle('device:setSelected', async (_event, serial: string | null) => {
    devicePoller.selectDevice(serial)
  })

  // 新增：保存命令配置到用户数据目录
  ipcMain.handle(IPC_CHANNELS.COMMANDS_SAVE, async (_event, config) => {
    try {
      configLoader.saveConfig()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // 新增：添加单条命令
  ipcMain.handle('commands:add', async (_event, command) => {
    try {
      const updated = configLoader.addCommand(command)
      return { success: true, config: updated }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // 新增：删除单条用户自定义命令
  ipcMain.handle(IPC_CHANNELS.COMMANDS_DELETE, async (_event, id: string) => {
    try {
      const updated = configLoader.deleteCommand(id)
      return { success: true, config: updated }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // F1: 编辑单条用户自定义命令
  ipcMain.handle(IPC_CHANNELS.COMMANDS_UPDATE, async (_event, command: any) => {
    try {
      const updated = configLoader.updateCommand(command)
      return { success: true, config: updated }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // F3: 加载收藏列表
  ipcMain.handle(IPC_CHANNELS.FAVORITES_LOAD, async () => {
    const favPath = path.join(
      process.env.APPDATA || path.join(process.env.HOME || '', 'AppData', 'Roaming'),
      'adb-gui',
      'favorites.json'
    )
    try {
      if (fs.existsSync(favPath)) {
        const raw = fs.readFileSync(favPath, 'utf-8')
        return JSON.parse(raw)
      }
    } catch {
      // 文件损坏或不存在
    }
    return []
  })

  // F3: 保存收藏列表
  ipcMain.handle(IPC_CHANNELS.FAVORITES_SAVE, async (_event, entries: any[]) => {
    const appDataDir = path.join(
      process.env.APPDATA || path.join(process.env.HOME || '', 'AppData', 'Roaming'),
      'adb-gui'
    )
    const favPath = path.join(appDataDir, 'favorites.json')
    try {
      if (!fs.existsSync(appDataDir)) {
        fs.mkdirSync(appDataDir, { recursive: true })
      }
      fs.writeFileSync(favPath, JSON.stringify(entries, null, 2), 'utf-8')
    } catch (err) {
      console.error('[Main] 保存收藏失败:', err)
    }
  })
}

app.whenReady().then(async () => {
  // 初始化各模块
  configLoader = new ConfigLoader()
  adbRunner = new AdbRunner()
  devicePoller = new DevicePoller()

  // 校验配置
  configLoader.validate()

  // F1: 启动时检测 adb 可用性
  const adbResult = await checkAdbAvailability()
  setAdbAvailable(adbResult.available)
  console.log(`[Main] adb 检测结果: available=${adbResult.available}, version=${adbResult.version || 'N/A'}`)

  // 注册 IPC 处理器
  registerIpcHandlers()

  // 创建窗口
  const win = createWindow()

  // 窗口加载完成后推送初始数据
  win.webContents.on('did-finish-load', () => {
    win.webContents.send(IPC_CHANNELS.ADB_AVAILABILITY, adbResult)
  })

  // 启动设备轮询
  devicePoller.start(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 退出前清理：kill 所有活跃的 adb 子进程
app.on('before-quit', async (event) => {
  if (adbRunner && adbRunner.activeCount > 0) {
    event.preventDefault()
    adbRunner.killAll()

    // F5: 最多等待 5 秒，超时强制退出
    const maxWait = Date.now() + 5000
    while (adbRunner.activeCount > 0 && Date.now() < maxWait) {
      await new Promise(r => setTimeout(r, 100))
    }
  }
  devicePoller?.stop()

  // 如果 before-quit 被 preventDefault 了，需要手动 quit
  if (event.defaultPrevented) {
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

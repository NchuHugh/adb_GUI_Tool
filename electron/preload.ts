// ============================================================
// Preload 脚本 — contextBridge 暴露安全 API 到渲染进程
// 渲染进程通过 window.electronAPI 调用，无法直接访问 Node.js
// ============================================================

import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../src/types'

const electronAPI = {
  // 获取全部命令配置
  getCommands: () => ipcRenderer.invoke(IPC_CHANNELS.COMMANDS_LIST),

  // 执行一条 adb 命令
  runCommand: (request: any) => ipcRenderer.invoke(IPC_CHANNELS.ADB_RUN, request),

  // 中止正在执行的命令
  killCommand: (cmdId: string) => ipcRenderer.send(IPC_CHANNELS.ADB_KILL, cmdId),

  // 监听实时命令输出
  onAdbOutput: (callback: (chunk: any) => void) => {
    const handler = (_event: any, chunk: any) => callback(chunk)
    ipcRenderer.on(IPC_CHANNELS.ADB_OUTPUT, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ADB_OUTPUT, handler)
  },

  // 监听命令完成事件
  onAdbDone: (callback: (event: any) => void) => {
    const handler = (_event: any, event: any) => callback(event)
    ipcRenderer.on(IPC_CHANNELS.ADB_DONE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ADB_DONE, handler)
  },

  // 监听设备状态变化
  onDeviceStatus: (callback: (devices: any[]) => void) => {
    const handler = (_event: any, devices: any[]) => callback(devices)
    ipcRenderer.on(IPC_CHANNELS.DEVICE_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.DEVICE_STATUS, handler)
  },

  // F1: 监听 adb 可用性检测结果
  onAdbAvailability: (callback: (result: any) => void) => {
    const handler = (_event: any, result: any) => callback(result)
    ipcRenderer.on(IPC_CHANNELS.ADB_AVAILABILITY, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ADB_AVAILABILITY, handler)
  },

  // 打开文件选择对话框
  selectFile: (options?: any) => ipcRenderer.invoke('dialog:selectFile', options),

  // 打开目录选择对话框
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),

  // F1: 在系统浏览器打开链接
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // F2: 历史记录持久化
  loadHistory: () => ipcRenderer.invoke('history:load'),
  saveHistory: (entries: any[]) => ipcRenderer.invoke('history:save', entries),

  // F4: 后台静默执行（FillPicker 用）
  runCommandSilent: (commandId: string) => ipcRenderer.invoke('adb:runSilent', commandId),

  // F4: 同步选中设备到主进程
  setSelectedDevice: (serial: string | null) => ipcRenderer.invoke('device:setSelected', serial),

  // Bug 5 fix: 通过 Electron clipboard API 复制文本
  copyToClipboard: (text: string) => ipcRenderer.invoke('clipboard:write', text),

  // 新增：保存命令配置
  saveCommands: (config: any) => ipcRenderer.invoke(IPC_CHANNELS.COMMANDS_SAVE, config),

  // 新增：添加单条命令
  addCommand: (command: any) => ipcRenderer.invoke('commands:add', command),

  // 新增：删除用户自定义命令
  deleteCommand: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.COMMANDS_DELETE, id),

  // F1: 编辑用户自定义命令
  updateCommand: (command: any) => ipcRenderer.invoke(IPC_CHANNELS.COMMANDS_UPDATE, command),

  // F3: 收藏功能
  loadFavorites: () => ipcRenderer.invoke(IPC_CHANNELS.FAVORITES_LOAD),
  saveFavorites: (entries: any[]) => ipcRenderer.invoke(IPC_CHANNELS.FAVORITES_SAVE, entries),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

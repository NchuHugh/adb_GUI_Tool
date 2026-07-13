import { create } from 'zustand'
import { DevicePath, DevicePathGroup } from '../types'

interface DevicePathStore {
  // 内置路径分组（从 config/device-paths.json 加载，只读）
  builtinGroups: DevicePathGroup[]
  // 用户自定义路径，持久化到 %APPDATA%\adb-gui\custom-paths.json
  customPaths: DevicePath[]

  // 查询
  getAllPaths: () => DevicePath[]

  // 动作
  loadBuiltin: () => Promise<void>
  loadCustom: () => Promise<void>
  addCustomPath: (label: string, path: string) => Promise<{ success: boolean; error?: string }>
  removeCustomPath: (id: string) => Promise<void>
  updateCustomPath: (id: string, label: string, path: string) => Promise<{ success: boolean; error?: string }>
}

function generateId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export const useDevicePathStore = create<DevicePathStore>((set, get) => ({
  builtinGroups: [],
  customPaths: [],

  getAllPaths: () => {
    const builtin = get().builtinGroups.flatMap(g => g.paths)
    return [...builtin, ...get().customPaths]
  },

  loadBuiltin: async () => {
    try {
      const config = await window.electronAPI.loadBuiltinDevicePaths()
      set({ builtinGroups: config.groups ?? [] })
    } catch (err) {
      console.error('[DevicePathStore] 加载内置路径失败:', err)
      set({ builtinGroups: [] })
    }
  },

  loadCustom: async () => {
    try {
      const paths = await window.electronAPI.loadCustomDevicePaths()
      set({ customPaths: (paths ?? []).map(p => ({ ...p, custom: true })) })
    } catch (err) {
      console.error('[DevicePathStore] 加载自定义路径失败:', err)
      set({ customPaths: [] })
    }
  },

  addCustomPath: async (label, path) => {
    const trimmedLabel = label.trim()
    const trimmedPath = path.trim()
    if (!trimmedLabel) return { success: false, error: '标签不能为空' }
    if (trimmedLabel.length > 30) return { success: false, error: '标签最长 30 字符' }
    if (!trimmedPath.startsWith('/')) return { success: false, error: '路径必须以 / 开头' }
    if (get().customPaths.some(p => p.path === trimmedPath)) {
      return { success: false, error: '路径已存在' }
    }

    const newPath: DevicePath = {
      id: generateId(),
      label: trimmedLabel,
      path: trimmedPath,
      custom: true,
    }
    const next = [...get().customPaths, newPath]
    set({ customPaths: next })
    try {
      await window.electronAPI.saveCustomDevicePaths(next)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || '保存失败' }
    }
  },

  removeCustomPath: async (id) => {
    const next = get().customPaths.filter(p => p.id !== id)
    set({ customPaths: next })
    try {
      await window.electronAPI.saveCustomDevicePaths(next)
    } catch (err) {
      console.error('[DevicePathStore] 删除自定义路径失败:', err)
    }
  },

  updateCustomPath: async (id, label, path) => {
    const trimmedLabel = label.trim()
    const trimmedPath = path.trim()
    if (!trimmedLabel) return { success: false, error: '标签不能为空' }
    if (trimmedLabel.length > 30) return { success: false, error: '标签最长 30 字符' }
    if (!trimmedPath.startsWith('/')) return { success: false, error: '路径必须以 / 开头' }
    if (get().customPaths.some(p => p.id !== id && p.path === trimmedPath)) {
      return { success: false, error: '路径已存在' }
    }

    const next = get().customPaths.map(p =>
      p.id === id ? { ...p, label: trimmedLabel, path: trimmedPath } : p,
    )
    set({ customPaths: next })
    try {
      await window.electronAPI.saveCustomDevicePaths(next)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || '保存失败' }
    }
  },
}))

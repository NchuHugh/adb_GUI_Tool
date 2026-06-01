import { create } from 'zustand'
import { HistoryEntry } from '../types'

interface LogStore {
  // 历史记录（最多 50 条）
  history: HistoryEntry[]

  // 日志面板自动滚动
  autoScroll: boolean

  // 历史面板开关
  isHistoryOpen: boolean

  // F4: 输出缓存（commandId → 最近一次完整输出文本，最多 20 条）
  outputCache: Map<string, string>

  // 动作
  addEntry: (entry: HistoryEntry) => void
  loadHistory: () => Promise<void>
  persistHistory: () => Promise<void>
  clearHistory: () => void
  toggleHistory: () => void
  setAutoScroll: (auto: boolean) => void
  setOutputCache: (commandId: string, output: string) => void
  getOutputCache: (commandId: string) => string | undefined
}

export const useLogStore = create<LogStore>((set, get) => ({
  history: [],
  autoScroll: true,
  isHistoryOpen: false,
  outputCache: new Map(),

  addEntry: (entry) => {
    set((state) => {
      const updated = [entry, ...state.history].slice(0, 50)
      return { history: updated }
    })
    // 异步持久化，不阻塞 UI
    get().persistHistory()
  },

  loadHistory: async () => {
    try {
      const entries = await window.electronAPI.loadHistory()
      set({ history: entries.slice(0, 50) })
    } catch {
      // 加载失败静默忽略
    }
  },

  persistHistory: async () => {
    try {
      await window.electronAPI.saveHistory(get().history)
    } catch {
      // 保存失败静默忽略
    }
  },

  clearHistory: () => {
    set({ history: [] })
    get().persistHistory()
  },

  toggleHistory: () => set((s) => ({ isHistoryOpen: !s.isHistoryOpen })),

  setAutoScroll: (auto) => set({ autoScroll: auto }),

  setOutputCache: (commandId, output) => {
    const cache = new Map(get().outputCache)
    cache.set(commandId, output)
    // 最多保留 20 条
    if (cache.size > 20) {
      const oldest = cache.keys().next().value
      if (oldest) cache.delete(oldest)
    }
    set({ outputCache: cache })
  },

  getOutputCache: (commandId) => get().outputCache.get(commandId),
}))

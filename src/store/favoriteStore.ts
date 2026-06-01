import { create } from 'zustand'
import { FavoriteEntry } from '../types'

interface FavoriteStore {
  favorites: FavoriteEntry[]
  isFavoritesOpen: boolean

  isFavorited: (commandId: string) => boolean
  loadFavorites: () => Promise<void>
  addFavorite: (entry: Omit<FavoriteEntry, 'id' | 'pinnedAt' | 'order'>) => Promise<void>
  removeFavorite: (favoriteId: string) => Promise<void>
  updateNickname: (favoriteId: string, nickname: string) => Promise<void>
  toggleFavorites: () => void
}

export const useFavoriteStore = create<FavoriteStore>((set, get) => ({
  favorites: [],
  isFavoritesOpen: false,

  isFavorited: (commandId) => {
    return get().favorites.some(f => f.commandId === commandId)
  },

  loadFavorites: async () => {
    try {
      const entries = await window.electronAPI.loadFavorites()
      set({ favorites: entries })
    } catch {
      // 加载失败，保持空数组
    }
  },

  addFavorite: async (entry) => {
    const newEntry: FavoriteEntry = {
      ...entry,
      id: crypto.randomUUID(),
      pinnedAt: new Date().toISOString(),
      order: get().favorites.length,
    }
    const updated = [...get().favorites, newEntry]
    set({ favorites: updated })
    try {
      await window.electronAPI.saveFavorites(updated)
    } catch {
      // 静默失败
    }
  },

  removeFavorite: async (favoriteId) => {
    const updated = get().favorites.filter(f => f.id !== favoriteId)
    const reordered = updated.map((f, i) => ({ ...f, order: i }))
    set({ favorites: reordered })
    try {
      await window.electronAPI.saveFavorites(reordered)
    } catch {
      // 静默失败
    }
  },

  updateNickname: async (favoriteId, nickname) => {
    const updated = get().favorites.map(f =>
      f.id === favoriteId ? { ...f, nickname: nickname.trim() || f.commandLabel } : f
    )
    set({ favorites: updated })
    try {
      await window.electronAPI.saveFavorites(updated)
    } catch {
      // 静默失败
    }
  },

  toggleFavorites: () => {
    set({ isFavoritesOpen: !get().isFavoritesOpen })
  },
}))

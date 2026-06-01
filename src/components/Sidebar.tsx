import { useCommandStore } from '../store/commandStore'
import { useLogStore } from '../store/logStore'
import { useFavoriteStore } from '../store/favoriteStore'
import * as Icons from 'lucide-react'
import { Layers, Clock, Plus, Star } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// 将图标名称字符串映射到实际组件
function getIcon(iconName: string): LucideIcon {
  const icon = (Icons as any)[iconName]
  return icon || Layers
}

export default function Sidebar() {
  const groups = useCommandStore(s => s.groups)
  const selectedGroupId = useCommandStore(s => s.selectedGroupId)
  const selectGroup = useCommandStore(s => s.selectGroup)
  const openCommandEditor = useCommandStore(s => s.openCommandEditor)
  const toggleHistory = useLogStore(s => s.toggleHistory)
  const historyCount = useLogStore(s => s.history.length)
  const toggleFavorites = useFavoriteStore(s => s.toggleFavorites)
  const isFavoritesOpen = useFavoriteStore(s => s.isFavoritesOpen)
  const favCount = useFavoriteStore(s => s.favorites.length)

  // 收藏与历史互斥
  const handleToggleFavorites = () => {
    const logStore = useLogStore.getState()
    if (logStore.isHistoryOpen) logStore.toggleHistory()
    toggleFavorites()
  }
  const handleToggleHistory = () => {
    const favStore = useFavoriteStore.getState()
    if (favStore.isFavoritesOpen) favStore.toggleFavorites()
    toggleHistory()
  }

  return (
    <div
      className="flex-shrink-0 bg-sidebar-bg border-r border-divider flex flex-col overflow-y-auto overflow-x-hidden no-select"
      style={{ width: 160 }}
    >
      {/* 全部命令 */}
      <button
        className={`sidebar-group-item mt-2 mx-2 ${selectedGroupId === null ? 'active' : ''}`}
        onClick={() => selectGroup(null)}
      >
        <Layers size={18} />
        <span>全部命令</span>
      </button>

      {/* 分隔线 */}
      <div className="mx-3 my-2 border-t border-divider" />

      {/* 分组列表 */}
      {groups.map(group => {
        const IconComponent = getIcon(group.icon)
        const isActive = selectedGroupId === group.id
        return (
          <button
            key={group.id}
            className={`sidebar-group-item mx-2 ${isActive ? 'active' : ''}`}
            onClick={() => selectGroup(group.id)}
          >
            <IconComponent size={18} />
            <span>{group.label}</span>
          </button>
        )
      })}

      {/* 底部：新增命令 + 收藏 + 历史记录按钮 */}
      <div className="mt-auto border-t border-divider pt-2 pb-2 space-y-1">
        <button
          className="sidebar-group-item mx-2 w-full"
          onClick={() => openCommandEditor()}
        >
          <Plus size={18} />
          <span>新增命令</span>
        </button>
        <button
          className={`sidebar-group-item mx-2 w-full ${isFavoritesOpen ? 'active' : ''}`}
          onClick={handleToggleFavorites}
        >
          <Star size={18} fill={isFavoritesOpen ? 'currentColor' : 'none'} />
          <span>收藏命令</span>
          {favCount > 0 && (
            <span className="ml-auto text-xs text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded-full">
              {favCount}
            </span>
          )}
        </button>
        <button
          className="sidebar-group-item mx-2 w-full"
          onClick={handleToggleHistory}
        >
          <Clock size={18} />
          <span>历史记录</span>
          {historyCount > 0 && (
            <span className="ml-auto text-xs text-text-secondary bg-slate-700 px-1.5 py-0.5 rounded">
              {historyCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

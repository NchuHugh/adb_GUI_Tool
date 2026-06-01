import { useMemo } from 'react'
import { useCommandStore } from '../store/commandStore'
import CommandCard from './CommandCard'
import { Search } from 'lucide-react'

export default function CommandList() {
  const searchQuery = useCommandStore(s => s.searchQuery)
  const setSearchQuery = useCommandStore(s => s.setSearchQuery)
  // Bug 2 fix: 订阅反应式值，而非 getState() 快照
  const commands = useCommandStore(s => s.commands)
  const selectedGroupId = useCommandStore(s => s.selectedGroupId)
  const getFilteredCommands = useCommandStore(s => s.getFilteredCommands)

  const filteredCommands = useMemo(() => getFilteredCommands(), [
    commands,
    selectedGroupId,
    searchQuery,
  ])

  return (
    <div className="flex flex-col h-full overflow-hidden p-4">
      {/* 搜索框 */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none z-10" />
        <input
          type="text"
          className="w-full bg-slate-800 border border-divider rounded-md py-2 text-sm text-text-primary placeholder:text-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          style={{ paddingLeft: '2.25rem', paddingRight: '0.75rem' }}
          placeholder="搜索命令..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* 命令卡片网格 */}
      <div className="flex-1 overflow-y-auto">
        {filteredCommands.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-text-secondary text-sm">
            {searchQuery.trim() ? '没有匹配的命令' : '该分组暂无命令'}
          </div>
        ) : (
          <div className="grid gap-3" style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          }}>
            {filteredCommands.map(cmd => (
              <CommandCard key={cmd.id} command={cmd} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

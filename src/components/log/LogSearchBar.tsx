import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { LogSearchOptions } from '../../types'

interface Props {
  query: string
  options: LogSearchOptions
  error: string | null
  matchedCount: number
  activeMatchIndex: number
  onQueryChange: (query: string) => void
  onOptionsChange: (options: Partial<LogSearchOptions>) => void
  onNavigate: (direction: 'next' | 'prev') => void
}

export default function LogSearchBar({
  query,
  options,
  error,
  matchedCount,
  activeMatchIndex,
  onQueryChange,
  onOptionsChange,
  onNavigate,
}: Props) {
  const activeLabel = matchedCount > 0 && activeMatchIndex >= 0
    ? `${activeMatchIndex + 1}/${matchedCount}`
    : '0/0'

  const toggleButtonClass = (active: boolean) =>
    `px-2 py-1 rounded text-xs border transition-colors ${
      active
        ? 'bg-primary/20 border-primary text-primary'
        : 'border-slate-700 text-text-secondary hover:bg-slate-700'
    }`

  return (
    <div className="flex items-center gap-2 px-3 h-9 bg-slate-900 border-b border-divider flex-shrink-0">
      <Search size={14} className="text-text-secondary flex-shrink-0" />
      <input
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onNavigate(e.shiftKey ? 'prev' : 'next')
          }
          if (e.key === 'Escape') {
            onQueryChange('')
          }
        }}
        placeholder="搜索日志..."
        className={`flex-1 bg-slate-800 rounded px-2 py-1 text-sm text-text-primary border focus:outline-none ${
          error ? 'border-red-500' : 'border-slate-700 focus:border-primary'
        }`}
      />
      <button
        className={toggleButtonClass(options.caseSensitive)}
        onClick={() => onOptionsChange({ caseSensitive: !options.caseSensitive })}
        title="大小写敏感"
      >
        Aa
      </button>
      <button
        className={toggleButtonClass(options.useRegex)}
        onClick={() => onOptionsChange({ useRegex: !options.useRegex })}
        title="正则模式"
      >
        .*
      </button>
      <span className={`text-xs w-16 text-center ${error ? 'text-red-400' : 'text-text-secondary'}`}>
        {error ?? activeLabel}
      </span>
      <button className="btn-ghost p-1 rounded" onClick={() => onNavigate('prev')} title="上一个匹配">
        <ChevronUp size={14} />
      </button>
      <button className="btn-ghost p-1 rounded" onClick={() => onNavigate('next')} title="下一个匹配">
        <ChevronDown size={14} />
      </button>
      {query && (
        <button className="btn-ghost p-1 rounded" onClick={() => onQueryChange('')} title="清空搜索">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

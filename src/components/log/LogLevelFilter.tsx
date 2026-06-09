import { LogLevel, LogStreamFilter } from '../../types'

interface Props {
  levelFilter: Set<LogLevel>
  streamFilter: LogStreamFilter
  onToggleLevel: (level: LogLevel) => void
  onClearLevels: () => void
  onStreamFilterChange: (filter: LogStreamFilter) => void
}

const LEVELS: Array<{ level: LogLevel; label: string; className: string }> = [
  { level: 'verbose', label: 'V', className: 'text-slate-400' },
  { level: 'debug', label: 'D', className: 'text-sky-400' },
  { level: 'info', label: 'I', className: 'text-green-400' },
  { level: 'warning', label: 'W', className: 'text-amber-400' },
  { level: 'error', label: 'E', className: 'text-red-400' },
]

export default function LogLevelFilter({
  levelFilter,
  streamFilter,
  onToggleLevel,
  onClearLevels,
  onStreamFilterChange,
}: Props) {
  const buttonClass = (active: boolean) =>
    `px-2 py-0.5 rounded text-xs border transition-colors ${
      active
        ? 'bg-primary/20 border-primary text-primary'
        : 'border-slate-700 hover:bg-slate-700 text-text-secondary'
    }`

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1">
        <span className="text-xs text-text-secondary">级别:</span>
        <button className={buttonClass(levelFilter.size === 0)} onClick={onClearLevels}>
          全
        </button>
        {LEVELS.map(item => (
          <button
            key={item.level}
            className={`${buttonClass(levelFilter.has(item.level))} ${levelFilter.has(item.level) ? '' : item.className}`}
            onClick={() => onToggleLevel(item.level)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <span className="text-xs text-text-secondary">流:</span>
        {(['all', 'stdout', 'stderr'] as LogStreamFilter[]).map(filter => (
          <button
            key={filter}
            className={buttonClass(streamFilter === filter)}
            onClick={() => onStreamFilterChange(filter)}
          >
            {filter === 'all' ? '全' : filter === 'stdout' ? 'out' : 'err'}
          </button>
        ))}
      </div>
    </div>
  )
}

import { LogLevel, LogLine, LogRenderItem, LogSearchOptions, LogSegment, LogStreamFilter } from '../types'

const THREADTIME_PATTERN = /^(?:\d{4}-)?\d{2}-\d{2}\s+[\d:.]+\s+(\d+)\s+\d+\s+([VDIWEFS])\s+([^:]+):/
const BRIEF_PATTERN = /^([VDIWEFS])\/(.*?)\(\s*(\d+)\):/
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '')
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function ansiToHtml(value: string): string {
  const colorStack: string[] = []
  let result = ''
  let lastIndex = 0
  const re = /\x1b\[([0-9;]*)m/g
  let match: RegExpExecArray | null

  const colorForCode: Record<string, string> = {
    '30': 'rgb(var(--slate-400))',
    '31': '#ef4444',
    '32': '#22c55e',
    '33': '#f59e0b',
    '34': '#3b82f6',
    '35': '#a855f7',
    '36': '#06b6d4',
    '37': 'rgb(var(--text-primary))',
    '90': '#64748b',
  }

  while ((match = re.exec(value)) !== null) {
    result += escapeHtml(value.slice(lastIndex, match.index))
    const codes = match[1].split(';').filter(Boolean)
    if (codes.length === 0 || codes.includes('0')) {
      while (colorStack.length > 0) {
        result += '</span>'
        colorStack.pop()
      }
    } else {
      const colorCode = codes.find(code => colorForCode[code])
      if (colorCode) {
        result += `<span style="color:${colorForCode[colorCode]}">`
        colorStack.push(colorCode)
      }
    }
    lastIndex = match.index + match[0].length
  }

  result += escapeHtml(value.slice(lastIndex))
  while (colorStack.length > 0) {
    result += '</span>'
    colorStack.pop()
  }
  return result
}

export function detectLogLevel(raw: string, stream: LogLine['stream']): LogLevel {
  if (stream === 'stderr') return 'error'
  if (stream === 'system') return 'unknown'

  const plain = stripAnsi(raw)
  const threadtime = THREADTIME_PATTERN.exec(plain)
  const brief = BRIEF_PATTERN.exec(plain)
  const logcatMatch = plain.match(/^\s*([VDIWEF])\s+[\w.]+\s*:/)
    ?? plain.match(/^\d{2}-\d{2}\s+[\d:.]+\s+\d+\s+\d+\s+([VDIWEF])\s+[\w./]+\s*:/)
  const priority = threadtime?.[2] ?? brief?.[1] ?? logcatMatch?.[1]
  if (priority) {
    const map: Record<string, LogLevel> = {
      V: 'verbose',
      D: 'debug',
      I: 'info',
      W: 'warning',
      E: 'error',
      F: 'error',
    }
    return map[priority] ?? 'unknown'
  }

  const lower = plain.toLowerCase()
  if (/\b(error|exception|fatal|failed|failure)\b/.test(lower)) return 'error'
  if (/\b(warn|warning)\b/.test(lower)) return 'warning'
  if (/\b(info|success|done|complete|completed)\b/.test(lower)) return 'info'
  if (/\b(debug)\b/.test(lower)) return 'debug'
  return 'unknown'
}

export function buildSearchRegex(query: string, options: LogSearchOptions): RegExp | null {
  if (!query.trim()) return null
  try {
    const pattern = options.useRegex ? query : escapeRegex(query)
    const flags = options.caseSensitive ? 'g' : 'gi'
    return new RegExp(pattern, flags)
  } catch {
    return null
  }
}

export function lineMatchesSearch(line: LogLine, regex: RegExp | null): boolean {
  if (!regex) return false
  regex.lastIndex = 0
  return regex.test(stripAnsi(line.raw))
}

export function getLogcatFields(text: string): { pid: string; tag: string } {
  const threadtime = THREADTIME_PATTERN.exec(text)
  if (threadtime) return { pid: threadtime[1], tag: threadtime[3].trim() }
  const brief = BRIEF_PATTERN.exec(text)
  return { pid: brief?.[3] ?? '', tag: brief?.[2].trim() ?? '' }
}

export function getVisibleLineIds(state: {
  lineOrder: string[]
  lines: Map<string, LogLine>
  segments: Map<string, LogSegment>
  levelFilter: Set<LogLevel>
  streamFilter: LogStreamFilter
  fieldFilter?: string
}): string[] {
  const collapsedCmdIds = new Set(
    Array.from(state.segments.values())
      .filter(segment => segment.isCollapsed)
      .map(segment => segment.cmdId),
  )

  const terms = (state.fieldFilter ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean)
  return state.lineOrder.filter(id => {
    const line = state.lines.get(id)
    if (!line) return false
    if (line.stream !== 'system' && collapsedCmdIds.has(line.cmdId)) return false
    if (state.levelFilter.size > 0 && !state.levelFilter.has(line.level)) return false
    if (state.streamFilter !== 'all' && line.stream !== 'system' && line.stream !== state.streamFilter) return false
    if (!terms.length) return true
    const plain = stripAnsi(line.raw)
    const { pid, tag } = getLogcatFields(plain)
    const lowerTag = tag.toLowerCase()
    return terms.every(term => {
      if (term.startsWith('pid:')) return pid === term.slice(4)
      if (term.startsWith('tag:')) return lowerTag.includes(term.slice(4))
      return plain.toLowerCase().includes(term)
    })
  })
}

export function buildRenderItems(state: {
  segmentOrder: string[]
  segments: Map<string, LogSegment>
  visibleLineIds: string[]
  segmentOrderDisplay?: 'asc' | 'desc'
}): LogRenderItem[] {
  const items: LogRenderItem[] = []
  const visibleLineIds = new Set(state.visibleLineIds)

  const orderedSegmentIds = state.segmentOrderDisplay === 'desc'
    ? [...state.segmentOrder].reverse()
    : state.segmentOrder

  for (const cmdId of orderedSegmentIds) {
    const segment = state.segments.get(cmdId)
    if (!segment) continue
    items.push({ type: 'segment-header', cmdId })
    if (!segment.isCollapsed) {
      for (const lineId of segment.lineIds) {
        if (visibleLineIds.has(lineId)) {
          items.push({ type: 'line', lineId })
        }
      }
    }
  }

  return items
}

export function getLineClassName(line: LogLine): string {
  if (line.stream === 'stderr') return 'text-error'
  const colors: Record<LogLevel, string> = {
    verbose: 'text-slate-500',
    debug: 'log-debug',
    info: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
    unknown: 'text-slate-300',
  }
  return colors[line.level]
}

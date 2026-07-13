import { LogLevel, LogLine, LogRenderItem, LogSearchOptions, LogSegment, LogStreamFilter } from '../types'

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
    '30': '#94a3b8',
    '31': '#ef4444',
    '32': '#22c55e',
    '33': '#f59e0b',
    '34': '#3b82f6',
    '35': '#a855f7',
    '36': '#06b6d4',
    '37': '#f1f5f9',
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
  const logcatMatch = plain.match(/^\s*([VDIWEF])\s+[\w.]+\s*:/)
    ?? plain.match(/^\d{2}-\d{2}\s+[\d:.]+\s+\d+\s+\d+\s+([VDIWEF])\s+[\w./]+\s*:/)
  if (logcatMatch) {
    const map: Record<string, LogLevel> = {
      V: 'verbose',
      D: 'debug',
      I: 'info',
      W: 'warning',
      E: 'error',
      F: 'error',
    }
    return map[logcatMatch[1]] ?? 'unknown'
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

export function getVisibleLineIds(state: {
  lineOrder: string[]
  lines: Map<string, LogLine>
  segments: Map<string, LogSegment>
  levelFilter: Set<LogLevel>
  streamFilter: LogStreamFilter
}): string[] {
  const collapsedCmdIds = new Set(
    Array.from(state.segments.values())
      .filter(segment => segment.isCollapsed)
      .map(segment => segment.cmdId),
  )

  return state.lineOrder.filter(id => {
    const line = state.lines.get(id)
    if (!line) return false
    if (line.stream !== 'system' && collapsedCmdIds.has(line.cmdId)) return false
    if (state.levelFilter.size > 0 && !state.levelFilter.has(line.level)) return false
    if (state.streamFilter !== 'all' && line.stream !== 'system' && line.stream !== state.streamFilter) return false
    return true
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
  if (line.stream === 'stderr') return 'text-red-400'
  const colors: Record<LogLevel, string> = {
    verbose: 'text-slate-500',
    debug: 'text-sky-400',
    info: 'text-green-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
    unknown: 'text-slate-300',
  }
  return colors[line.level]
}

export function injectSearchHighlight(html: string, raw: string, regex: RegExp | null): string {
  if (!regex) return html
  const plain = stripAnsi(raw)
  regex.lastIndex = 0
  const matches = Array.from(plain.matchAll(regex))
    .map(match => match[0])
    .filter(Boolean)
  if (matches.length === 0) return html

  let result = html
  for (const matchText of Array.from(new Set(matches))) {
    const escaped = escapeHtml(matchText)
    result = result.replace(
      new RegExp(escapeRegex(escaped), 'g'),
      `<mark class="bg-yellow-300/40 text-inherit rounded px-0.5">${escaped}</mark>`,
    )
  }
  return result
}

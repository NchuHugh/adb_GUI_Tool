import type { LogLine, LogSegment } from '../types'
import { detectLogLevel } from './logUtils'

const FORMAT = 'adb-gui-log'
const LEGACY_PREFIX = '命令: '
const LEGACY_SEPARATOR = /\n\n-{40}\n\n(?=命令: )/
const REASONS = new Set(['normal', 'timeout', 'killed', 'adb_unavailable'])

export const MAX_LOG_FILE_BYTES = 128 * 1024 * 1024

type ArchiveLine = [stream: 'stdout' | 'stderr', raw: string, timestamp: number]
type ArchiveSegment = Omit<LogSegment, 'cmdId' | 'lineIds' | 'isCollapsed' | 'execution'> & { lines: ArchiveLine[] }

interface LogData {
  lines: Map<string, LogLine>
  segments: Map<string, LogSegment>
  segmentOrder: string[]
  lineOrder: string[]
  lineSeq: number
  textSize: number
}

export function serializeLogArchive(data: Pick<LogData, 'lines' | 'segments' | 'segmentOrder'> & {
  segmentOrderDisplay: 'asc' | 'desc'
}): string {
  const order = data.segmentOrderDisplay === 'desc' ? [...data.segmentOrder].reverse() : data.segmentOrder
  const segments = order.flatMap(id => {
    const segment = data.segments.get(id)
    if (!segment) return []
    const lines: ArchiveLine[] = []
    for (const lineId of segment.lineIds) {
      const line = data.lines.get(lineId)
      if (line && line.stream !== 'system') lines.push([line.stream, line.raw, line.timestamp])
    }
    const { commandLabel, resolvedCommand, startedAt, endedAt, exitCode, reason } = segment
    return [{ commandLabel, resolvedCommand, startedAt, endedAt, exitCode, reason, lines }]
  })

  // One line per command keeps the document readable without indenting every log entry.
  return `{"format":"${FORMAT}","version":1,"segments":[\n${segments.map(segment => JSON.stringify(segment)).join(',\n')}\n]}\n`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 8.64e15
}

function isArchiveSegment(value: unknown): value is ArchiveSegment {
  return isRecord(value) &&
    typeof value.commandLabel === 'string' && typeof value.resolvedCommand === 'string' &&
    isTimestamp(value.startedAt) && (value.endedAt === undefined || isTimestamp(value.endedAt)) &&
    (value.exitCode === undefined || Number.isInteger(value.exitCode)) &&
    (value.reason === undefined || (typeof value.reason === 'string' && REASONS.has(value.reason))) &&
    Array.isArray(value.lines) && value.lines.every(line => Array.isArray(line) && line.length === 3 &&
      (line[0] === 'stdout' || line[0] === 'stderr') && typeof line[1] === 'string' && isTimestamp(line[2]))
}

function parseSegments(text: string): ArchiveSegment[] {
  const content = text.replace(/^\uFEFF/, '')
  if (content.startsWith(LEGACY_PREFIX)) {
    return content.replace(/\r\n/g, '\n').split(LEGACY_SEPARATOR).map(block => {
      const [header, ...output] = block.split('\n')
      const command = header.slice(LEGACY_PREFIX.length)
      return {
        commandLabel: command,
        resolvedCommand: command,
        startedAt: 0,
        endedAt: 0,
        lines: output.map(raw => ['stdout', raw, 0]),
      }
    })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('无法识别此日志，请选择 ADB GUI 导出的 .log 文件')
  }
  if (!isRecord(parsed) || parsed.format !== FORMAT || parsed.version !== 1 ||
    !Array.isArray(parsed.segments) || !parsed.segments.every(isArchiveSegment)) {
    throw new Error('日志版本不受支持或文件内容已损坏')
  }
  return parsed.segments
}

export function parseLogArchive(text: string): LogData {
  const data: LogData = {
    lines: new Map(),
    segments: new Map(),
    segmentOrder: [],
    lineOrder: [],
    lineSeq: 0,
    textSize: 0,
  }
  for (const { lines, ...segment } of parseSegments(text)) {
    const cmdId = `archive-${data.segmentOrder.length}`
    const lineIds: string[] = []
    for (const [stream, raw, timestamp] of lines) {
      if (data.lineSeq >= 100_000) throw new Error('日志超过 100,000 行，无法打开')
      const id = String(data.lineSeq++).padStart(6, '0')
      data.textSize += raw.length
      data.lineOrder.push(id)
      lineIds.push(id)
      data.lines.set(id, { id, cmdId, stream, raw, timestamp, level: detectLogLevel(raw, stream) })
    }
    data.segmentOrder.push(cmdId)
    data.segments.set(cmdId, {
      ...segment,
      cmdId,
      lineIds,
      endedAt: segment.endedAt ?? segment.startedAt,
      isCollapsed: false,
    })
  }
  return data
}

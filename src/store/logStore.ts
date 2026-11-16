import { create } from 'zustand'
import {
  DoneEvent,
  HistoryEntry,
  LogLevel,
  LogLine,
  LogSearchOptions,
  LogSegment,
  LogStreamFilter,
} from '../types'
import { buildSearchRegex, detectLogLevel, getVisibleLineIds, lineMatchesSearch, stripAnsi } from '../utils/logUtils'

interface LogStore {
  lines: Map<string, LogLine>
  lineOrder: string[]
  lineSeq: number
  textSize: number
  segments: Map<string, LogSegment>
  segmentOrder: string[]

  searchQuery: string
  searchOptions: LogSearchOptions
  searchError: string | null
  matchedLineIds: string[]
  activeMatchIndex: number

  levelFilter: Set<LogLevel>
  fieldFilter: string
  streamFilter: LogStreamFilter
  scrollTargetLineId: string | null

  // Phase 6: 日志面板布局
  logPanelHeight: number

  // Phase 7 N2: 日志分段排列顺序（'asc' = 正序，'desc' = 逆序）
  segmentOrderDisplay: 'asc' | 'desc'

  // 历史记录（最多 50 条）
  history: HistoryEntry[]

  // 日志面板自动滚动
  autoScroll: boolean

  // 历史面板开关
  isHistoryOpen: boolean

  // F4: 输出缓存（commandId → 最近一次完整输出文本，最多 20 条）
  outputCache: Map<string, string>

  // 动作
  appendLine: (line: Omit<LogLine, 'id' | 'level'>) => void
  appendLines: (partials: Array<Omit<LogLine, 'id' | 'level'>>) => void
  openSegment: (cmdId: string, meta: Pick<LogSegment, 'commandLabel' | 'resolvedCommand' | 'startedAt' | 'execution'>) => void
  closeSegment: (cmdId: string, exitCode: number, reason: DoneEvent['reason']) => void
  toggleSegment: (cmdId: string) => void
  deleteSegment: (cmdId: string) => void
  collapseAll: () => void
  expandAll: () => void
  toggleSegmentOrder: () => void
  setSearchQuery: (query: string) => void
  setSearchOptions: (options: Partial<LogSearchOptions>) => void
  navigateMatch: (direction: 'next' | 'prev') => void
  setLevelFilter: (levels: Set<LogLevel>) => void
  toggleLevelFilter: (level: LogLevel) => void
  setFieldFilter: (filter: string) => void
  setStreamFilter: (filter: LogStreamFilter) => void
  clearLog: () => void
  consumeScrollTarget: () => void
  addEntry: (entry: HistoryEntry) => void
  loadHistory: () => Promise<void>
  persistHistory: () => Promise<void>
  clearHistory: () => void
  toggleHistory: () => void
  setAutoScroll: (auto: boolean) => void
  setOutputCache: (commandId: string, output: string) => void
  getOutputCache: (commandId: string) => string | undefined
  getSegmentText: (cmdId: string) => string
  setLogPanelHeight: (height: number) => void
  resizeLogPanel: (deltaY: number) => void
}

function computeMatches(state: Pick<LogStore, 'searchQuery' | 'searchOptions' | 'lineOrder' | 'lines' | 'segments' | 'levelFilter' | 'streamFilter' | 'fieldFilter'>): {
  matchedLineIds: string[]
  activeMatchIndex: number
  searchError: string | null
} {
  if (!state.searchQuery.trim()) {
    return { matchedLineIds: [], activeMatchIndex: -1, searchError: null }
  }

  const regex = buildSearchRegex(state.searchQuery, state.searchOptions)
  if (!regex) {
    return { matchedLineIds: [], activeMatchIndex: -1, searchError: '正则错误' }
  }

  const visibleLineIds = getVisibleLineIds(state)
  const matchedLineIds = visibleLineIds.filter(id => {
    const line = state.lines.get(id)
    return line ? lineMatchesSearch(line, regex) : false
  })

  return {
    matchedLineIds,
    activeMatchIndex: matchedLineIds.length > 0 ? 0 : -1,
    searchError: null,
  }
}

export const createLogStore = (persistLayout = true) => create<LogStore>((set, get) => ({
  lines: new Map(),
  lineOrder: [],
  lineSeq: 0,
  textSize: 0,
  segments: new Map(),
  segmentOrder: [],
  searchQuery: '',
  searchOptions: { caseSensitive: false, useRegex: false },
  searchError: null,
  matchedLineIds: [],
  activeMatchIndex: -1,
  levelFilter: new Set(),
  streamFilter: 'all',
  fieldFilter: '',
  scrollTargetLineId: null,
  logPanelHeight: (() => {
    const saved = localStorage.getItem('logPanelHeight')
    return saved ? parseInt(saved, 10) : 280
  })(),
  segmentOrderDisplay: (() => {
    const saved = persistLayout && localStorage.getItem('logSegmentOrder')
    return saved === 'desc' ? 'desc' : 'asc'
  })(),
  history: [],
  autoScroll: true,
  isHistoryOpen: false,
  outputCache: new Map(),

  appendLine: (partial) => {
    get().appendLines([partial])
  },

  appendLines: (partials) => {
    if (partials.length === 0) return

    set((state) => {
      const lines = new Map(state.lines)
      let lineOrder = [...state.lineOrder]
      let lineSeq = state.lineSeq
      let textSize = state.textSize
      const segments = new Map(state.segments)
      const appendedBySegment = new Map<string, string[]>()

      for (const partial of partials) {
        if (partial.raw === '' || !segments.has(partial.cmdId)) continue

        const id = String(lineSeq).padStart(6, '0')
        lineSeq += 1
        const line: LogLine = {
          ...partial,
          id,
          level: detectLogLevel(partial.raw, partial.stream),
        }
        lines.set(id, line)
        textSize += line.raw.length
        lineOrder.push(id)

        const appended = appendedBySegment.get(partial.cmdId)
        if (appended) appended.push(id)
        else appendedBySegment.set(partial.cmdId, [id])
      }

      for (const [cmdId, ids] of appendedBySegment) {
        const segment = segments.get(cmdId)
        if (segment) segments.set(cmdId, { ...segment, lineIds: segment.lineIds.concat(ids) })
      }

      let removeCount = 0
      if (lineOrder.length > 100_000 || textSize > 16_000_000) {
        while (
          removeCount < lineOrder.length &&
          (lineOrder.length - removeCount > 95_000 || textSize > 15_000_000)
        ) {
          const id = lineOrder[removeCount++]
          textSize -= lines.get(id)?.raw.length ?? 0
          lines.delete(id)
        }
        lineOrder = lineOrder.slice(removeCount)
        for (const [cmdId, current] of segments) {
          segments.set(cmdId, {
            ...current,
            lineIds: current.lineIds.filter(lineId => lines.has(lineId)),
          })
        }
      }

      if (lineSeq === state.lineSeq || !state.searchQuery.trim() || state.searchError) {
        return { lines, lineOrder, lineSeq, textSize, segments }
      }

      const regex = buildSearchRegex(state.searchQuery, state.searchOptions)
      const newMatches = getVisibleLineIds({
        ...state,
        lineOrder: lineOrder.slice(-Math.min(lineSeq - state.lineSeq, lineOrder.length)).filter(id => !state.lines.has(id)),
        lines,
        segments,
      }).filter(id => lineMatchesSearch(lines.get(id)!, regex))
      const previousMatches = removeCount > 0
        ? state.matchedLineIds.filter(id => lines.has(id))
        : state.matchedLineIds
      if (!newMatches.length && previousMatches === state.matchedLineIds) {
        return { lines, lineOrder, lineSeq, textSize, segments }
      }
      const matchedLineIds = previousMatches.concat(newMatches)
      const activeId = state.matchedLineIds[state.activeMatchIndex]
      const activeMatchIndex = activeId ? matchedLineIds.indexOf(activeId) : -1
      return {
        lines,
        lineOrder,
        lineSeq,
        textSize,
        segments,
        matchedLineIds,
        activeMatchIndex: activeMatchIndex >= 0 ? activeMatchIndex : matchedLineIds.length ? 0 : -1,
      }
    })
  },

  openSegment: (cmdId, meta) => {
    set((state) => {
      if (state.segments.has(cmdId)) return {}
      const segments = new Map(state.segments)
      segments.set(cmdId, {
        ...meta,
        cmdId,
        lineIds: [],
        isCollapsed: false,
      })
      return { segments, segmentOrder: [...state.segmentOrder, cmdId] }
    })
  },

  closeSegment: (cmdId, exitCode, reason) => {
    set((state) => {
      const existing = state.segments.get(cmdId)
      if (!existing) return {}
      const segments = new Map(state.segments)
      segments.set(cmdId, { ...existing, endedAt: Date.now(), exitCode, reason })
      return { segments }
    })
  },

  deleteSegment: (cmdId) => {
    const segment = get().segments.get(cmdId)
    if (!segment) return

    const deletedSet = new Set(segment.lineIds)

    const newLines = new Map(get().lines)
    let textSize = get().textSize
    for (const lineId of segment.lineIds) {
      textSize -= newLines.get(lineId)?.raw.length ?? 0
      newLines.delete(lineId)
    }

    const newLineOrder = get().lineOrder.filter(id => !deletedSet.has(id))

    const newSegments = new Map(get().segments)
    newSegments.delete(cmdId)
    const newSegmentOrder = get().segmentOrder.filter(id => id !== cmdId)

    const newOutputCache = new Map(get().outputCache)
    newOutputCache.delete(cmdId)

    const newMatchedLineIds = get().matchedLineIds.filter(id => !deletedSet.has(id))
    const newActiveMatchIndex = Math.min(
      get().activeMatchIndex,
      newMatchedLineIds.length - 1,
    )

    set({
      lines: newLines,
      textSize,
      lineOrder: newLineOrder,
      segments: newSegments,
      segmentOrder: newSegmentOrder,
      outputCache: newOutputCache,
      matchedLineIds: newMatchedLineIds,
      activeMatchIndex: Math.max(-1, newActiveMatchIndex),
    })
  },

  toggleSegment: (cmdId) => {
    set((state) => {
      const segment = state.segments.get(cmdId)
      if (!segment) return {}
      const segments = new Map(state.segments)
      segments.set(cmdId, { ...segment, isCollapsed: !segment.isCollapsed })
      const nextState = { ...state, segments }
      return { segments, ...computeMatches(nextState) }
    })
  },

  collapseAll: () => {
    set((state) => {
      const segments = new Map(Array.from(state.segments.entries()).map(([id, segment]) => [id, { ...segment, isCollapsed: true }]))
      const nextState = { ...state, segments }
      return { segments, ...computeMatches(nextState) }
    })
  },

  expandAll: () => {
    set((state) => {
      const segments = new Map(Array.from(state.segments.entries()).map(([id, segment]) => [id, { ...segment, isCollapsed: false }]))
      const nextState = { ...state, segments }
      return { segments, ...computeMatches(nextState) }
    })
  },

  toggleSegmentOrder: () => {
    const next = get().segmentOrderDisplay === 'asc' ? 'desc' : 'asc'
    if (persistLayout) localStorage.setItem('logSegmentOrder', next)
    set({ segmentOrderDisplay: next })
  },

  setSearchQuery: (searchQuery) => {
    set((state) => {
      const nextState = { ...state, searchQuery }
      return { searchQuery, ...computeMatches(nextState) }
    })
  },

  setSearchOptions: (options) => {
    set((state) => {
      const searchOptions = { ...state.searchOptions, ...options }
      const nextState = { ...state, searchOptions }
      return { searchOptions, ...computeMatches(nextState) }
    })
  },

  navigateMatch: (direction) => {
    const state = get()
    if (state.matchedLineIds.length === 0) return
    const nextIndex = direction === 'next'
      ? (state.activeMatchIndex + 1) % state.matchedLineIds.length
      : (state.activeMatchIndex - 1 + state.matchedLineIds.length) % state.matchedLineIds.length
    const targetLineId = state.matchedLineIds[nextIndex]
    const targetLine = state.lines.get(targetLineId)
    const segments = new Map(state.segments)
    if (targetLine) {
      const segment = segments.get(targetLine.cmdId)
      if (segment?.isCollapsed) {
        segments.set(segment.cmdId, { ...segment, isCollapsed: false })
      }
    }
    set({ autoScroll: false, activeMatchIndex: nextIndex, scrollTargetLineId: targetLineId, segments })
  },

  setLevelFilter: (levelFilter) => {
    set((state) => {
      const nextState = { ...state, levelFilter }
      return { levelFilter, ...computeMatches(nextState) }
    })
  },

  toggleLevelFilter: (level) => {
    const current = get().levelFilter
    const next = new Set(current)
    if (current.size === 0) {
      next.add(level)
    } else if (next.has(level)) {
      next.delete(level)
    } else {
      next.add(level)
    }
    get().setLevelFilter(next)
  },

  setFieldFilter: fieldFilter => set(state => ({
    fieldFilter,
    ...computeMatches({ ...state, fieldFilter }),
  })),

  setStreamFilter: (streamFilter) => {
    set((state) => {
      const nextState = { ...state, streamFilter }
      return { streamFilter, ...computeMatches(nextState) }
    })
  },

  clearLog: () => set({
    lines: new Map(),
    lineOrder: [],
    lineSeq: 0,
    textSize: 0,
    segments: new Map(),
    segmentOrder: [],
    matchedLineIds: [],
    activeMatchIndex: -1,
    scrollTargetLineId: null,
  }),

  consumeScrollTarget: () => set({ scrollTargetLineId: null }),

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

  getSegmentText: (cmdId) => {
    const { lines, segments } = get()
    const segment = segments.get(cmdId)
    if (!segment) return ''
    return segment.lineIds
      .map(id => lines.get(id))
      .filter((line): line is LogLine => !!line && line.stream !== 'system')
      .map(line => stripAnsi(line.raw))
      .join('\n')
  },

  setLogPanelHeight: (logPanelHeight) => {
    localStorage.setItem('logPanelHeight', String(Math.round(logPanelHeight)))
    set({ logPanelHeight })
  },

  resizeLogPanel: (deltaY) => {
    const MIN_LOG_HEIGHT = 80
    const MAX_LOG_HEIGHT_RATIO = 0.7
    set((state) => {
      const maxH = window.innerHeight * MAX_LOG_HEIGHT_RATIO
      const next = Math.min(maxH, Math.max(MIN_LOG_HEIGHT, state.logPanelHeight + deltaY))
      localStorage.setItem('logPanelHeight', String(Math.round(next)))
      return { logPanelHeight: next }
    })
  },
}))

export const useLogStore = createLogStore()

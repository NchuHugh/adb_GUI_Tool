import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useLogStore } from '../../store/logStore'
import { buildRenderItems, getVisibleLineIds } from '../../utils/logUtils'
import LogLine from './LogLine'
import LogSegmentHeader from './LogSegmentHeader'

const HEADER_HEIGHT = 40
const LINE_HEIGHT = 22
const OVERSCAN = 20

function throttle<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let last = 0
  return ((...args: Parameters<T>) => {
    const now = Date.now()
    if (now - last >= ms) {
      last = now
      fn(...args)
    }
  }) as T
}

export default function LogContent() {
  const parentRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(240)

  const lines = useLogStore(s => s.lines)
  const lineOrder = useLogStore(s => s.lineOrder)
  const segments = useLogStore(s => s.segments)
  const segmentOrder = useLogStore(s => s.segmentOrder)
  const levelFilter = useLogStore(s => s.levelFilter)
  const streamFilter = useLogStore(s => s.streamFilter)
  const autoScroll = useLogStore(s => s.autoScroll)
  const searchQuery = useLogStore(s => s.searchQuery)
  const searchOptions = useLogStore(s => s.searchOptions)
  const matchedLineIds = useLogStore(s => s.matchedLineIds)
  const activeMatchIndex = useLogStore(s => s.activeMatchIndex)
  const scrollTargetLineId = useLogStore(s => s.scrollTargetLineId)
  const toggleSegment = useLogStore(s => s.toggleSegment)
  const consumeScrollTarget = useLogStore(s => s.consumeScrollTarget)

  const deferredLineOrder = useDeferredValue(lineOrder)

  const renderItems = useMemo(() => {
    const visibleLineIds = getVisibleLineIds({
      lineOrder: deferredLineOrder,
      lines,
      segments,
      levelFilter,
      streamFilter,
    })
    return buildRenderItems({ segmentOrder, segments, visibleLineIds })
  }, [deferredLineOrder, lines, segments, segmentOrder, levelFilter, streamFilter])

  const offsets = useMemo(() => {
    const result: number[] = []
    let total = 0
    for (const item of renderItems) {
      result.push(total)
      if (item.type === 'segment-header') {
        total += HEADER_HEIGHT
      } else {
        const raw = lines.get(item.lineId)?.raw ?? ''
        total += raw.length > 140 ? LINE_HEIGHT * 2 : LINE_HEIGHT
      }
    }
    return { offsets: result, totalHeight: total }
  }, [renderItems, lines])

  const visibleRange = useMemo(() => {
    const firstVisible = offsets.offsets.findIndex((offset, index) => {
      const nextOffset = offsets.offsets[index + 1] ?? offsets.totalHeight
      return nextOffset >= scrollTop
    })
    const lastVisible = offsets.offsets.findIndex(offset => offset > scrollTop + viewportHeight)
    const start = Math.max(0, (firstVisible === -1 ? renderItems.length - 1 : firstVisible) - OVERSCAN)
    const end = Math.min(renderItems.length, (lastVisible === -1 ? renderItems.length : lastVisible) + OVERSCAN)
    return { start, end }
  }, [offsets, renderItems.length, scrollTop, viewportHeight])

  useEffect(() => {
    const element = parentRef.current
    if (!element) return
    const updateSize = () => setViewportHeight(element.clientHeight || 240)
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const scrollToBottom = useCallback(
    throttle(() => {
      if (!autoScroll || renderItems.length === 0) return
      const element = parentRef.current
      if (!element) return
      element.scrollTop = Math.max(0, offsets.totalHeight - element.clientHeight)
    }, 100),
    [autoScroll, renderItems.length, offsets.totalHeight],
  )

  useEffect(() => {
    scrollToBottom()
  }, [renderItems.length, scrollToBottom])

  useEffect(() => {
    if (!scrollTargetLineId) return
    const index = renderItems.findIndex(item => item.type === 'line' && item.lineId === scrollTargetLineId)
    if (index !== -1 && parentRef.current) {
      parentRef.current.scrollTop = offsets.offsets[index] ?? 0
    }
    consumeScrollTarget()
  }, [scrollTargetLineId, renderItems, offsets.offsets, consumeScrollTarget])

  const matchedSet = useMemo(() => new Set(matchedLineIds), [matchedLineIds])
  const activeLineId = activeMatchIndex >= 0 ? matchedLineIds[activeMatchIndex] : null

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-auto bg-slate-950 font-mono"
      onScroll={event => setScrollTop(event.currentTarget.scrollTop)}
    >
      {renderItems.length === 0 ? (
        <div className="h-full flex items-center justify-center text-sm text-slate-500">
          暂无日志输出
        </div>
      ) : (
        <div style={{ height: offsets.totalHeight, position: 'relative' }}>
          {renderItems.slice(visibleRange.start, visibleRange.end).map((item, localIndex) => {
            const index = visibleRange.start + localIndex
            const top = offsets.offsets[index] ?? 0
            return (
              <div
                key={item.type === 'segment-header' ? `segment-${item.cmdId}` : `line-${item.lineId}`}
                style={{ position: 'absolute', top, left: 0, right: 0 }}
              >
                {item.type === 'segment-header' ? (
                  <LogSegmentHeader segment={segments.get(item.cmdId)!} onToggle={toggleSegment} />
                ) : (
                  lines.get(item.lineId) && (
                    <LogLine
                      line={lines.get(item.lineId)!}
                      searchQuery={searchQuery}
                      caseSensitive={searchOptions.caseSensitive}
                      useRegex={searchOptions.useRegex}
                      isMatched={matchedSet.has(item.lineId)}
                      isActiveMatch={activeLineId === item.lineId}
                    />
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

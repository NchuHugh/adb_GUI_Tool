import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePanelLogStore } from '../LogPanelStore'
import { buildSearchRegex, getVisibleLineIds } from '../../utils/logUtils'
import LogLine from './LogLine'
import LogSegmentHeader from './LogSegmentHeader'

const HEADER_HEIGHT = 40
const OVERSCAN_PX = 440

export default function LogContent({ fontSize, archive }: { fontSize: number; archive?: boolean }) {
  const lineHeight = fontSize + 10
  const parentRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(240)
  const lines = usePanelLogStore(s => s.lines)
  const segments = usePanelLogStore(s => s.segments)
  const segmentOrder = usePanelLogStore(s => s.segmentOrder)
  const segmentOrderDisplay = usePanelLogStore(s => s.segmentOrderDisplay)
  const levelFilter = usePanelLogStore(s => s.levelFilter)
  const streamFilter = usePanelLogStore(s => s.streamFilter)
  const fieldFilter = usePanelLogStore(s => s.fieldFilter)
  const autoScroll = usePanelLogStore(s => s.autoScroll)
  const searchQuery = usePanelLogStore(s => s.searchQuery)
  const searchOptions = usePanelLogStore(s => s.searchOptions)
  const matchedLineIds = usePanelLogStore(s => s.matchedLineIds)
  const activeMatchIndex = usePanelLogStore(s => s.activeMatchIndex)
  const scrollTargetLineId = usePanelLogStore(s => s.scrollTargetLineId)
  const toggleSegment = usePanelLogStore(s => s.toggleSegment)
  const consumeScrollTarget = usePanelLogStore(s => s.consumeScrollTarget)

  const layout = useMemo(() => {
    const filtered = levelFilter.size > 0 || streamFilter !== 'all' || fieldFilter.trim() !== ''
    const ordered = segmentOrderDisplay === 'desc' ? [...segmentOrder].reverse() : segmentOrder
    let height = 0
    const blocks = ordered.flatMap(cmdId => {
      const segment = segments.get(cmdId)
      if (!segment) return []
      const lineIds = segment.isCollapsed ? [] : filtered
        ? getVisibleLineIds({ lineOrder: segment.lineIds, lines, segments, levelFilter, streamFilter, fieldFilter })
        : segment.lineIds
      const top = height
      height += HEADER_HEIGHT + lineIds.length * lineHeight
      return [{ segment, lineIds, top, end: height }]
    })
    return { blocks, height }
  }, [lines, segments, segmentOrder, segmentOrderDisplay, levelFilter, streamFilter, fieldFilter, lineHeight])

  useEffect(() => {
    const element = parentRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const liveEnd = segmentOrderDisplay === 'desc' ? layout.blocks[0]?.end ?? 0 : layout.height
  useLayoutEffect(() => {
    const element = parentRef.current
    if (!element || !autoScroll || scrollTargetLineId) return
    element.scrollTop = Math.max(0, liveEnd - element.clientHeight)
    setScrollTop(element.scrollTop)
  }, [autoScroll, liveEnd, viewportHeight, scrollTargetLineId])

  useLayoutEffect(() => {
    if (!scrollTargetLineId) return
    const element = parentRef.current
    const line = lines.get(scrollTargetLineId)
    const block = layout.blocks.find(item => item.segment.cmdId === line?.cmdId)
    const index = block?.lineIds.indexOf(scrollTargetLineId) ?? -1
    if (element && block && index >= 0) {
      element.scrollTop = block.top + HEADER_HEIGHT + index * lineHeight
      setScrollTop(element.scrollTop)
    }
    consumeScrollTarget()
  }, [scrollTargetLineId, layout.blocks, lines, consumeScrollTarget, lineHeight])

  const regex = useMemo(() => buildSearchRegex(searchQuery, searchOptions), [searchQuery, searchOptions])
  const matchedSet = useMemo(() => new Set(matchedLineIds), [matchedLineIds])
  const activeLineId = matchedLineIds[activeMatchIndex]
  const start = Math.max(0, Math.min(scrollTop, layout.height - viewportHeight) - OVERSCAN_PX)
  const end = start + viewportHeight + 2 * OVERSCAN_PX

  return (
    <div
      ref={parentRef}
      className="flex-1 min-h-0 overflow-auto bg-slate-950 font-mono [overflow-anchor:none]"
      style={{ fontSize, lineHeight: `${lineHeight}px` }}
      onScroll={event => setScrollTop(event.currentTarget.scrollTop)}
    >
      {layout.blocks.length === 0 ? (
        <div className="h-full flex items-center justify-center text-sm text-slate-500">
          暂无日志输出
        </div>
      ) : (
        <div style={{ height: layout.height, position: 'relative' }}>
          {layout.blocks.filter(block => block.end > start && block.top < end).map(block => {
            const { segment, lineIds, top } = block
            const bodyTop = top + HEADER_HEIGHT
            const first = Math.max(0, Math.floor((start - bodyTop) / lineHeight))
            const last = Math.min(lineIds.length, Math.ceil((end - bodyTop) / lineHeight))
            return (
              <div key={segment.cmdId}>
                {top >= start - HEADER_HEIGHT && (
                  <div className="absolute inset-x-0" style={{ top, height: HEADER_HEIGHT }}>
                    <LogSegmentHeader segment={segment} onToggle={toggleSegment} allowReplay={!archive} />
                  </div>
                )}
                {lineIds.slice(first, Math.max(first, last)).map((id, index) => {
                  const line = lines.get(id)
                  return line && (
                    <div key={id} className="absolute left-0 min-w-full w-max" style={{
                      top: bodyTop + (first + index) * lineHeight,
                      height: lineHeight,
                    }}>
                      <LogLine line={line} regex={regex} isMatched={matchedSet.has(id)} isActiveMatch={activeLineId === id} />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

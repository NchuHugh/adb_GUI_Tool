import { describe, expect, it } from 'vitest'
import { parseLogArchive, serializeLogArchive } from './logArchive'

describe('log archives', () => {
  it('reads old exports as separate command segments with unknown execution status', () => {
    const data = parseLogArchive('命令: adb devices\r\nlist\r\n\r\n----------------------------------------\r\n\r\n命令: fastboot devices')
    expect([...data.segments.values()].map(segment => segment.resolvedCommand))
      .toEqual(['adb devices', 'fastboot devices'])
    expect([...data.segments.values()].map(segment => segment.lineIds.length)).toEqual([1, 0])
    expect(data.segments.get('archive-0')?.exitCode).toBeUndefined()
  })

  it('round-trips metadata, raw stderr and command-looking text in output', () => {
    const stderr = 'first\n\n----------------------------------------\n\n命令: fake'
    const data = parseLogArchive(JSON.stringify({ format: 'adb-gui-log', version: 1, segments: [
      {
        commandLabel: 'Shell', resolvedCommand: 'adb shell echo\npwd', startedAt: 12, endedAt: 34,
        exitCode: 1, reason: 'normal', lines: [['stderr', stderr, 23]],
      },
      { commandLabel: 'ADB', resolvedCommand: 'adb version', startedAt: 56, lines: [] },
    ] }))
    const roundTrip = parseLogArchive(serializeLogArchive({ ...data, segmentOrderDisplay: 'desc' }))
    expect([...roundTrip.segments.values()].map(segment => segment.commandLabel)).toEqual(['ADB', 'Shell'])
    expect(roundTrip.segments.get('archive-1')).toMatchObject({ startedAt: 12, endedAt: 34, exitCode: 1, reason: 'normal' })
    expect(roundTrip.lines.get('000000')).toMatchObject({ raw: stderr, timestamp: 23, stream: 'stderr' })
  })

  it('rejects unsupported or damaged files', () => {
    expect(() => parseLogArchive('not a log')).toThrow()
    expect(() => parseLogArchive('{"format":"adb-gui-log","version":2,"segments":[]}')).toThrow()
  })
})

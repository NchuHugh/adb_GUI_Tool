export const MIN_LOG_FONT_SIZE = 10
export const MAX_LOG_FONT_SIZE = 20
export const DEFAULT_LOG_FONT_SIZE = 12

export function clampLogFontSize(size: number): number {
  return Math.max(MIN_LOG_FONT_SIZE, Math.min(MAX_LOG_FONT_SIZE, Math.round(size)))
}

export function parseLogFontSize(input: string, current: number): number {
  const value = input.trim()
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)
    ? clampLogFontSize(Number(value))
    : current
}

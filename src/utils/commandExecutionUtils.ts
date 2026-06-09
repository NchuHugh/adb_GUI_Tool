import { CommandDef, DoneEvent } from '../types'

const DANGEROUS_COMMAND_IDS = new Set([
  'adb_root',
  'adb_unroot',
  'adb_remount',
  'adb_reboot',
  'adb_reboot_bootloader',
  'adb_reboot_recovery',
  'adb_rm',
  'adb_uninstall',
  'adb_am_clear_data',
  'adb_am_force_stop',
  'adb_forward_remove',
])

export function isDangerousCommand(commandId: string): boolean {
  return DANGEROUS_COMMAND_IDS.has(commandId)
}

export function confirmDangerousCommand(command: CommandDef): boolean {
  if (!isDangerousCommand(command.id)) return true
  return window.confirm(`确认执行「${command.label}」？\n\n${command.description}\n\n此操作可能产生不可逆的影响，是否继续？`)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractEmbeddedValues(patternToken: string, actualToken: string): Record<string, string> {
  const keys: string[] = []
  let pattern = '^'
  let lastIndex = 0
  const placeholderRe = /\{(\w+)\}/g
  let match: RegExpExecArray | null

  while ((match = placeholderRe.exec(patternToken)) !== null) {
    pattern += escapeRegExp(patternToken.slice(lastIndex, match.index))
    pattern += '(.+?)'
    keys.push(match[1])
    lastIndex = match.index + match[0].length
  }

  pattern += escapeRegExp(patternToken.slice(lastIndex))
  pattern += '$'

  const actualMatch = actualToken.match(new RegExp(pattern))
  if (!actualMatch) return {}

  return Object.fromEntries(keys.map((key, index) => [key, actualMatch[index + 1] ?? '']))
}

export function buildInitialValuesFromResolvedArgs(
  command: CommandDef,
  resolvedArgs: string[],
): Record<string, string> {
  const values: Record<string, string> = {}
  for (const param of command.params) {
    values[param.key] = param.default ?? ''
  }

  const templateArgs = command.template.trim().split(/\s+/).slice(1)
  templateArgs.forEach((templateArg, index) => {
    const actualArg = resolvedArgs[index]
    if (actualArg === undefined) return

    const exactMatch = templateArg.match(/^\{(\w+)\}$/)
    if (exactMatch) {
      values[exactMatch[1]] = actualArg
      return
    }

    if (templateArg.includes('{')) {
      Object.assign(values, extractEmbeddedValues(templateArg, actualArg))
    }
  })

  return values
}

export function getDoneLogPresentation(
  event: DoneEvent,
  command?: CommandDef,
  fallbackLabel?: string,
): { color: string; message: string } {
  const duration = (event.durationMs / 1000).toFixed(2)
  const label = fallbackLabel ?? command?.label ?? event.cmdId.slice(0, 8)

  switch (event.reason) {
    case 'timeout':
      return {
        color: '\x1b[33m',
        message: `─── [${label}] 超时 [已终止, 耗时: ${duration}s] ───`,
      }
    case 'killed':
      if (command?.timeout === 0) {
        return {
          color: '\x1b[90m',
          message: `─── [${label}] 结束 [已停止, 耗时: ${duration}s] ───`,
        }
      }
      return {
        color: '\x1b[90m',
        message: `─── [${label}] 已中止 [用户手动停止, 耗时: ${duration}s] ───`,
      }
    case 'adb_unavailable':
      return {
        color: '\x1b[31m',
        message: `─── [${label}] 错误 [adb 不可用] ───`,
      }
    case 'normal':
    default:
      if (event.exitCode === 0) {
        return {
          color: '\x1b[32m',
          message: `─── [${label}] 完成 [退出码: 0, 耗时: ${duration}s] ───`,
        }
      }
      return {
        color: '\x1b[31m',
        message: `─── [${label}] 失败 [退出码: ${event.exitCode}, 耗时: ${duration}s] ───`,
      }
  }
}

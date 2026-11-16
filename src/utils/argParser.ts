/**
 * POSIX 风格参数解析，正确处理引号与转义（不展开 glob/变量）。
 * 未加引号的 `\` 按字面量保留（兼容 Windows 路径如 Y:\foo\bar.apk）。
 */
export function parseArgs(command: string): string[] {
  const args: string[] = []
  let current = ''
  let started = false
  let i = 0

  while (i < command.length) {
    const ch = command[i]

    if (ch === '"') {
      started = true
      i++
      while (i < command.length && command[i] !== '"') {
        if (command[i] === '\\' && i + 1 < command.length) {
          const next = command[i + 1]
          if (next === '"' || next === '\\') {
            current += next
            i += 2
          } else {
            current += command[i++]
          }
        } else {
          current += command[i++]
        }
      }
      i++
      continue
    }

    if (ch === "'") {
      started = true
      i++
      while (i < command.length && command[i] !== "'") {
        current += command[i++]
      }
      i++
      continue
    }

    if (ch === ' ' || ch === '\t') {
      if (started) {
        args.push(current)
        current = ''
        started = false
      }
      i++
      continue
    }

    started = true
    current += ch
    i++
  }

  if (started) {
    args.push(current)
  }

  return args
}

export function getCommandTool(template: string): 'adb' | 'fastboot' {
  return /^fastboot(?:\.exe)?(?:\s|$)/i.test(template.trim()) ? 'fastboot' : 'adb'
}

export function extractTemplatePlaceholders(template: string): Set<string> {
  return new Set(Array.from(template.matchAll(/(?<!\$)\{(\w+)\}/g), match => match[1]))
}

function substitute(value: string, values?: Record<string, string>): string {
  return value.replace(/(?<!\$)\{(\w+)\}/g, (placeholder, key: string) =>
    values && Object.prototype.hasOwnProperty.call(values, key) ? values[key] : placeholder)
}

function substituteShell(script: string, values?: Record<string, string>): string {
  if (!values) return script
  let quote: '"' | "'" | undefined
  return script.replace(/\\[\s\S]|(?<!\$)\{(\w+)\}|["']/g, (token, key: string | undefined) => {
    if (token === '"' || token === "'") {
      if (!quote) quote = token
      else if (quote === token) quote = undefined
    }
    if (!key || !Object.prototype.hasOwnProperty.call(values, key)) return token

    const value = values[key]
    if (quote === '"') return value.replace(/[\\"$`]/g, '\\$&')
    const escaped = value.replace(/'/g, "'\\''")
    return quote === "'" ? escaped : "'" + escaped + "'"
  })
}

/** Preserve the remote shell source, including its operators and nested quoting. */
export function templateToCommandArgs(template: string, values?: Record<string, string>): string[] {
  const tool = getCommandTool(template)
  const body = template.trim().replace(/^(?:adb|fastboot)(?:\.exe)?(?:\s+|$)/i, '')
  const shell = tool === 'adb' && /^(?<prefix>(?:(?:-s|-t|-H|-P|-L)\s+(?:"[^"]*"|'[^']*'|\S+)\s+|-[de]\s+)*shell(?:\s+-(?:T|t|tt|n|x|e\s+\S+))*)(?:\s+(?<script>[\s\S]+))?$/.exec(body)
  if (shell && shell.groups) {
    const prefix = parseArgs(shell.groups.prefix).map(arg => substitute(arg, values))
    const source = shell.groups.script
    if (!source) return prefix

    const outerQuoted = /^(?:"(?:[^"\\]|\\[\s\S])*"|'[^']*')$/.test(source)
    const script = outerQuoted ? parseArgs(source)[0] : source
    if (/^\{\w+\}$/.test(script)) {
      const resolved = substitute(script, values)
      if (/^adb(?:\.exe)?[ \t]+shell(?:\s|$)/i.test(resolved.trim())) {
        return templateToCommandArgs(resolved)
      }
      return [...prefix, resolved]
    }
    return [...prefix, substituteShell(script, values)]
  }
  return parseArgs(body).map(arg => substitute(arg, values))
}

export function formatCommand(tool: 'adb' | 'fastboot', args: string[]): string {
  return [tool, ...args.map(arg => /[\s"']/.test(arg) || arg === ''
    ? '"' + arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
    : arg)].join(' ')
}

export function getAdbDeviceArgs(args: string[], serial: string | null): string[] {
  if (!serial) return args
  let index = 0
  while (['-H', '-P', '-L'].includes(args[index])) index += 2
  const command = args[index]
  if (['-s', '-t', '-d', '-e', 'devices', 'connect', 'disconnect',
    'version', 'start-server', 'kill-server', 'help'].includes(command)) return args
  return ['-s', serial, ...args]
}

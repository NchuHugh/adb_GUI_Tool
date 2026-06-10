/**
 * POSIX 风格参数解析，正确处理引号与转义（不展开 glob/变量）。
 * 未加引号的 `\` 按字面量保留（兼容 Windows 路径如 Y:\foo\bar.apk）。
 */
export function parseArgs(command: string): string[] {
  const args: string[] = []
  let current = ''
  let i = 0

  while (i < command.length) {
    const ch = command[i]

    if (ch === '"') {
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
      i++
      while (i < command.length && command[i] !== "'") {
        current += command[i++]
      }
      i++
      continue
    }

    if (ch === ' ' || ch === '\t') {
      if (current.length > 0) {
        args.push(current)
        current = ''
      }
      i++
      continue
    }

    current += ch
    i++
  }

  if (current.length > 0) {
    args.push(current)
  }

  return args
}

function quoteSubstitutedValue(val: string): string {
  if (!/[\s"]/.test(val)) return val
  return `"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** 将命令模板（含占位符）解析为 adb 参数数组（不含 "adb" 前缀） */
export function templateToAdbArgs(template: string, values?: Record<string, string>): string[] {
  let resolved = template.trim()
  if (values) {
    for (const [key, val] of Object.entries(values)) {
      const replacement = quoteSubstitutedValue(val)
      resolved = resolved.replace(new RegExp(`\\{${key}\\}`, 'g'), replacement)
    }
  }
  const parsed = parseArgs(resolved)
  if (parsed[0]?.toLowerCase() === 'adb') {
    return parsed.slice(1)
  }
  return parsed
}

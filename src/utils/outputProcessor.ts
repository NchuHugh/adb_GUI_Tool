// ============================================================
// 命令输出预处理规则
// 用于 FillPicker 中，将命令原始输出清理为可选择的行列表
// ============================================================

interface ProcessorRule {
  commandId: string
  process: (lines: string[]) => string[]
}

const PROCESSOR_RULES: ProcessorRule[] = [
  {
    commandId: 'adb_pm_list_packages',
    process: (lines) => lines
      .filter(l => l.startsWith('package:'))
      .map(l => l.replace('package:', '').trim()),
  },
  {
    commandId: 'adb_pm_list_packages_3rd',
    process: (lines) => lines
      .filter(l => l.startsWith('package:'))
      .map(l => l.replace('package:', '').trim()),
  },
  {
    commandId: 'adb_pm_path',
    process: (lines) => lines
      .filter(l => l.startsWith('package:'))
      .map(l => l.replace('package:', '').trim()),
  },
  {
    commandId: 'adb_list_users',
    process: (lines) => lines
      .filter(l => l.includes('UserInfo{'))
      .map(l => {
        const match = l.match(/UserInfo\{(\d+):/)
        return match ? match[1] : l
      }),
  },
]

export function processOutput(commandId: string, rawOutput: string): string[] {
  const lines = rawOutput.split('\n').map(l => l.trim()).filter(Boolean)
  const rule = PROCESSOR_RULES.find(r => r.commandId === commandId)
  return rule ? rule.process(lines) : lines
}

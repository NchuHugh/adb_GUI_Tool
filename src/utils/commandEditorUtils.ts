// 命令编辑器工具函数（F1/F2 共用）
import { CommandDef, CommandParam, OutputMode } from '../types'

export interface CommandEditorFormData {
  id: string
  groupId: string
  label: string
  description: string
  template: string
  outputMode: OutputMode
  timeout: number
  tags: string
  params: CommandParam[]
}

export function commandDefToFormData(def: CommandDef): CommandEditorFormData {
  return {
    id: def.id ?? '',
    groupId: def.groupId,
    label: def.label,
    description: def.description ?? '',
    template: def.template,
    outputMode: def.outputMode,
    timeout: def.timeout,
    tags: def.tags?.join(', ') ?? '',
    params: def.params.map(p => ({ ...p })),
  }
}

export const EMPTY_FORM_DATA: CommandEditorFormData = {
  id: '',
  groupId: '',
  label: '',
  description: '',
  template: 'adb ',
  outputMode: 'once',
  timeout: 10000,
  tags: '',
  params: [],
}

export function formDataToCommandDef(
  formData: CommandEditorFormData,
  isCustom: boolean
): CommandDef {
  const cmd: CommandDef = {
    id: formData.id.trim(),
    groupId: formData.groupId,
    label: formData.label.trim(),
    description: formData.description.trim(),
    template: formData.template.trim(),
    params: formData.params.map(p => {
      const clean: CommandParam = {
        key: p.key.trim(),
        label: p.label.trim(),
        type: p.type,
        required: p.required,
        default: p.default,
      }
      if (p.placeholder) clean.placeholder = p.placeholder
      if (p.type === 'select' && p.options && p.options.length > 0) {
        clean.options = p.options
      }
      if (p.fillable) {
        clean.fillable = true
        if (p.fillSourceCommandId) clean.fillSourceCommandId = p.fillSourceCommandId
      }
      return clean
    }),
    outputMode: formData.outputMode,
    timeout: formData.timeout,
  }
  if (formData.tags.trim()) {
    cmd.tags = formData.tags.split(',').map(t => t.trim()).filter(Boolean)
  }
  if (isCustom) {
    cmd.custom = true
  }
  return cmd
}

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { DeviceDirectory, DeviceFileAction, DeviceShellResult, IPC_CHANNELS } from '../src/types'

function quote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'"
}

function validateDirectory(value: string): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.includes('\0')) {
    throw new Error('请输入以 / 开头的设备目录')
  }
  return value
}

function validateName(value: string): string {
  if (typeof value !== 'string' || !value || value === '.' || value === '..' || /[/\0]/.test(value)) {
    throw new Error('请输入有效的文件或目录名称')
  }
  return value
}

function adb(serial: string, args: string[], timeout = 15_000) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
    execFile('adb', ['-s', serial, ...args], { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && (error.killed || typeof error.code !== 'number')) {
          reject(new Error(error.killed ? '设备操作超时' : error.message))
        } else {
          resolve({ stdout, stderr, exitCode: typeof error?.code === 'number' ? error.code : 0 })
        }
      })
  })
}

function requireSuccess(result: Awaited<ReturnType<typeof adb>>) {
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `设备操作失败（退出码 ${result.exitCode}）`)
  }
}

function shellIn(directory: string | undefined, script: string): string {
  return directory === undefined ? script : `cd ${quote(validateDirectory(directory))} || exit $?\n${script}`
}

const captureDirectory = 'cwd=$(pwd -P && printf .) || exit $?; cwd=${cwd%.}; cwd=${cwd%?}'

export function registerDeviceShell(getWindow: () => BrowserWindow | null, getSelectedSerial: () => string | null) {
  function checkTarget(serial: string) {
    if (!serial || serial !== getSelectedSerial()) throw new Error('设备已切换或断开，请重新选择设备')
  }

  ipcMain.handle(IPC_CHANNELS.DEVICE_SHELL_LIST, async (_event, serial: string, directory?: string): Promise<DeviceDirectory> => {
    checkTarget(serial)
    const script = [
      'if [ ! -r . ] || [ ! -x . ]; then printf "无法读取此目录\\n" >&2; exit 1; fi',
      captureDirectory,
      'printf "%s\\000" "$cwd"',
      'for entry in ./* ./.[!.]* ./..?*; do',
      '  if [ -L "$entry" ]; then kind=link;',
      '  elif [ -d "$entry" ]; then kind=directory;',
      '  elif [ -e "$entry" ]; then kind=file;',
      '  else continue; fi',
      '  printf "%s\\000%s\\000" "$kind" "${entry#./}"',
      'done',
    ].join('\n')
    const result = await adb(serial, ['shell', '-T', shellIn(directory, script)])
    requireSuccess(result)
    const boundary = result.stdout.indexOf('\0')
    const cwd = result.stdout.slice(0, boundary)
    if (boundary < 0 || !cwd.startsWith('/')) throw new Error('无法读取设备当前目录')
    const fields = result.stdout.slice(boundary + 1).split('\0')
    const entries: DeviceDirectory['entries'] = []
    for (let i = 0; i + 1 < fields.length; i += 2) {
      const [kind, name] = fields.slice(i, i + 2)
      if (kind === 'directory' || kind === 'file' || kind === 'link') entries.push({ name, kind })
    }
    return { path: cwd, entries }
  })

  ipcMain.handle(IPC_CHANNELS.DEVICE_SHELL_RUN, async (
    _event, serial: string, directory: string, script: string,
  ): Promise<DeviceShellResult> => {
    checkTarget(serial)
    if (typeof script !== 'string' || !script.trim() || script.includes('\0')) throw new Error('请输入 Shell 命令')
    const marker = '\x1e' + randomUUID() + ':'
    const command = shellIn(directory, [
      `eval ${quote(script)}`,
      '_adb_gui_status=$?',
      `printf '%s' ${quote(marker)} >&2`,
      captureDirectory,
      'printf "%s" "$cwd" >&2',
      'exit "$_adb_gui_status"',
    ].join('\n'))
    const result = await adb(serial, ['shell', '-T', command], 60_000)
    const index = result.stderr.lastIndexOf(marker)
    const cwd = index < 0 ? '' : result.stderr.slice(index + marker.length)
    return { ...result, path: cwd.startsWith('/') ? cwd : directory,
      stderr: index < 0 ? result.stderr : result.stderr.slice(0, index) }
  })

  ipcMain.handle(IPC_CHANNELS.DEVICE_SHELL_FILE, async (_event, serial: string, action: DeviceFileAction) => {
    checkTarget(serial)
    const directory = validateDirectory(action.directory).replace(/\/+$/, '')
    const remotePath = (name: string) => directory + '/' + validateName(name)
    const shell = async (script: string) => requireSuccess(await adb(serial, ['shell', '-T', script]))
    const ensureAbsent = (file: string) =>
      `if [ -e ${quote(file)} ] || [ -L ${quote(file)} ]; then printf "设备上已存在同名项目\\n" >&2; exit 1; fi`

    if (action.type === 'upload' || action.type === 'download') {
      const owner = getWindow()
      if (!owner) return false
      if (action.type === 'upload') {
        const { canceled, filePaths } = await dialog.showOpenDialog(owner, { properties: ['openFile'] })
        if (canceled || !filePaths[0]) return false
        checkTarget(serial)
        const destination = remotePath(path.basename(filePaths[0]))
        await shell(ensureAbsent(destination))
        requireSuccess(await adb(serial, ['push', filePaths[0], destination], 600_000))
      } else {
        const name = validateName(action.name)
        if (/[<>:"\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) ||
            /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name)) {
          throw new Error('此名称不能用于 Windows 文件，请先在设备上重命名')
        }
        const { canceled, filePaths } = await dialog.showOpenDialog(owner, {
          title: '选择下载位置', properties: ['openDirectory'],
        })
        if (canceled || !filePaths[0]) return false
        checkTarget(serial)
        const destination = path.join(filePaths[0], name)
        const exists = await fs.lstat(destination).then(() => true, error => {
          if (error.code === 'ENOENT') return false
          throw error
        })
        if (exists) throw new Error('下载位置已存在同名项目')
        requireSuccess(await adb(serial, ['pull', remotePath(name), destination], 600_000))
      }
      return true
    }

    const item = quote(remotePath(action.name))
    switch (action.type) {
      case 'mkdir':
        await shell(`mkdir ${item}`)
        break
      case 'rename': {
        const destination = remotePath(action.newName)
        if (action.name === action.newName) return false
        await shell(`${ensureAbsent(destination)}\nmv -n ${item} ${quote(destination)}`)
        break
      }
      case 'delete':
        await shell(`if [ -d ${item} ] && [ ! -L ${item} ]; then rmdir ${item}; else rm ${item}; fi`)
        break
      default:
        throw new Error('不支持的文件操作')
    }
    return true
  })
}

<h1 align="center">ADB GUI</h1>

<p align="center">面向 Android 开发和测试人员的桌面 ADB / Fastboot 工具</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%2010%2F11-blue" alt="Windows 10/11">
  <img src="https://img.shields.io/badge/electron-30.x-9feaf9" alt="Electron 30.x">
  <img src="https://img.shields.io/badge/react-18.x-61dafb" alt="React 18.x">
  <img src="https://img.shields.io/badge/typescript-5.x-3178c8" alt="TypeScript 5.x">
  <img src="https://img.shields.io/badge/version-2.0.0-2ea44f" alt="版本 2.0.0">
  <img src="https://img.shields.io/badge/tools-ADB%20%2F%20Fastboot-64748b" alt="ADB / Fastboot">
</p>

---

## 项目简介

**ADB GUI** 是一款运行于 Windows 10/11 x64 的桌面工具。它把常用 adb 命令放进可搜索的命令卡片，并提供设备文件管理和独立日志控制台。通过图形界面封装常用的adb命令，让 Android 开发者无需记忆命令行语法即可完成设备管理、文件操作、应用调试、日志抓取、系统属性修改、网络调试等高频操作。

当前版本 **2.0.0**  

<p align="center">
  <em>点击命令卡片 → 填写参数 → 实时查看输出。</em>
</p>

## 快速开始

1. 准备 Windows 10 或 11 x64，将 Android SDK Platform Tools 目录加入系统 `PATH`。在终端运行 `adb version` 和 `fastboot --version` 确认可用。[下载 Android SDK Platform Tools](https://developer.android.com/studio/releases/platform-tools)
2. 在 Android 设备上开启 USB 调试，连接电脑并允许调试。多台设备连接时，在应用顶部选定 ADB 目标。
3. 使用已构建的 Windows 安装包启动应用，或按下文的开发步骤从源码启动。

## 执行命令

- 在「全部命令」中搜索命令，或点击其右侧箭头展开分组。
- 点击命令卡片执行。带参数的命令会先打开填写窗口，支持文件、目录、文本和下拉选项。带「一键填入」的字段可从推荐命令、近期命令输出或常用设备路径选取值。
- 使用「新增命令」和「管理分组」保存自己的配置。常用参数可另存为命令，也可收藏。历史记录保留最近 50 次执行，带参数的历史命令可预填后再执行。
- 需要执行多行脚本时，可用「执行 Shell 命令」卡片填写脚本或粘贴完整的 `adb shell "…"`。
- 用户配置、收藏、历史和自定义设备路径保存在 `%APPDATA%\adb-gui\`。如需维护命令清单，可使用应用内编辑器，或编辑内置 `config/commands.json`。已有用户命令配置会优先加载。

## 设备 Shell

点击侧栏的「设备 Shell」，应用会读取当前选中设备的 Shell 目录。双击目录、使用「上一级」或在地址栏输入绝对路径都可导航。文件列表区可上传文件、下载文件或目录、新建目录、重命名，以及删除文件、链接和空目录。

底部命令栏在当前目录执行命令。例如输入 `cd /data/local/tmp && pwd`，文件列表会随目录切换。操作记录显示进行中、成功、失败与取消，Shell 命令还会显示输出和退出码。拖动记录区上方的分隔条可调高度，向上滚动可查看之前的记录。

## 日志控制台

- 实时日志按命令分段，可折叠、排序、再执行一次，复制、删除和导出。
- 工具栏的「独立控制台」可将日志移到单独窗口，关闭后回到主窗口。把应用导出的 `.log` 拖入主窗口或独立控制台，也可用「打开日志文件」选择归档。
- 搜索支持大小写与正则表达式，筛选支持级别、stdout/stderr、普通文本及 Logcat 字段。
- 归档与实时日志可切换。旧版文本归档支持按命令分段，新版格式还保留输出流、时间和退出状态。归档中的命令用于回看。

## 开发与构建

从源码开发需安装 Node.js 18 或更高版本。

```powershell
# 1. 克隆仓库
git clone <repo-url>
cd adbTool

# 2. 安装依赖
npm install

# 3. 启动开发模式（Vite HMR + Electron 热重载）
npm run dev

# 4. 类型检查
npm run typecheck

# 5. 生产构建
npm run build

# 6. 打包为安装程序（输出到 dist/ 目录）
npm run package
```

`npm run build` 生成 `dist-electron/`。需要 Windows x64 NSIS 安装包时，运行 `npm run package:win`，安装包输出到 `release/`。


<p align="center">
  <h1 align="center">ADB GUI</h1>
  <p align="center">面向 Android 专业开发人员的桌面 ADB 命令封装工具</p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%2010%2F11-blue" alt="Platform">
  <img src="https://img.shields.io/badge/electron-30.x-9feaf9" alt="Electron">
  <img src="https://img.shields.io/badge/react-18.x-61dafb" alt="React">
  <img src="https://img.shields.io/badge/typescript-5.x-3178c6" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

---

## 项目简介

**ADB GUI** 是一款运行于 Windows 10/11 x64 的桌面工具，通过图形界面封装常用的 `adb` 命令，让 Android 开发者无需记忆命令行语法即可完成设备管理、文件操作、应用调试、日志抓取、系统属性修改、网络调试等高频操作。

<p align="center">
  <em>点击命令卡片 → 填写参数 → 实时查看输出。零命令行。</em>
</p>

### 核心特性

| 特性 | 说明 |
|------|------|
| 🖱️ **图形化命令执行** | 50+ 内置 adb 命令，分组展示，一键执行 |
| 📝 **参数填写弹窗** | 支持 text / file / directory / select 四种参数类型，实时命令预览 |
| 🔗 **一键填入联动** | 将一条命令的输出直接填入另一条命令的参数，消除复制粘贴 |
| 📺 **日志控制台** | React DOM 日志渲染，支持分段折叠、搜索高亮、级别过滤与虚拟滚动 |
| 📋 **历史记录** | 最近 50 条执行记录持久化，一键重新执行 |
| 🛑 **命令中止** | 运行中命令可随时中止，超时自动终止 |
| 🔧 **JSON 驱动** | 命令清单由 `commands.json` 配置文件驱动，不改代码即可新增命令 |
| ✏️ **自定义命令编辑器** | 应用内新增/编辑/删除自定义命令，即时生效并持久化 |
| ⭐ **收藏命令** | 收藏常用命令（含参数）为预设快捷方式，侧边栏一键执行 |
| 📦 **独立分发** | 单文件 Portable 版 + NSIS 安装包，无需额外安装运行时 |

---

## 运行环境与依赖

### 系统要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Windows 10 / 11 x64 |
| Node.js | 18+ (LTS) |
| Android SDK | Platform Tools（`adb` 须在系统 PATH 中） |

### 技术栈

```
桌面框架     Electron 30.x
前端         React 18 + TypeScript 5.x
构建工具     Vite 5 + vite-plugin-electron
样式         Tailwind CSS 3
状态管理     Zustand 4
日志渲染     React DOM 自定义渲染器
图标         lucide-react
打包         electron-builder (NSIS + Portable)
```

### 前置条件

在终端中验证 `adb` 可用：

```bash
adb version
# Android Debug Bridge version 1.0.41
# Version 34.0.4-...
```

如果提示 `command not found`，请[下载 Android SDK Platform Tools](https://developer.android.com/studio/releases/platform-tools) 并将解压目录添加到系统 `PATH` 环境变量。

---

## 快速开始

```bash
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

---

## 项目结构

```
adbTool/
├── electron/                    # Electron 主进程
│   ├── main.ts                  # 窗口创建、IPC 注册、生命周期管理
│   ├── preload.ts               # contextBridge 安全 API
│   ├── adbRunner.ts             # child_process.spawn 执行 adb 命令
│   ├── configLoader.ts          # 读取并校验 commands.json
│   └── devicePoller.ts          # 每 2 秒轮询 adb devices -l
├── src/                         # 渲染进程 (React)
│   ├── App.tsx                  # 根布局 + 全局 IPC 监听
│   ├── main.tsx                 # ReactDOM 入口
│   ├── index.css                # Tailwind + 暗色主题样式
│   ├── components/
│   │   ├── DeviceStatusBar.tsx  # 设备连接状态栏
│   │   ├── Sidebar.tsx          # 分组导航 + 收藏/历史入口
│   │   ├── CommandList.tsx      # 搜索 + 命令卡片网格
│   │   ├── CommandCard.tsx      # 单个命令卡片（含收藏、编辑、删除）
│   │   ├── CommandEditor.tsx    # 自定义命令编辑器（新增/编辑）
│   │   ├── ParamDialog.tsx      # 参数填写弹窗
│   │   ├── ParamField.tsx       # 参数输入控件 (4 种类型)
│   │   ├── LogPanel.tsx         # 日志控制台容器（工具栏、搜索、虚拟列表）
│   │   ├── HistoryPanel.tsx     # 历史记录抽屉
│   │   ├── FavoritesPanel.tsx   # 收藏命令抽屉
│   │   ├── FillPicker.tsx       # 一键填入选择器
│   │   └── AdbMissingModal.tsx  # adb 未找到提示
│   ├── store/
│   │   ├── commandStore.ts      # 命令列表、分组、搜索、弹窗状态
│   │   ├── deviceStore.ts       # 设备列表、选中设备、adb 可用性
│   │   ├── logStore.ts          # 历史记录、日志缓存、自动滚动
│   │   └── favoriteStore.ts     # 收藏命令状态管理
│   ├── types/
│   │   └── index.ts             # 全部共享类型 + IPC 通道常量
│   └── utils/
│       ├── outputProcessor.ts   # 命令输出预处理规则
│       └── commandEditorUtils.ts # 命令编辑器公共工具函数
├── config/
│   └── commands.json            # 命令配置文件（50+ 命令, 7 个分组）
├── electron-builder.config.js   # 打包配置
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.js
└── README.md
```

---

## 使用指南

### 执行命令

1. 左侧分组导航选择命令分类，或使用搜索框查找
2. **无参数命令**（绿色"直接执行"标记）：点击卡片立即执行
3. **有参数命令**（蓝色"N 个参数"标记）：点击打开参数弹窗，填写后点击"执行"
4. 实时输出显示在底部终端面板

### 一键填入

1. 在 ParamDialog 中，`fillable` 参数字段旁点击 **「一键填入 ▼」**
2. 选择数据来源（推荐命令 / 历史记录 / 执行新命令）
3. 从输出行中点击选择目标值
4. 值自动填入当前参数输入框

### 历史记录

- 点击侧边栏底部 **「历史记录」** 打开右侧抽屉
- 每条记录显示命令、时间、耗时、退出码
- 点击 **🔄 重新执行** 按钮直接重跑

### 多设备

- 连接多台设备时，顶部状态栏自动出现下拉选择器
- 选中的设备序列号自动注入到所有命令（`adb -s <serial> ...`）

### 自定义命令

- 侧边栏底部 **「+ 新增命令」** 打开编辑器，表单填写后保存，即时生效
- 自定义命令卡片底部显示 **「自定义」** 标签，支持 **✏ 编辑** 和 **🗑 删除**
- 在 ParamDialog 填写参数后可 **「📑 另存为命令」** 将当前参数预设为新命令的默认值

### 收藏命令

- 命令卡片右上角 **★ 星标** 收藏常用命令
- 无参数命令点击星标直接收藏；有参数命令需填写参数后保存
- 侧边栏底部 **「收藏命令」** 打开收藏面板，支持重命名、一键执行、删除

---

## 扩展命令

**方式一：应用内编辑器**（推荐）

侧边栏「新增命令」→ 填写表单 → 保存，命令即时生效并持久化到 `%APPDATA%\adb-gui\commands.json`。

**方式二：直接编辑配置文件**

在 `config/commands.json` 中追加即可，无需改动任何代码：

```json
{
  "id": "adb_shell_custom",
  "groupId": "shell",
  "label": "自定义 Shell",
  "description": "在设备上执行自定义 Shell 命令",
  "template": "adb shell {cmd}",
  "params": [
    { "key": "cmd", "label": "Shell 命令", "type": "text", "required": true, "default": "" }
  ],
  "outputMode": "stream",
  "timeout": 30000
}
```

也支持用户级覆盖：将修改后的 `commands.json` 放入 `%APPDATA%\adb-gui\`，应用会优先读取。

---

## 打包与分发

```bash
npm run package        # 构建 + 打包 (NSIS + Portable)
npm run package:win    # 仅 Windows 目标
```


---

## License

MIT

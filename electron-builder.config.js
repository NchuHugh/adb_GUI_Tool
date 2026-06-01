/**
 * electron-builder 打包配置
 * 生成 NSIS 安装包 + Portable 单文件版本
 */
module.exports = {
  appId: 'com.yourteam.adb-gui',
  productName: 'ADB GUI',
  copyright: 'Copyright © 2024',
  directories: {
    output: 'dist',
    buildResources: 'assets',
  },
  files: [
    'dist/**/*',
    'dist-electron/**/*',
  ],
  extraResources: [
    {
      from: 'config/',
      to: 'config/',
    },
  ],
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] },
    ],
    icon: 'assets/icon.ico',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    shortcutName: 'ADB GUI',
  },
  portable: {
    artifactName: '${productName}-Portable-${version}.${ext}',
  },
}

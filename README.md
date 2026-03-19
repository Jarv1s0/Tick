# Tick

Tick 是一个基于 Tauri 2 + React + TypeScript 的桌面计划表工具，用于按日期区间生成周期性执行计划，并支持打印、Excel 导出、节假日调整和开机时间随机生成。

## 功能简介

- 按开始日期、结束日期生成计划表
- 支持固定周期与滚动周期
- 支持非工作日顺延、提前或不调整
- 支持标题行、项目配置、开机时间段配置
- 支持打印和导出 Excel
- 支持构建 Windows 安装包和绿色版

## 技术栈

- 前端：React 19、TypeScript、Vite
- 桌面壳：Tauri 2
- 原生侧：Rust

## 开发环境要求

在 Windows 下构建本项目，至少需要以下环境：

- Node.js 与 npm
- Rust 工具链
- 可用于 Windows 原生编译的 C++ / MSVC 构建环境

如果你只是运行前端静态构建，Node.js 即可；如果要构建桌面安装包或绿色版，还需要完整的 Rust 与 Windows 原生构建环境。

## 安装依赖

```powershell
npm install
```

## 本地开发

只启动前端开发服务器：

```powershell
npm run dev
```

启动 Tauri 桌面开发模式：

```powershell
npm run tauri dev
```

## 构建桌面安装包

构建全部桌面发布产物：

```powershell
npm run tauri build
```

这个命令会先执行前端构建，再执行 Tauri 原生构建。根据当前配置 [src-tauri/tauri.conf.json](./src-tauri/tauri.conf.json)，`bundle.targets` 为 `all`，因此会同时尝试生成多种 Windows 发布物。

构建完成后，发布产物位于：

- 原生发布版可执行文件：[build-output/release/Tick_0.2.0.exe](./build-output/release/Tick_0.2.0.exe)
- NSIS 安装包目录：[build-output/release/bundle/nsis](./build-output/release/bundle/nsis)
- MSI 安装包目录：[build-output/release/bundle/msi](./build-output/release/bundle/msi)

## 构建产物位置总览

| 场景 | 命令 | 产物位置 |
| --- | --- | --- |
| 桌面全部发布物 | `npm run tauri build` | `build-output/release` 与 `build-output/release/bundle` |

## 项目结构

```text
Tick/
├─ src/                 前端源码
├─ dist/                前端默认构建目录
├─ build-output/        发布成品目录
├─ src-tauri/           Tauri / Rust 工程
│  ├─ tauri.conf.json   Tauri 构建配置
│  └─ target/           Rust / Tauri 默认构建目录
└─ package.json         前端脚本入口
```

## 关键配置说明

- 前端构建命令定义在 [package.json](./package.json)
- Tauri 在构建桌面程序前会先执行 `npm run build`
- 前端构建输出仍在 `dist`，Rust / Tauri 编译输出仍在 `src-tauri/target`
- [scripts/run-tauri.mjs](./scripts/run-tauri.mjs) 会在构建成功后把最终成品同步到 `build-output/release`
- 当前 Tauri 配置启用了 `bundle.active: true`
- 当前 Tauri 配置的 `bundle.targets` 为 `all`

## 版本信息

当前项目版本：

- 前端包版本：[package.json](./package.json)
- Tauri 应用版本：[src-tauri/tauri.conf.json](./src-tauri/tauri.conf.json)

两者当前均为 `0.2.0`。

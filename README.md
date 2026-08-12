# Sing-box Bridge Sub

基于 Node.js + Electron 的跨平台桌面工具：导入 Clash 相关订阅，解析节点，生成 sing-box 配置，并通过 sing-box 在本机开放一个可配置的 HTTP 代理端口。

## 目标

- 导入 Clash YAML/JSON 订阅或本地配置文件。
- 解析并统一保存节点信息，不直接修改原始订阅。
- 选择单个节点或节点组作为当前出口。
- 由 sing-box 负责真实的代理连接、协议处理和流量转发。
- 由 sing-box 默认监听 `127.0.0.1:2080`，提供无认证 HTTP 代理。
- 支持 Windows 和 Linux，构建为 Windows 安装包或 Linux AppImage。

## 核心原则

本项目不自行实现代理协议，也不在 Node.js 中实现 TCP/HTTP 转发。Electron/Node.js 只负责界面、订阅解析、配置生成和 sing-box 进程生命周期；所有实际转发由 sing-box 完成。

## 授权协议

本项目采用 [PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/) 授权：

- 个人学习、研究、评估和其他非商业用途可以使用、修改和分发。
- 未经单独商业授权，不得将本项目或其衍生版本用于商业活动、商业产品或商业服务。
- 需要商业使用时，请先向版权所有者取得书面商业授权；商业授权的具体范围、期限和费用以单独协议为准。
- 依赖的 sing-box 及其他第三方组件仍受其各自许可证约束，不随本项目许可证改变。

完整授权说明见 [LICENSE.md](LICENSE.md)。

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run dist:win
npm run dist:linux
```

构建产物输出到 `release/`。

下载核心失败时，可在下载弹窗中点击“打开下载日志”。日志位置为：

```text
<userData>/logs/download.log
```

日志会记录 GitHub API/核心文件请求的状态码、限流信息、响应摘要和下载代理是否启用；下载代理中的密码会自动脱敏。

## 运行时依赖

应用首次使用时可以在左侧“sing-box 核心”卡片中点击“下载核心”。程序会通过 GitHub Releases API 获取最新版本，并按当前平台和架构下载对应压缩包。下载弹窗中的“下载代理”仅用于访问 GitHub API 和下载核心文件；留空时直连，不会影响 sing-box 运行时代理或本地 HTTP 监听配置。核心解压到 Electron 用户数据目录：

```text
<userData>/sing-box/<platform>-<arch>/sing-box[.exe]
```

当前支持的目标：

```text
Windows x64   windows-amd64
Windows arm64 windows-arm64
Linux x64     linux-amd64
Linux arm64   linux-arm64
macOS x64     darwin-amd64
macOS arm64   darwin-arm64
```

安装目录使用 `app.getPath('userData')`，而不是安装包目录，因为 Windows/Linux 安装目录通常不可写，也不应在应用升级时被覆盖。下载完成后会定位 `sing-box` 可执行文件，并在 Linux/macOS 上补充执行权限。

## 当前状态

当前仓库是桌面应用和界面骨架。订阅导入、Clash 节点转换、sing-box 配置生成、核心进程管理和端口测试将在后续按 `docs/ARCHITECTURE.md` 实现。

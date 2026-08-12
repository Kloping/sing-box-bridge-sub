# Sing-box Bridge Sub

基于 Node.js + Electron 的跨平台桌面工具：导入 Clash 相关订阅，解析节点，生成 sing-box 配置，并通过 sing-box 在本机开放一个可配置的 HTTP 代理端口。

## 目标

- 导入 Clash YAML/JSON 订阅或本地配置文件。
- 解析并统一保存节点信息，不直接修改原始订阅。
- 选择单个节点或节点组作为当前出口。
- 由 sing-box 负责真实的代理连接、协议处理和流量转发。
- 默认监听 `127.0.0.1:2080`，提供无认证 HTTP 代理。
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

## 运行时依赖

应用需要随安装包提供或由用户配置 sing-box 可执行文件。建议按平台放置在：

```text
resources/sing-box/win32-x64/sing-box.exe
resources/sing-box/linux-x64/sing-box
```

实际路径由运行时平台和架构决定，启动前通过 `sing-box check` 校验生成的配置。

## 当前状态

当前仓库是桌面应用和界面骨架。订阅导入、Clash 节点转换、sing-box 配置生成、核心进程管理和端口测试将在后续按 `docs/ARCHITECTURE.md` 实现。

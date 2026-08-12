# 基础架构设计

## 1. 总体架构

```text
┌──────────────────────────────────────────────────────────────┐
│ Electron Desktop                                              │
│                                                              │
│  Renderer UI                                                  │
│   ├─ 订阅管理                                                 │
│   ├─ 节点列表/选择                                            │
│   ├─ 监听端口配置                                             │
│   └─ 核心运行状态                                             │
│             │ IPC                                              │
│  Main Process (Node.js)                                      │
│   ├─ SubscriptionService                                      │
│   ├─ ClashParser                                              │
│   ├─ SingBoxConfigBuilder                                     │
│   ├─ CoreManager                                              │
│   └─ AppStore                                                  │
└─────────────┬────────────────────────────────────────────────┘
              │ child_process.spawn
              ▼
┌──────────────────────────────────────────────────────────────┐
│ sing-box Core                                                 │
│  inbound: local HTTP proxy, default 127.0.0.1:2080           │
│  outbound: selected Clash node converted to sing-box format  │
│  route: selected outbound / direct / block                    │
└──────────────────────────────────────────────────────────────┘
```

Electron 只做控制面板，sing-box 是唯一的数据面和转发核心。这样可以避免在 Node.js 中重复实现代理协议、连接复用、DNS、TLS 和路由逻辑。

## 2. 数据流

```text
订阅 URL / 本地文件
        │
        ▼
下载与读取
        │
        ▼
Clash YAML/JSON 解析
        │
        ▼
统一节点模型
        │
        ├─ 节点列表展示、筛选、测速记录
        │
        ▼
节点转换器
        │
        ▼
sing-box config.json
        │
        ├─ sing-box check
        └─ sing-box run -c config.json
                         │
                         ▼
                 127.0.0.1:2080 HTTP
```

启动、重载或停止配置时，Node.js 负责管理 sing-box 子进程；HTTP 请求本身不经过 Electron。

## 3. 模块职责

### Renderer UI

只负责状态展示和用户操作，通过受控 IPC 调用主进程。不开启 `nodeIntegration`，不直接访问文件系统或执行命令。

### SubscriptionService

- 下载订阅内容或读取本地文件。
- 保存订阅来源、更新时间和原始内容缓存。
- 设置超时、大小限制和错误状态。
- 不负责节点协议转换。

### ClashParser

- 读取 Clash YAML/JSON。
- 提取 `proxies`、可选的 `proxy-providers` 和代理组信息。
- 将不同 Clash 节点转换为统一的内部节点模型。
- 保留原始字段，无法转换的协议明确标记为不支持。

首期建议支持常见节点：`ss`、`vmess`、`vless`、`trojan`、`socks5`、`http`。不要为了覆盖所有 Clash 扩展字段而提前设计复杂插件系统。

### SingBoxConfigBuilder

根据统一节点模型生成 sing-box JSON：

- `inbounds`：默认一个 HTTP inbound，监听 `127.0.0.1:2080`。
- `outbounds`：一个或多个转换后的节点 outbound。
- `route.final`：当前选中的节点 outbound。
- `direct`：保留 direct outbound，用于明确的直连场景。
- `block`：保留 block outbound，便于后续加入规则。
- `log`：开发阶段可配置，默认避免过量日志。

生成配置前先写入临时文件，校验成功后再替换当前配置，避免半成品配置导致核心无法启动。

### CoreManager

封装 sing-box 可执行文件的生命周期：

1. 检查二进制文件是否存在及可执行。
2. 写入当前配置。
3. 执行 `sing-box check -c <config>`。
4. 启动 `sing-box run -c <config>`。
5. 读取 stdout/stderr，转换为 UI 可用的状态和日志。
6. 端口冲突、配置错误或进程退出时报告明确原因。
7. 停止时优先发送正常退出信号，超时后再结束进程。

不要让 UI 直接持有 `ChildProcess`，所有启动和停止操作集中在 CoreManager。

### AppStore

保存应用数据，首期使用 JSON 文件即可：

```text
subscriptions.json  订阅来源和缓存元数据
nodes.json           规范化节点和用户选择
settings.json        监听地址、端口、日志级别等
runtime/             当前生成配置和运行日志
```

配置目录使用 Electron 的 `app.getPath('userData')`，不写入安装目录。敏感订阅地址和节点密码应尽量限制文件权限，并避免在普通日志中输出。

## 4. 建议目录结构

```text
src/
├─ main.cjs
├─ renderer.js
├─ index.html
├─ styles.css
├─ main/
│  ├─ ipc.cjs
│  ├─ core-manager.cjs
│  ├─ config-builder.cjs
│  ├─ subscription-service.cjs
│  └─ store.cjs
├─ domain/
│  ├─ node-model.cjs
│  └─ errors.cjs
└─ adapters/
   └─ clash-parser.cjs
```

目录只是职责边界，不提前创建空文件。实现某个功能时再增加对应模块。

## 5. 统一节点模型

内部模型不直接等同于 Clash 字段，建议保留稳定的最小字段：

```js
{
  id: "stable-hash",
  name: "节点名称",
  type: "vmess",
  server: "example.com",
  port: 443,
  sourceId: "subscription-id",
  sourceType: "clash",
  raw: {},
  supported: true,
  error: null
}
```

协议专属字段放在 `raw` 或协议转换层，不污染 UI 使用的通用字段。`id` 必须稳定，订阅刷新后才能保留用户选择。

## 6. IPC 边界

建议只暴露面向业务的 IPC，不暴露任意命令执行接口：

```text
subscription:list / add / refresh / remove
node:list / select
core:status / start / stop / restart
settings:get / update
log:read
```

所有 IPC 参数在主进程校验。Renderer 传入的路径、URL、端口和节点 ID 都是不可信输入。

## 7. 首期实现顺序

1. 修正 Electron 页面和中文编码。
2. 建立用户数据目录和 JSON Store。
3. 实现 Clash YAML/JSON 读取与常见协议解析。
4. 实现首批节点到 sing-box outbound 的转换。
5. 实现 HTTP inbound 配置生成，默认 `127.0.0.1:2080`。
6. 实现 `sing-box check`、启动、停止和状态回传。
7. 在 UI 中接入订阅、节点和核心状态操作。
8. 增加端口可用性检查、配置导出和运行日志。

## 8. 明确不做的事情

- 不在 Node.js 中自研代理转发核心。
- 不首期引入数据库、Redux、服务容器或插件系统。
- 不把 sing-box 配置硬编码在 Renderer。
- 不自动覆盖用户正在使用的系统代理设置。
- 不把订阅中的密码、完整 URL 和 sing-box 日志无条件显示到界面。

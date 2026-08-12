A previous agent produced the plan below to accomplish the user's task. Implement the plan in a fresh context. Treat the plan as the source of user intent, re-read files as needed, and carry the work through implementation and
verification.

# Sing-box Bridge Sub 可用 MVP 完成计划

## 总结

将当前 Electron 可视化骨架完成为一个可用的跨平台桌面工具：

  ```text
  Clash 订阅链接
      ↓
  订阅下载与缓存
      ↓
  Clash YAML/JSON 解析
      ↓
  节点列表与节点选择
      ↓
  生成 sing-box 配置
      ↓
  sing-box check
      ↓
  启动 sing-box
      ↓
  本地 HTTP 代理端口
  ```

Electron/Node.js 负责控制面、配置和进程管理；sing-box 负责实际代理转发，不在 Node.js 中自研代理协议。

## 一、基础修正与工程整理

### 1. 修正依赖和锁文件

确认 `package.json` 与 `package-lock.json` 一致：

- `extract-zip` 保持为运行时依赖。
- `undici` 保持为运行时依赖，用于下载核心时配置 HTTP/HTTPS 代理。
- 确认 `npm ci` 可以按锁文件完成安装。
- 清理未使用的函数和过时字段。
- 删除下载弹窗中残留的本地 HTTP 监听配置语义。

### 2. 统一配置目录

使用 Electron 的 `app.getPath('userData')`：

  ```text
  <userData>/
  ├─ settings.json
  ├─ subscriptions.json
  ├─ nodes.json
  ├─ runtime/
  │  ├─ config.json
  │  └─ logs/
  ├─ logs/
  │  └─ app.log
  └─ sing-box/
     └─ <platform>-<arch>/
        └─ sing-box[.exe]
  ```

区分：

- 下载核心使用的“下载代理”。
- sing-box 启动后提供的“本地 HTTP 代理监听地址/端口”。
- 订阅请求使用的代理策略。

三者不能混用。

## 二、订阅管理功能

### 1. 订阅数据模型

保存订阅信息：

  ```js
  {
    id: "stable-id",
    name: "我的订阅",
    url: "https://example.com/subscribe",
    enabled: true,
    lastUpdatedAt: null,
    nodeCount: 0,
    status: "pending",
    error: null
  }
  ```

要求：

- `id` 稳定。
- 同一个 URL 不重复添加。
- 订阅名称允许修改。
- 删除订阅时同步删除其缓存节点。
- 不在普通界面和日志中显示 URL 中的敏感参数。

### 2. 主进程 SubscriptionService

新增订阅服务，主进程负责：

- 下载订阅 URL。
- 支持 HTTP/HTTPS。
- 设置请求超时。
- 限制响应体大小。
- 保存原始订阅缓存。
- 记录状态、更新时间和错误。
- 支持手动刷新单个订阅。
- 支持刷新全部订阅。

订阅请求使用独立的请求配置，不默认复用“下载 sing-box 核心”的代理，除非后续运行设置明确指定。

### 3. IPC 接口

新增受控 IPC：

  ```text
  subscription:list
  subscription:add
  subscription:update
  subscription:remove
  subscription:refresh
  subscription:refresh-all
  subscription:status
  ```

接口行为：

- Renderer 只传递订阅字段和订阅 ID。
- 主进程验证 URL、名称和 ID。
- 不暴露任意 URL 下载接口。
- 不允许 Renderer 直接调用 `fetch` 访问订阅。

### 4. 页面行为

订阅管理页增加：

- 添加订阅。
- 编辑订阅名称。
- 删除订阅。
- 刷新单条订阅。
- 刷新全部订阅。
- 显示节点数量。
- 显示最近更新时间。
- 显示请求中、成功、失败状态。
- 显示可读的错误原因。

当前 `localStorage` 中的临时订阅数据迁移到主进程 JSON Store；首次启动时兼容读取已有 `localStorage` 数据，迁移成功后停止依赖 Renderer 本地存储。

## 三、Clash 订阅解析与节点模型

### 1. Clash 输入格式

首期支持：

- Clash YAML。
- Clash JSON。
- `proxies` 节点列表。
- 常见 `proxy-providers` 展开后的节点数据。
- 代理组信息只作为辅助元数据保存，不直接等同于 sing-box 出口。

### 2. 首期支持协议

优先实现：

  ```text
  ss
  vmess
  vless
  trojan
  socks5
  http
  ```

每个节点保留：

  ```js
  {
    id: "stable-hash",
    name: "节点名称",
    type: "vmess",
    server: "example.com",
    port: 443,
    sourceId: "subscription-id",
    supported: true,
    error: null,
    raw: {}
  }
  ```

规则：

- 不支持的节点保留在列表中，但标记为“不支持”。
- 解析失败不能导致整条订阅消失。
- 节点 ID 根据订阅 ID、协议、服务器、端口和名称生成稳定哈希。
- 订阅刷新后，名称变化不应导致同一节点无故重复。

### 3. YAML 解析依赖

使用一个成熟且已安装/明确声明的 YAML 解析依赖，不手写 YAML 解析器。

Parser 输出：

  ```text
  原始订阅
    → Clash 文档
    → 规范化代理节点
    → 节点校验结果
  ```

为解析器保留一个最小单元测试样例，覆盖：

- YAML 普通节点。
- JSON 普通节点。
- 缺少 server。
- 缺少 port。
- 不支持协议。
- 重复节点。

## 四、运行设置页面

### 1. 独立运行设置

侧边栏“运行设置”进入独立页面，不再放在核心下载弹窗中。

设置项：

  ```text
  HTTP 监听地址：127.0.0.1
  HTTP 监听端口：2080
  是否自动启动核心：关闭
  日志级别：info
  ```

首期不自动修改系统代理。

### 2. 输入校验

- 地址必须是合法 IP。
- 端口范围 `1-65535`。
- 启动前检查端口是否被占用。
- 端口被占用时显示明确错误。
- 默认只监听 `127.0.0.1`，避免意外暴露到局域网。

### 3. IPC 接口

  ```text
  settings:get
  settings:update
  settings:validate
  ```

设置保存到：

  ```text
  <userData>/settings.json
  ```

运行设置与核心下载代理分开保存，例如：

  ```js
  {
    "runtime": {
      "httpHost": "127.0.0.1",
      "httpPort": 2080
    },
    "coreDownload": {
      "proxy": ""
    }
  }
  ```

## 五、sing-box 配置生成

### 1. SingBoxConfigBuilder

根据当前运行设置和选中的节点生成配置：

  ```json
  {
    "log": {
      "level": "info"
    },
    "inbounds": [
      {
        "type": "http",
        "tag": "http-in",
        "listen": "127.0.0.1",
        "listen_port": 2080
      }
    ],
    "outbounds": [
      {
        "type": "direct",
        "tag": "direct"
      },
      {
        "type": "block",
        "tag": "block"
      }
    ],
    "route": {
      "final": "selected-outbound"
    }
  }
  ```

选中节点后追加对应 outbound，并将：

  ```text
  route.final
  ```

指向选中的节点。

### 2. 配置生成安全要求

- 配置写入临时文件。
- 生成完成后执行 `sing-box check -c config.json`。
- 校验成功后原子替换运行配置。
- 校验失败保留旧配置。
- 不把节点密码写入普通日志。
- 不把完整配置直接显示给 Renderer。
- 当前运行配置保存到 `runtime/config.json`。

### 3. 协议转换器

按协议拆分转换逻辑，但不提前设计插件系统：

  ```text
  Clash ss     → sing-box shadowsocks outbound
  Clash vmess  → sing-box vmess outbound
  Clash vless  → sing-box vless outbound
  Clash trojan → sing-box trojan outbound
  Clash socks5 → sing-box socks outbound
  Clash http   → sing-box http outbound
  ```

不支持的协议不能生成伪配置，必须返回明确错误。

## 六、sing-box CoreManager

### 1. 核心状态

状态统一为：

  ```text
  not-installed
  ready
  starting
  running
  stopping
  stopped
  error
  ```

### 2. 进程生命周期

CoreManager 负责：

1. 查找当前平台的 sing-box 可执行文件。
2. 检查文件是否存在。
3. 检查运行配置。
4. 执行：

   ```text
   sing-box check -c <config>
   ```

5. 启动：

   ```text
   sing-box run -c <config>
   ```

6. 读取 stdout/stderr。
7. 将核心日志转换为 UI 状态。
8. 检测进程异常退出。
9. 停止时优先正常退出。
10. 超时后强制结束进程。

Renderer 不直接持有或操作 `ChildProcess`。

### 3. IPC 接口

  ```text
  core:status
  core:start
  core:stop
  core:restart
  core:check-config
  core:open-log
  ```

行为：

- 未安装时提示先下载核心。
- 未选择节点时只能启动 direct 或拒绝启动，默认拒绝启动并提示选择节点。
- 配置校验失败时禁止启动。
- 进程异常退出时显示退出码和最近错误日志。
- 启动成功后显示本地代理地址。

## 七、节点列表页面

新增“节点列表”页面：

- 按订阅筛选。
- 按协议筛选。
- 按支持状态筛选。
- 显示节点名称、协议、服务器、端口。
- 显示当前选中节点。
- 选择节点。
- 刷新订阅后保留仍然存在的节点选择。
- 对不支持节点禁用选择按钮。
- 提供简单延迟测试入口，但不在 MVP 首期实现复杂测速系统。

节点选择保存：

  ```js
  {
    "selectedNodeId": "stable-node-id"
  }
  ```

启动 sing-box 时只使用当前选择的节点。

## 八、日志和错误处理

### 1. 日志分类

  ```text
  app.log       应用生命周期和普通错误
  download.log  sing-box 核心下载日志
  core.log      sing-box 进程 stdout/stderr
  subscription.log 订阅请求和解析结果
  ```

### 2. 敏感信息保护

日志中必须脱敏：

- 订阅 URL 查询参数。
- 代理 URL 用户名和密码。
- 节点密码。
- UUID。
- Trojan 密码。
- HTTP Basic Auth。

## 九、测试计划

### 静态检查

每次变更执行：

  ```text
  node --check src/main.cjs
  node --check src/preload.cjs
  node --check src/renderer.js
  ```

### 单元测试

至少覆盖：

- 平台和架构资产映射。
- 下载代理 URL 校验。
- 下载代理密码脱敏。
- HTTP 地址和端口校验。
- Clash YAML 解析。
- Clash JSON 解析。
- 不支持协议处理。
- 节点稳定 ID。
- sing-box 配置生成。
- 敏感字段日志脱敏。

### 集成测试

覆盖：

1. 没有核心时点击下载。
2. 使用直连下载。
3. 使用 HTTP 下载代理。
4. GitHub API 返回 403。
5. ZIP 下载返回 403。
6. 下载暂停。
7. 下载继续并发送 Range。
8. 下载撤销并清理临时文件。
9. ZIP 解压失败。
10. 核心文件找不到。
11. `sing-box check` 失败。
12. 端口被占用。
13. sing-box 正常启动。
14. sing-box 异常退出。
15. 订阅下载失败。
16. 订阅格式解析失败。
17. 节点选择后生成正确 outbound。

### 验收标准

MVP 完成需要满足：

- 用户可以添加 Clash 订阅 URL。
- 用户可以刷新订阅并看到节点数量。
- 用户可以查看节点列表。
- 用户可以选择一个支持的节点。
- 用户可以下载对应平台的 sing-box 核心。
- 用户可以配置本地 HTTP 监听地址和端口。
- 用户可以生成并校验 sing-box 配置。
- 用户可以启动和停止 sing-box。
- 浏览器设置 HTTP 代理后能够通过本地端口访问目标网站。
- Windows 和 Linux 均能完成开发启动和打包。
- 403、解析失败、配置错误和核心异常都有日志和界面反馈。

## 十、实施顺序

按以下顺序实现，避免先做 UI 再反复改 IPC：

1. 修正依赖、锁文件和当前下载器边界。
2. 实现 JSON Store 和敏感信息脱敏工具。
3. 实现 SubscriptionService。
4. 实现 Clash Parser 和统一节点模型。
5. 将订阅管理页从 `localStorage` 迁移到主进程 IPC。
6. 实现节点列表页和节点选择。
7. 实现独立运行设置页。
8. 实现 Clash 节点到 sing-box outbound 的转换器。
9. 实现配置生成和 `sing-box check`。
10. 实现 CoreManager 启动、停止、重启和状态回传。
11. 接通 UI 的完整运行流程。
12. 增加日志查看、错误状态和端口占用提示。
13. 执行 Windows/Linux 开发验证和打包验证。
14. 更新 README、架构文档和许可证说明。

## 假设与默认值

- 继续使用 Electron + 原生 HTML/CSS/JS，不引入 React/Vue。
- sing-box 继续作为唯一转发核心。
- 默认本地 HTTP 监听为 `127.0.0.1:2080`。
- 默认不修改系统代理设置。
- 下载核心时可选 HTTP/HTTPS 下载代理，留空表示直连。
- 首期只支持 Clash 常见协议：SS、VMess、VLESS、Trojan、SOCKS5、HTTP。
- 首期使用 JSON 文件存储，不引入数据库。
- 首期不做自动测速、代理组智能选择和系统托盘常驻。
- 商业授权继续使用 PolyForm Noncommercial 1.0.0。

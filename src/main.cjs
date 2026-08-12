const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn, spawnSync } = require('node:child_process');
const { dialog } = require('electron');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { Readable } = require('node:stream');
const { once } = require('node:events');
const extract = require('extract-zip');
const { ProxyAgent } = require('undici');
const { createSubscriptionService, maskUrl } = require('./main/subscription-service.cjs');
const { readJson, writeJson } = require('./main/store.cjs');
const { buildConfig, DEFAULT_LISTEN, DEFAULT_PORT } = require('./main/singbox.cjs');

const repository = 'SagerNet/sing-box';
let mainWindow;
let downloadJob;
let proxyJob;
const subscriptionService = createSubscriptionService(app.getPath('userData'));
const settingsFile = path.join(app.getPath('userData'), 'settings.json');

function getTarget() {
  const platformName = { win32: 'windows', linux: 'linux', darwin: 'darwin' }[process.platform];
  const archName = { x64: 'amd64', arm64: 'arm64' }[process.arch];
  if (!platformName || !archName) throw new Error(`暂不支持当前平台：${process.platform}-${process.arch}`);
  return `${platformName}-${archName}`;
}

function getInstallDirectory() {
  return path.join(app.getPath('userData'), 'sing-box', `${process.platform}-${process.arch}`);
}

function getExecutablePath() {
  return path.join(getInstallDirectory(), process.platform === 'win32' ? 'sing-box.exe' : 'sing-box');
}

function getLogPath() {
  return path.join(app.getPath('userData'), 'logs', 'download.log');
}

function getRuntimeDirectory() {
  return path.join(app.getPath('userData'), 'runtime');
}

function getRuntimeConfigPath() {
  return path.join(getRuntimeDirectory(), 'config.json');
}

function getCoreLogPath() {
  return path.join(app.getPath('userData'), 'logs', 'core.log');
}

function sendNodeStatus() {
  mainWindow?.webContents.send('node:status', { runningNodes: proxyJob ? proxyJob.nodes.map(toPublicProxy) : [] });
}

function toPublicProxy(job) {
  return { nodeId: job.id, mode: job.mode || 'mixed', listen: job.listen || DEFAULT_LISTEN, port: job.proxyPort };
}

function validateProxyPort(port) {
  const value = Number(port);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('代理端口必须是 1 到 65535 之间的整数');
  return value;
}

async function getDefaultPort() {
  const settings = await readJson(settingsFile, {});
  try { return validateProxyPort(settings.defaultPort ?? DEFAULT_PORT); } catch { return DEFAULT_PORT; }
}

async function saveDefaultPort(port) {
  const value = validateProxyPort(port);
  const settings = await readJson(settingsFile, {});
  await writeJson(settingsFile, { ...settings, defaultPort: value });
  return value;
}

async function stopProxy() {
  const job = proxyJob;
  if (!job) return false;
  proxyJob = null;
  if (!job.process || job.process.exitCode !== null) return true;
  job.process.kill();
  await Promise.race([once(job.process, 'close'), new Promise((resolve) => setTimeout(resolve, 2000))]);
  sendNodeStatus();
  return true;
}

async function restartProxy(nodes) {
  if (!nodes.length) {
    await stopProxy();
    return;
  }
  const config = await buildConfig(nodes, path.join(__dirname, 'test', 'config.json'), { listen: DEFAULT_LISTEN, mode: 'mixed' });
  await fsp.mkdir(getRuntimeDirectory(), { recursive: true });
  const configPath = getRuntimeConfigPath();
  const tempConfig = `${configPath}.tmp`;
  await fsp.writeFile(tempConfig, JSON.stringify(config, null, 2) + '\n', 'utf8');
  await fsp.rename(tempConfig, configPath);
  const check = spawnSync(getExecutablePath(), ['check', '-c', configPath], { encoding: 'utf8' });
  if (check.error) throw new Error(`启动 sing-box 失败：${check.error.message}`);
  if (check.status !== 0) throw new Error(`sing-box 配置校验失败：${(check.stderr || check.stdout || '').trim()}`);

  await stopProxy();
  const child = spawn(getExecutablePath(), ['run', '-c', configPath], { windowsHide: true });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  await fsp.mkdir(path.dirname(getCoreLogPath()), { recursive: true });
  const logStream = fs.createWriteStream(getCoreLogPath(), { flags: 'a' });
  child.stdout?.pipe(logStream, { end: false });
  child.stderr?.pipe(logStream, { end: false });
  const job = { process: child, nodes, configPath };
  proxyJob = job;
  child.once('close', () => {
    logStream.end();
    if (proxyJob?.process === child) { proxyJob = null; sendNodeStatus(); }
  });
  sendNodeStatus();
}

async function startProxy(nodeId, options = {}) {
  return startProxyBatch([{ id: nodeId, port: options.port, mode: options.mode }]);
}

async function startProxyBatch(requests) {
  if (!Array.isArray(requests) || !requests.length) throw new Error('至少选择一个节点');
  const defaultPort = await getDefaultPort();
  const selectedIds = new Set();
  const selectedNodes = [];
  for (const request of requests) {
    if (!request || typeof request.id !== 'string' || !request.id) throw new Error('无效的节点 ID');
    if (selectedIds.has(request.id)) continue;
    const node = await subscriptionService.getNode(request.id);
    if (!node) throw new Error('节点不存在');
    if (!node.supported) throw new Error(`${node.name}：${node.error || '节点不支持'}`);
    selectedIds.add(request.id);
    selectedNodes.push({ ...node, proxyPort: validateProxyPort(request.port ?? defaultPort), listen: DEFAULT_LISTEN, mode: request.mode || 'mixed' });
  }
  if (selectedNodes.some((node) => node.mode !== 'mixed')) throw new Error('当前仅支持 mixed 代理模式');
  const retainedNodes = proxyJob?.nodes.filter((node) => !selectedIds.has(node.id)) || [];
  const nodes = [...retainedNodes, ...selectedNodes];
  const ports = new Set();
  for (const node of nodes) {
    if (ports.has(node.proxyPort)) throw new Error(`端口 ${node.proxyPort} 被多个节点使用`);
    ports.add(node.proxyPort);
  }
  await restartProxy(nodes);
  await subscriptionService.selectNode(selectedNodes[selectedNodes.length - 1].id);
  return { runningNodes: nodes.map(toPublicProxy) };
}

async function stopProxyNodes(nodeIds) {
  if (!Array.isArray(nodeIds) || !nodeIds.length) throw new Error('至少选择一个节点');
  const ids = new Set(nodeIds);
  const nodes = proxyJob?.nodes.filter((node) => !ids.has(node.id)) || [];
  await restartProxy(nodes);
  return { runningNodes: nodes.map(toPublicProxy) };
}

async function cleanupCore() {
  if (downloadJob) throw new Error('核心下载任务进行中，请先等待或撤销下载');
  await stopProxy();
  await fsp.rm(getInstallDirectory(), { recursive: true, force: true });
  await fsp.rm(getRuntimeDirectory(), { recursive: true, force: true });
  sendNodeStatus();
  return { cleaned: true };
}

function maskProxy(proxyUrl) {
  if (!proxyUrl) return '直连';
  try {
    const url = new URL(proxyUrl);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '<invalid-proxy-url>';
  }
}

async function writeLog(message, details) {
  const suffix = details ? ` ${JSON.stringify(details)}` : '';
  const line = `${new Date().toISOString()} ${message}${suffix}\n`;
  try {
    await fsp.mkdir(path.dirname(getLogPath()), { recursive: true });
    await fsp.appendFile(getLogPath(), line, 'utf8');
  } catch (error) {
    console.error('写入下载日志失败', error);
  }
}

async function responseDetails(response) {
  const details = {
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get('content-type'),
    contentLength: response.headers.get('content-length'),
    location: response.headers.get('location'),
    rateLimit: response.headers.get('x-ratelimit-limit'),
    rateRemaining: response.headers.get('x-ratelimit-remaining'),
    rateReset: response.headers.get('x-ratelimit-reset'),
    retryAfter: response.headers.get('retry-after')
  };
  if (!response.ok) {
    try {
      details.body = (await response.text()).slice(0, 1000);
    } catch (error) {
      details.bodyReadError = error.message;
    }
  }
  return details;
}

function fetchOptions(proxyAgent, options = {}) {
  return proxyAgent ? { ...options, dispatcher: proxyAgent } : options;
}

function createProxyAgent(proxyUrl) {
  const value = String(proxyUrl || '').trim();
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('下载代理必须是有效的 HTTP/HTTPS URL，例如 http://127.0.0.1:7890');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('下载代理仅支持 HTTP 或 HTTPS 代理');
  return new ProxyAgent(url.toString());
}

async function testProxyNode(nodeId) {
  if (typeof nodeId !== 'string' || !nodeId) throw new Error('无效的节点 ID');
  const node = proxyJob?.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error('该节点代理尚未开启');
  const agent = createProxyAgent(`http://${node.listen}:${validateProxyPort(node.proxyPort)}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const startedAt = process.hrtime.bigint();
  try {
    const response = await fetch('https://uapis.cn/api/v1/network/myip', fetchOptions(agent, {
      headers: { accept: 'application/json' },
      signal: controller.signal
    }));
    const latency = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
    if (!response.ok) throw new Error(`测试接口返回 HTTP ${response.status}`);
    let data;
    try { data = JSON.parse(await response.text()); } catch { throw new Error('测试接口返回了无效数据'); }
    return {
      latency,
      ip: String(data.ip || ''),
      region: String(data.region || ''),
      isp: String(data.isp || ''),
      asn: String(data.asn || '')
    };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('测试超时（10 秒）');
    throw error;
  } finally {
    clearTimeout(timeout);
    await agent.close();
  }
}

function sendCoreEvent(event) {
  mainWindow?.webContents.send('core:download-event', event);
}

async function getLatestAsset(proxyAgent) {
  const url = `https://api.github.com/repos/${repository}/releases/latest`;
  await writeLog('请求最新版本', { url, proxy: downloadJob ? maskProxy(downloadJob.downloadProxy) : '未知' });
  const response = await fetch(url, fetchOptions(proxyAgent, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'sing-box-bridge-sub' }
  }));
  const details = await responseDetails(response);
  await writeLog('最新版本响应', details);
  if (!response.ok) {
    throw new Error(`获取 sing-box 版本失败：HTTP ${response.status}，详细信息见下载日志`);
  }
  const release = await response.json();
  const suffix = `-${getTarget()}.zip`;
  const asset = release.assets?.find((item) => item.name.startsWith('sing-box-') && item.name.endsWith(suffix));
  if (!asset) throw new Error(`最新版本没有可用资产：${suffix}`);
  const result = { version: release.tag_name, name: asset.name, url: asset.browser_download_url };
  await writeLog('找到核心资产', { version: result.version, name: result.name, url: result.url });
  return result;
}

function emitProgress(job, phase = 'download') {
  sendCoreEvent({
    phase,
    status: job.status,
    version: job.asset?.version,
    received: job.received,
    total: job.total,
    percent: job.total ? Math.min(100, Math.round(job.received / job.total * 100)) : null
  });
}

async function waitForDrain(stream) {
  if (!stream.writeBufferFull) return;
  await once(stream, 'drain');
}

async function downloadAsset(job) {
  while (true) {
    if (job.cancelled) throw new Error('下载已撤销');
    job.status = 'downloading';
    job.controller = new AbortController();
    const headers = { 'user-agent': 'sing-box-bridge-sub' };
    if (job.received > 0) headers.range = `bytes=${job.received}-`;
    await writeLog('开始下载核心', { url: job.asset.url, range: headers.range || 'none', proxy: maskProxy(job.downloadProxy) });
    const response = await fetch(job.asset.url, fetchOptions(job.proxyAgent, { headers, signal: job.controller.signal }));
    const details = await responseDetails(response);
    await writeLog('核心下载响应', details);
    if (!response.ok || !response.body) {
      throw new Error(`下载 sing-box 失败：HTTP ${response.status}，详细信息见下载日志`);
    }

    if (job.received > 0 && response.status !== 206) {
      job.received = 0;
      await fsp.rm(job.zipPath, { force: true });
    }
    const contentLength = Number(response.headers.get('content-length')) || 0;
    job.total = response.status === 206 ? job.received + contentLength : contentLength;
    const writer = fs.createWriteStream(job.zipPath, { flags: job.received ? 'a' : 'w' });
    try {
      for await (const chunk of Readable.fromWeb(response.body)) {
        if (job.cancelled) job.controller.abort();
        if (job.pauseRequested) job.controller.abort();
        if (job.cancelled || job.pauseRequested) throw new Error('download-interrupted');
        if (!writer.write(chunk)) await once(writer, 'drain');
        job.received += chunk.length;
        emitProgress(job);
      }
      writer.end();
      await once(writer, 'finish');
      return;
    } catch (error) {
      writer.destroy();
      if (job.cancelled) throw new Error('下载已撤销');
      if (!job.pauseRequested && error.name !== 'AbortError') throw error;
      job.status = 'paused';
      emitProgress(job);
      await new Promise((resolve, reject) => {
        job.resume = resolve;
        job.rejectResume = reject;
      });
      if (job.cancelled) throw new Error('下载已撤销');
    }
  }
}

async function findExecutable(directory) {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === (process.platform === 'win32' ? 'sing-box.exe' : 'sing-box')) return entryPath;
    if (entry.isDirectory()) {
      const found = await findExecutable(entryPath).catch(() => null);
      if (found) return found;
    }
  }
  return null;
}

async function runInstall(job) {
  try {
    await writeLog('开始安装核心', { target: getTarget(), proxy: maskProxy(job.downloadProxy) });
    job.proxyAgent = createProxyAgent(job.downloadProxy);
    job.asset = await getLatestAsset(job.proxyAgent);
    job.tempDirectory = path.join(app.getPath('temp'), `sing-box-bridge-sub-${Date.now()}`);
    job.zipPath = path.join(job.tempDirectory, job.asset.name);
    await fsp.mkdir(job.tempDirectory, { recursive: true });
    emitProgress(job, 'ready');
    await downloadAsset(job);
    if (job.cancelled) throw new Error('下载已撤销');

    job.status = 'extracting';
    emitProgress(job, 'extract');
    const extractedDirectory = path.join(job.tempDirectory, 'extracted');
    await extract(job.zipPath, { dir: extractedDirectory });
    const executable = await findExecutable(extractedDirectory);
    if (!executable) throw new Error('压缩包中没有找到 sing-box 可执行文件');
    await fsp.mkdir(getInstallDirectory(), { recursive: true });
    await fsp.copyFile(executable, getExecutablePath());
    if (process.platform !== 'win32') await fsp.chmod(getExecutablePath(), 0o755);
    job.status = 'complete';
    await writeLog('核心安装完成', { version: job.asset.version, target: getTarget(), path: getExecutablePath() });
    sendCoreEvent({ phase: 'complete', status: 'complete', installed: true, version: job.asset.version, target: getTarget(), path: getExecutablePath() });
  } catch (error) {
    await writeLog('核心安装失败', { message: error.message, stack: error.stack });
    if (job.cancelled) {
      job.status = 'cancelled';
      sendCoreEvent({ phase: 'cancelled', status: 'cancelled' });
    } else {
      job.status = 'error';
      sendCoreEvent({ phase: 'error', status: 'error', message: error.message });
    }
  } finally {
    if (job.tempDirectory && (job.status === 'complete' || job.cancelled || job.status === 'error')) {
      await fsp.rm(job.tempDirectory, { recursive: true, force: true });
    }
    if (downloadJob === job) downloadJob = null;
    await job.proxyAgent?.close();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#f7f9fc',
    icon: path.join(__dirname, 'logo.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs') }
  });
  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle('core:status', async () => ({
  installed: await fsp.access(getExecutablePath()).then(() => true, () => false),
  target: getTarget(),
  path: getExecutablePath(),
  logPath: getLogPath(),
  coreLogPath: getCoreLogPath(),
  defaultPort: await getDefaultPort(),
  proxy: proxyJob ? { nodes: proxyJob.nodes.map(toPublicProxy), configPath: getRuntimeConfigPath() } : null,
  download: downloadJob ? { status: downloadJob.status, received: downloadJob.received, total: downloadJob.total } : null
}));
ipcMain.handle('core:save-config', async () => {
  if (!proxyJob) throw new Error('代理尚未开启');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存 sing-box 配置',
    defaultPath: 'config.json',
    filters: [{ name: 'JSON 配置文件', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fsp.copyFile(getRuntimeConfigPath(), result.filePath);
  return { canceled: false, path: result.filePath };
});
ipcMain.handle('core:open-log', () => shell.openPath(getLogPath()));
ipcMain.handle('core:open-core-log', () => shell.openPath(getCoreLogPath()));
ipcMain.handle('core:cleanup', cleanupCore);
ipcMain.handle('settings:get', async () => ({ defaultPort: await getDefaultPort() }));
ipcMain.handle('settings:set-port', async (_event, port) => ({ defaultPort: await saveDefaultPort(port) }));
ipcMain.handle('core:download-start', async (_event, downloadProxy) => {
  if (downloadJob) throw new Error('已有核心下载任务正在进行');
  downloadJob = { status: 'starting', downloadProxy: String(downloadProxy || '').trim(), received: 0, total: 0, pauseRequested: false, cancelled: false };
  void runInstall(downloadJob);
  return { started: true };
});
ipcMain.handle('core:download-pause', () => {
  if (!downloadJob || downloadJob.status !== 'downloading') return false;
  downloadJob.pauseRequested = true;
  downloadJob.controller?.abort();
  return true;
});
ipcMain.handle('core:download-resume', () => {
  if (!downloadJob || downloadJob.status !== 'paused') return false;
  downloadJob.pauseRequested = false;
  downloadJob.status = 'downloading';
  downloadJob.resume?.();
  downloadJob.resume = null;
  return true;
});
ipcMain.handle('core:download-cancel', async () => {
  if (!downloadJob) return false;
  downloadJob.cancelled = true;
  downloadJob.controller?.abort();
  downloadJob.resume?.();
  downloadJob.rejectResume?.();
  return true;
});


function toPublicSubscription(subscription) {
  return { ...subscription, url: maskUrl(subscription.url) };
}

function toPublicNode(node) {
  const { raw, ...publicNode } = node;
  return publicNode;
}

ipcMain.handle('subscription:list', async () => {
  const subscriptions = await subscriptionService.listSubscriptions();
  return subscriptions.map(toPublicSubscription);
});
ipcMain.handle('subscription:add', async (_event, payload) => {
  const subscription = await subscriptionService.addSubscription(payload || {});
  return toPublicSubscription(subscription);
});
ipcMain.handle('subscription:update', async (_event, { id, name }) => {
  const subscription = await subscriptionService.updateSubscription(id, { name });
  return toPublicSubscription(subscription);
});
ipcMain.handle('subscription:remove', async (_event, id) => {
  if (typeof id !== 'string' || !id) throw new Error('无效的订阅 ID');
  await subscriptionService.removeSubscription(id);
  return { removed: true };
});
ipcMain.handle('subscription:refresh', async (_event, id) => {
  if (typeof id !== 'string' || !id) throw new Error('无效的订阅 ID');
  const subscription = await subscriptionService.refreshSubscription(id);
  return toPublicSubscription(subscription);
});
ipcMain.handle('subscription:refresh-all', async () => {
  const results = await subscriptionService.refreshAll();
  return results.map((result) => result.ok
    ? { id: result.id, ok: true, subscription: toPublicSubscription(result.data) }
    : { id: result.id, ok: false, error: result.error });
});
ipcMain.handle('node:list', async (_event, filters) => {
  const { selectedNodeId, nodes } = await subscriptionService.listNodes(filters || {});
  const running = new Map((proxyJob?.nodes || []).map((node) => [node.id, toPublicProxy(node)]));
  return { selectedNodeId, runningNodes: [...running.values()], nodes: nodes.map(toPublicNode) };
});
ipcMain.handle('node:start', async (_event, payload = {}) => {
  if (Array.isArray(payload.nodes)) return startProxyBatch(payload.nodes);
  if (typeof payload.id !== 'string' || !payload.id) throw new Error('无效的节点 ID');
  return startProxy(payload.id, { ...payload, port: payload.port ?? await getDefaultPort() });
});
ipcMain.handle('node:stop', async (_event, id) => {
  return stopProxyNodes(Array.isArray(id) ? id : [id]);
});
ipcMain.handle('node:test-ip', async (_event, nodeId) => testProxyNode(nodeId));

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  proxyJob?.process?.kill();
});

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { Readable } = require('node:stream');
const { once } = require('node:events');
const extract = require('extract-zip');
const { ProxyAgent } = require('undici');

const repository = 'SagerNet/sing-box';
let mainWindow;
let downloadJob;

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
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle('core:status', async () => ({
  installed: await fsp.access(getExecutablePath()).then(() => true, () => false),
  target: getTarget(),
  path: getExecutablePath(),
  logPath: getLogPath(),
  download: downloadJob ? { status: downloadJob.status, received: downloadJob.received, total: downloadJob.total } : null
}));
ipcMain.handle('core:open-log', () => shell.openPath(getLogPath()));
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

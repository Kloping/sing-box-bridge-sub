const storageKey = 'sing-box-bridge-subscriptions';
const form = document.querySelector('#subscriptionForm');
const list = document.querySelector('#subscriptionList');
const count = document.querySelector('#subscriptionCount');
const message = document.querySelector('#formMessage');
const coreStatus = document.querySelector('#coreStatus');
const coreTarget = document.querySelector('#coreTarget');
const coreInstallButton = document.querySelector('#coreInstallButton');
const coreModal = document.querySelector('#coreModal');
const coreSettingsForm = document.querySelector('#coreSettingsForm');
const downloadProxyInput = document.querySelector('#downloadProxyInput');
const coreMessage = document.querySelector('#coreMessage');
const progressPanel = document.querySelector('#downloadProgressPanel');
const progressBar = document.querySelector('#downloadProgressBar');
const downloadStatus = document.querySelector('#downloadStatus');
const downloadPercent = document.querySelector('#downloadPercent');
const downloadDetails = document.querySelector('#downloadDetails');
const pauseButton = document.querySelector('#pauseDownloadButton');
const cancelDownloadButton = document.querySelector('#cancelDownloadButton');
const openLogButton = document.querySelector('#openLogButton');
const startDownloadButton = document.querySelector('#startCoreDownload');

let subscriptions = JSON.parse(localStorage.getItem(storageKey) || '[]');
let downloadActive = false;

function save() {
  localStorage.setItem(storageKey, JSON.stringify(subscriptions));
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function render() {
  count.textContent = subscriptions.length;
  list.innerHTML = subscriptions.length
    ? subscriptions.map((subscription) => `
        <article class="card subscription-item">
          <div class="subscription-logo">${escapeHtml(subscription.name.slice(0, 1).toUpperCase())}</div>
          <div class="subscription-main">
            <h3>${escapeHtml(subscription.name)}</h3>
            <p>${escapeHtml(subscription.url)}</p>
            <span class="subscription-meta"><i></i>${subscription.status}</span>
          </div>
          <div class="subscription-actions">
            <button class="secondary refresh-button" data-id="${subscription.id}" type="button">刷新</button>
            <button class="delete-button" data-id="${subscription.id}" type="button" aria-label="删除 ${escapeHtml(subscription.name)}">删除</button>
          </div>
        </article>`).join('')
    : `<div class="card empty-state">
         <div class="empty-icon">⌁</div>
         <h3>还没有订阅</h3>
         <p class="muted">添加订阅链接后，节点会在这里展示。</p>
       </div>`;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const name = formData.get('name').trim();
  const url = formData.get('url').trim();
  if (subscriptions.some((subscription) => subscription.url === url)) {
    message.textContent = '这条订阅已经添加过了。';
    message.className = 'form-message error';
    return;
  }
  subscriptions.unshift({ id: crypto.randomUUID(), name, url, status: '等待首次刷新' });
  save();
  render();
  form.reset();
  message.textContent = '订阅已添加，真实拉取功能将在核心服务接入后启用。';
  message.className = 'form-message success';
});

list.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-id]');
  if (!button) return;
  const id = button.dataset.id;
  subscriptions = button.classList.contains('delete-button')
    ? subscriptions.filter((subscription) => subscription.id !== id)
    : subscriptions.map((subscription) => subscription.id === id
      ? { ...subscription, status: '等待 sing-box 服务接入' } : subscription);
  save();
  render();
});

document.querySelector('#refreshAllButton').addEventListener('click', () => {
  subscriptions = subscriptions.map((subscription) => ({ ...subscription, status: '等待 sing-box 服务接入' }));
  save();
  render();
});

function renderCoreStatus(status) {
  coreStatus.textContent = status.installed ? '已安装' : '未安装';
  coreTarget.textContent = status.installed ? `已安装 · ${status.target}` : `${status.target} · 点击下载核心`;
  coreInstallButton.textContent = status.installed ? '重新下载' : '下载核心';
  coreInstallButton.disabled = false;
}

function showCoreModal(status) {
  downloadProxyInput.value = '';
  coreMessage.textContent = '';
  progressPanel.hidden = true;
  coreSettingsForm.classList.remove('downloading');
  coreModal.hidden = false;
  downloadProxyInput.focus();
}

function closeCoreModal() {
  if (downloadActive) return;
  coreModal.hidden = true;
}

function formatBytes(bytes) {
  if (!bytes) return '大小未知';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function renderDownloadEvent(event) {
  if (event.phase === 'ready') {
    progressPanel.hidden = false;
    downloadStatus.textContent = `准备下载 ${event.version || ''}`;
    downloadDetails.textContent = '正在连接 GitHub...';
    return;
  }
  if (event.phase === 'download') {
    progressPanel.hidden = false;
    const percent = event.percent ?? 0;
    progressBar.style.width = `${percent}%`;
    downloadPercent.textContent = event.percent === null ? '...' : `${percent}%`;
    downloadStatus.textContent = event.status === 'paused' ? '已暂停' : '下载中';
    downloadDetails.textContent = `${formatBytes(event.received)} / ${formatBytes(event.total)}`;
    pauseButton.textContent = event.status === 'paused' ? '继续' : '暂停';
    return;
  }
  if (event.phase === 'extract') {
    downloadStatus.textContent = '正在解压并安装';
    downloadPercent.textContent = '100%';
    progressBar.style.width = '100%';
    downloadDetails.textContent = '请稍候...';
    pauseButton.disabled = true;
    return;
  }
  if (event.phase === 'complete') {
    downloadActive = false;
    renderCoreStatus(event);
    coreMessage.textContent = `核心 ${event.version} 安装完成。`;
    coreMessage.className = 'form-message success';
    progressPanel.hidden = true;
    coreSettingsForm.classList.remove('downloading');
    startDownloadButton.disabled = false;
    startDownloadButton.textContent = '重新下载核心';
    return;
  }
  if (event.phase === 'cancelled' || event.phase === 'error') {
    downloadActive = false;
    coreMessage.textContent = event.phase === 'cancelled' ? '下载已撤销。' : event.message;
    coreMessage.className = 'form-message error';
    progressPanel.hidden = event.phase === 'cancelled';
    downloadStatus.textContent = event.phase === 'cancelled' ? '已撤销' : '下载失败';
    pauseButton.disabled = true;
    cancelDownloadButton.disabled = true;
    coreSettingsForm.classList.remove('downloading');
    startDownloadButton.disabled = false;
    startDownloadButton.textContent = '保存设置并下载';
  }
}

async function loadCoreStatus() {
  if (!window.coreApi) {
    coreStatus.textContent = '开发模式';
    coreTarget.textContent = '请通过 Electron 启动';
    return;
  }
  renderCoreStatus(await window.coreApi.getStatus());
}

coreInstallButton.addEventListener('click', async () => showCoreModal(await window.coreApi.getStatus()));
document.querySelector('#closeCoreModal').addEventListener('click', closeCoreModal);
document.querySelector('#cancelCoreModal').addEventListener('click', closeCoreModal);
coreModal.addEventListener('click', (event) => {
  if (event.target === coreModal) closeCoreModal();
});

coreSettingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  coreMessage.textContent = '';
  startDownloadButton.disabled = true;
  try {
    await window.coreApi.startDownload(downloadProxyInput.value.trim());
    downloadActive = true;
    progressPanel.hidden = false;
    coreSettingsForm.classList.add('downloading');
    downloadStatus.textContent = '准备下载...';
    pauseButton.disabled = false;
  } catch (error) {
    coreMessage.textContent = error.message;
    coreMessage.className = 'form-message error';
    startDownloadButton.disabled = false;
  }
});

pauseButton.addEventListener('click', async () => {
  if (pauseButton.textContent === '继续') {
    await window.coreApi.resumeDownload();
  } else {
    await window.coreApi.pauseDownload();
  }
});

cancelDownloadButton.addEventListener('click', async () => {
  await window.coreApi.cancelDownload();
});

openLogButton.addEventListener('click', async () => {
  const error = await window.coreApi.openLog();
  if (error) {
    coreMessage.textContent = `打开日志失败：${error}`;
    coreMessage.className = 'form-message error';
  }
});

window.coreApi?.onDownloadEvent(renderDownloadEvent);
render();
loadCoreStatus();

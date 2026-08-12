const form = document.querySelector('#subscriptionForm');
const list = document.querySelector('#subscriptionList');
const count = document.querySelector('#subscriptionCount');
const message = document.querySelector('#formMessage');
const refreshAllButton = document.querySelector('#refreshAllButton');
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
const nodeList = document.querySelector('#nodeList');
const nodeCountLabel = document.querySelector('#nodeCountLabel');
const nodeSubscriptionFilter = document.querySelector('#nodeSubscriptionFilter');
const nodeTypeFilter = document.querySelector('#nodeTypeFilter');
const nodeStatusFilter = document.querySelector('#nodeStatusFilter');
const nodeModal = document.querySelector('#nodeModal');
const nodeSettingsForm = document.querySelector('#nodeSettingsForm');
const nodeModalDescription = document.querySelector('#nodeModalDescription');
const nodePortInput = document.querySelector('#nodePortInput');
const nodeMessage = document.querySelector('#nodeMessage');

let subscriptions = [];
let nodeView = { runningNodeId: null, nodes: [] };
let nodeFilterSubscription = 'all';
let nodeFilterType = 'all';
let nodeFilterStatus = 'all';
let pendingNodeId = null;
let downloadActive = false;

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function statusLabel(subscription) {
  const labels = { pending: '等待首次刷新', updating: '更新中...', ok: '已更新', error: '更新失败' };
  return labels[subscription.status] || subscription.status;
}

function statusClass(subscription) {
  if (subscription.status === 'error') return 'status-error';
  if (subscription.status === 'updating') return 'status-updating';
  if (subscription.status === 'ok') return 'status-ok';
  return '';
}

function formatTime(iso) {
  return iso ? new Date(iso).toLocaleString() : '尚未更新';
}

function subscriptionCard(subscription) {
  const meta = [
    `${subscription.nodeCount} 个节点`,
    `更新于 ${formatTime(subscription.lastUpdatedAt)}`
  ].join(' · ');
  const errorLine = subscription.error ? `<p class="subscription-error">${escapeHtml(subscription.error)}</p>` : '';
  return `
    <article class="card subscription-item" data-id="${subscription.id}">
      <div class="subscription-logo">${escapeHtml(subscription.name.slice(0, 1).toUpperCase())}</div>
      <div class="subscription-main">
        <h3><span class="subscription-name">${escapeHtml(subscription.name)}</span></h3>
        <p>${escapeHtml(subscription.url)}</p>
        <span class="subscription-meta"><i class="${statusClass(subscription)}"></i>${statusLabel(subscription)} · ${meta}</span>
        ${errorLine}
      </div>
      <div class="subscription-actions">
        <button class="secondary refresh-button" type="button">刷新</button>
        <button class="secondary rename-button" type="button">重命名</button>
        <button class="delete-button" type="button" aria-label="删除 ${escapeHtml(subscription.name)}">删除</button>
      </div>
    </article>`;
}

function render() {
  count.textContent = subscriptions.length;
  list.innerHTML = subscriptions.length
    ? subscriptions.map(subscriptionCard).join('')
    : `<div class="card empty-state">
         <div class="empty-icon">⌁</div>
         <h3>还没有订阅</h3>
         <p class="muted">添加订阅链接后，节点会在这里展示。</p>
       </div>`;
  renderNodeFilters();
}

async function loadSubscriptions() {
  if (!window.subApi) return;
  subscriptions = await window.subApi.list();
  render();
  await loadNodeList();
}

async function setMessage(text, kind) {
  message.textContent = text;
  message.className = `form-message ${kind || ''}`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const name = formData.get('name').trim();
  const url = formData.get('url').trim();
  await setMessage('');
  try {
    const subscription = await window.subApi.add({ name, url });
    await setMessage('订阅已添加，正在拉取节点...', 'success');
    form.reset();
    await window.subApi.refresh(subscription.id);
    await loadSubscriptions();
    await setMessage('订阅已添加并解析完成。', 'success');
  } catch (error) {
    await loadSubscriptions();
    await setMessage(error.message, 'error');
  }
});

async function renameSubscription(id) {
  const main = list.querySelector(`.subscription-item[data-id="${id}"] .subscription-main`);
  const nameSpan = main.querySelector('.subscription-name');
  const input = document.createElement('input');
  input.value = nameSpan.textContent;
  input.maxLength = 40;
  nameSpan.replaceWith(input);
  input.focus();
  input.select();
  const commit = async () => {
    const next = input.value.trim();
    if (next && next !== nameSpan.textContent) {
      try {
        await window.subApi.update(id, next);
      } catch (error) {
        await setMessage(error.message, 'error');
      }
    }
    await loadSubscriptions();
    await setMessage('');
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { input.blur(); event.preventDefault(); }
    if (event.key === 'Escape') { input.value = nameSpan.textContent; input.blur(); }
  });
  input.addEventListener('blur', commit);
}

list.addEventListener('click', async (event) => {
  const card = event.target.closest('.subscription-item');
  if (!card) return;
  const id = card.dataset.id;
  if (event.target.closest('.delete-button')) {
    await window.subApi.remove(id);
    await loadSubscriptions();
    return;
  }
  if (event.target.closest('.rename-button')) {
    await renameSubscription(id);
    return;
  }
  if (event.target.closest('.refresh-button')) {
    const button = event.target.closest('.refresh-button');
    button.disabled = true;
    button.textContent = '更新中';
    try {
      await window.subApi.refresh(id);
    } catch (error) {
      await setMessage(error.message, 'error');
    } finally {
      await loadSubscriptions();
    }
  }
});

refreshAllButton.addEventListener('click', async () => {
  refreshAllButton.disabled = true;
  refreshAllButton.textContent = '更新中...';
  try {
    await window.subApi.refreshAll();
    await setMessage('');
  } catch (error) {
    await setMessage(error.message, 'error');
  } finally {
    refreshAllButton.disabled = false;
    refreshAllButton.textContent = '↻ 刷新全部';
    await loadSubscriptions();
  }
});

async function loadNodeList() {
  if (!window.nodeApi) return;
  const filters = {};
  if (nodeFilterSubscription !== 'all') filters.subscriptionId = nodeFilterSubscription;
  if (nodeFilterType !== 'all') filters.type = nodeFilterType;
  nodeView = await window.nodeApi.list(filters);
  if (nodeFilterStatus !== 'all') {
    const runningIds = new Set((nodeView.runningNodes || []).map((proxy) => proxy.nodeId));
    nodeView.nodes = nodeView.nodes.filter((node) => runningIds.has(node.id) === (nodeFilterStatus === 'running'));
  }
  renderNodeList();
}

function renderNodeFilters() {
  const current = nodeFilterSubscription;
  nodeSubscriptionFilter.innerHTML = [
    '<option value="all">全部订阅</option>',
    ...subscriptions.map((subscription) => `<option value="${subscription.id}">${escapeHtml(subscription.name)}</option>`)
  ].join('');
  if ([...nodeSubscriptionFilter.options].some((option) => option.value === current)) {
    nodeSubscriptionFilter.value = current;
  } else {
    nodeFilterSubscription = 'all';
  }
}

const TYPE_BADGES = { ss: 'SS', vmess: 'VM', vless: 'VL', trojan: 'TR', socks5: 'S5', http: 'HTTP', hysteria2: 'HY' };

function renderNodeList() {
  if (!subscriptions.length) {
    nodeList.innerHTML = `<div class="card empty-state"><div class="empty-icon">⌁</div><h3>还没有订阅</h3><p class="muted">先在上方添加订阅并刷新。</p></div>`;
    nodeCountLabel.textContent = '0 个节点';
    return;
  }
  const runningById = new Map((nodeView.runningNodes || []).map((proxy) => [proxy.nodeId, proxy]));
  const nodes = nodeView.nodes;
  nodeCountLabel.textContent = `${nodes.length} 个节点`;
  if (!nodes.length) {
    nodeList.innerHTML = `<div class="card empty-state"><div class="empty-icon">⌁</div><h3>没有节点</h3><p class="muted">点击订阅管理中的“刷新”拉取节点。</p></div>`;
    return;
  }
  nodeList.innerHTML = nodes.map((node) => {
    const badge = TYPE_BADGES[node.type] || node.type.toUpperCase().slice(0, 2);
    const proxy = runningById.get(node.id);
    const running = Boolean(proxy);
    const unsupported = !node.supported;
    return `
      <article class="card node-item ${running ? 'running' : ''} ${unsupported ? 'unsupported-item' : ''}" data-id="${node.id}" role="button" tabindex="${unsupported ? '-1' : '0'}" aria-disabled="${unsupported}">
        <div class="node-badge">${escapeHtml(badge)}</div>
        <div class="node-main">
          <h3>${escapeHtml(node.name)}${running ? ' <span class="selected-tag">代理运行中</span>' : ''}</h3>
          <p>${escapeHtml(node.type)} · ${escapeHtml(node.server)}:${escapeHtml(node.port)}${unsupported ? ` · <span class="unsupported">${escapeHtml(node.error)}</span>` : ''}</p>
          ${proxy ? `<span class="node-proxy-meta">代理：${escapeHtml(proxy.mode)} · ${escapeHtml(proxy.listen)}:${escapeHtml(proxy.port)}</span>` : ''}
        </div>
        <span class="node-action">${unsupported ? '不支持' : running ? '停止代理' : '启动代理'}</span>
      </article>`;
  }).join('');
}

nodeSubscriptionFilter.addEventListener('change', async () => {
  nodeFilterSubscription = nodeSubscriptionFilter.value;
  await loadNodeList();
});

nodeTypeFilter.addEventListener('change', async () => {
  nodeFilterType = nodeTypeFilter.value;
  await loadNodeList();
});

nodeStatusFilter.addEventListener('change', async () => {
  nodeFilterStatus = nodeStatusFilter.value;
  await loadNodeList();
});

function closeNodeModal() {
  nodeModal.hidden = true;
  pendingNodeId = null;
  nodeMessage.textContent = '';
}

function openNodeModal(node) {
  pendingNodeId = node.id;
  nodeModalDescription.textContent = `为“${node.name}”设置本地代理监听参数。代理无认证，启动后会合并到当前 sing-box 配置并重启。`;
  nodePortInput.value = 2080;
  nodeMessage.textContent = '';
  nodeModal.hidden = false;
  nodePortInput.focus();
  nodePortInput.select();
}

nodeList.addEventListener('click', async (event) => {
  const item = event.target.closest('.node-item');
  if (!item || item.classList.contains('unsupported-item')) return;
  try {
    const node = nodeView.nodes.find((entry) => entry.id === item.dataset.id);
    if (item.classList.contains('running')) await window.nodeApi.stop(item.dataset.id);
    else openNodeModal(node);
    await loadNodeList();
  } catch (error) {
    await setMessage(error.message, 'error');
  }
});

nodeSettingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  nodeMessage.textContent = '';
  try {
    await window.nodeApi.start({ id: pendingNodeId, mode: 'mixed', port: Number(nodePortInput.value) });
    closeNodeModal();
    await loadNodeList();
  } catch (error) {
    nodeMessage.textContent = error.message;
    nodeMessage.className = 'form-message error';
  }
});

document.querySelector('#closeNodeModal').addEventListener('click', closeNodeModal);
document.querySelector('#cancelNodeModal').addEventListener('click', closeNodeModal);
nodeModal.addEventListener('click', (event) => {
  if (event.target === nodeModal) closeNodeModal();
});

nodeList.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const item = event.target.closest('.node-item');
  if (!item || item.classList.contains('unsupported-item')) return;
  event.preventDefault();
  item.click();
});

document.querySelectorAll('.nav-item').forEach((navItem) => {
  navItem.addEventListener('click', (event) => {
    event.preventDefault();
    const targetId = navItem.getAttribute('href').slice(1);
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
    navItem.classList.add('active');
    document.querySelectorAll('main .content').forEach((section) => { section.hidden = !(section.id === targetId); });
  });
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
window.nodeApi?.onStatus(loadNodeList);
loadSubscriptions();
loadCoreStatus();

const form = document.querySelector('#subscriptionForm');
const list = document.querySelector('#subscriptionList');
const count = document.querySelector('#subscriptionCount');
const message = document.querySelector('#formMessage');
const refreshAllButton = document.querySelector('#refreshAllButton');
const coreStatus = document.querySelector('#coreStatus');
const coreRuntimeDot = document.querySelector('#coreRuntimeDot');
const coreDownloadStatus = document.querySelector('#coreDownloadStatus');
const coreDownloadDot = document.querySelector('#coreDownloadDot');
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
const nodeSelectionLabel = document.querySelector('#nodeSelectionLabel');
const startSelectedNodesButton = document.querySelector('#startSelectedNodesButton');
const stopSelectedNodesButton = document.querySelector('#stopSelectedNodesButton');
const batchNodeModal = document.querySelector('#batchNodeModal');
const batchNodeSettingsForm = document.querySelector('#batchNodeSettingsForm');
const batchNodeSettingsList = document.querySelector('#batchNodeSettingsList');
const batchNodeMessage = document.querySelector('#batchNodeMessage');
const nodeListViewButton = document.querySelector('#nodeListViewButton');
const nodeTableViewButton = document.querySelector('#nodeTableViewButton');
const nodeSelectionMenu = document.querySelector('.node-selection-menu');
const settingsRunningCount = document.querySelector('#settingsRunningCount');
const settingsSubscriptionCount = document.querySelector('#settingsSubscriptionCount');
const settingsNodeCount = document.querySelector('#settingsNodeCount');
const settingsRuntimeStatus = document.querySelector('#settingsRuntimeStatus');
const settingsCoreStatus = document.querySelector('#settingsCoreStatus');
const settingsConfigPath = document.querySelector('#settingsConfigPath');
const settingsCoreTarget = document.querySelector('#settingsCoreTarget');
const defaultPortForm = document.querySelector('#defaultPortForm');
const defaultPortInput = document.querySelector('#defaultPortInput');
const settingsMessage = document.querySelector('#settingsMessage');
const settingsDownloadCore = document.querySelector('#settingsDownloadCore');
const settingsCleanupCore = document.querySelector('#settingsCleanupCore');
const settingsOpenDownloadLog = document.querySelector('#settingsOpenDownloadLog');
const settingsOpenCoreLog = document.querySelector('#settingsOpenCoreLog');
const settingsSaveConfig = document.querySelector('#settingsSaveConfig');

let subscriptions = [];
let nodeView = { runningNodeId: null, nodes: [] };
let nodeFilterSubscription = 'all';
let nodeFilterType = 'all';
let nodeFilterStatus = 'all';
let pendingNodeId = null;
let selectedNodeIds = new Set();
let downloadActive = false;
let defaultPort = 12080;
let nodeLayout = localStorage.getItem('nodeLayout') === 'table' ? 'table' : 'list';
const nodeTestResults = new Map();
const nodeTestPending = new Set();

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function firstGrapheme(value) {
  return new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(String(value)).containing(0)?.segment || '';
}

const FLAG_SVG = {
  CN: '<rect width="24" height="16" fill="#de2910"/><path fill="#ffde00" d="m5 2 1 2.8L9 5.9 6 6l-1 2.8L4 6l-3-.1 3-1.2z"/>',
  DE: '<path fill="#000" d="M0 0h24v5.33H0z"/><path fill="#d00" d="M0 5.33h24v5.34H0z"/><path fill="#ffce00" d="M0 10.67h24V16H0z"/>',
  FR: '<path fill="#0055a4" d="M0 0h8v16H0z"/><path fill="#fff" d="M8 0h8v16H8z"/><path fill="#ef4135" d="M16 0h8v16h-8z"/>',
  GB: '<rect width="24" height="16" fill="#012169"/><path stroke="#fff" stroke-width="4" d="m0 0 24 16M24 0 0 16"/><path stroke="#c8102e" stroke-width="2" d="m0 0 24 16M24 0 0 16"/><path stroke="#fff" stroke-width="6" d="M12 0v16M0 8h24"/><path stroke="#c8102e" stroke-width="3" d="M12 0v16M0 8h24"/>',
  HK: '<rect width="24" height="16" rx="1" fill="#de2910"/><circle cx="12" cy="8" r="4" fill="#fff"/><circle cx="12" cy="8" r="2" fill="#de2910"/>',
  IN: '<path fill="#ff9933" d="M0 0h24v5.33H0z"/><path fill="#fff" d="M0 5.33h24v5.34H0z"/><path fill="#128807" d="M0 10.67h24V16H0z"/><circle cx="12" cy="8" r="2" fill="none" stroke="#000080" stroke-width=".6"/>',
  IT: '<path fill="#009246" d="M0 0h8v16H0z"/><path fill="#fff" d="M8 0h8v16H8z"/><path fill="#ce2b37" d="M16 0h8v16h-8z"/>',
  JP: '<rect width="24" height="16" rx="1" fill="#fff"/><circle cx="12" cy="8" r="4" fill="#bc002d"/>',
  KR: '<rect width="24" height="16" rx="1" fill="#fff"/><circle cx="12" cy="8" r="3.2" fill="#cd2e3a"/><path fill="#0047a0" d="M12 8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 1 1 0-6.4z"/>',
  MY: '<path fill="#cc0001" d="M0 0h24v1.78H0zM0 3.56h24v1.78H0zM0 7.12h24V8.9H0zM0 10.68h24v1.78H0zM0 14.24h24V16H0z"/><path fill="#010066" d="M0 0h11v9H0z"/><circle cx="5" cy="4.5" r="2.6" fill="#fc0"/>',
  NL: '<path fill="#ae1c28" d="M0 0h24v5.33H0z"/><path fill="#fff" d="M0 5.33h24v5.34H0z"/><path fill="#21468b" d="M0 10.67h24V16H0z"/>',
  PH: '<path fill="#0038a8" d="M0 0h24v8H0z"/><path fill="#ce1126" d="M0 8h24v8H0z"/><path fill="#fff" d="m0 0 11 8L0 16z"/>',
  RU: '<path fill="#fff" d="M0 0h24v5.33H0z"/><path fill="#0039a6" d="M0 5.33h24v5.34H0z"/><path fill="#d52b1e" d="M0 10.67h24V16H0z"/>',
  SG: '<path fill="#ed2939" d="M0 0h24v8H0z"/><path fill="#fff" d="M0 8h24v8H0z"/><circle cx="6" cy="4" r="2.5" fill="#fff"/><circle cx="7" cy="4" r="2.1" fill="#ed2939"/>',
  TH: '<path fill="#a51931" d="M0 0h24v2.67H0zM0 13.33h24V16H0z"/><path fill="#f4f5f8" d="M0 2.67h24v2.67H0zM0 10.67h24v2.67H0z"/><path fill="#2d2a4a" d="M0 5.33h24v5.34H0z"/>',
  TW: '<rect width="24" height="16" rx="1" fill="#fe0000"/><path fill="#000095" d="M0 0h11v9H0z"/><circle cx="5.5" cy="4.5" r="2.4" fill="#fff"/>',
  US: '<path fill="#b22234" d="M0 0h24v1.23H0zM0 2.46h24v1.23H0zM0 4.92h24v1.23H0zM0 7.38h24v1.23H0zM0 9.84h24v1.23H0zM0 12.3h24v1.23H0zM0 14.76h24V16H0z"/><path fill="#3c3b6e" d="M0 0h10.5v8.6H0z"/>',
  VN: '<rect width="24" height="16" rx="1" fill="#da251d"/><path fill="#ff0" d="m12 3 1.18 3.63H17l-3.09 2.24 1.18 3.63L12 10.25l-3.09 2.25 1.18-3.63L7 6.63h3.82z"/>'
};

function flagCode(value) {
  const grapheme = firstGrapheme(value);
  const points = [...grapheme].map((character) => character.codePointAt(0));
  if (points.length !== 2 || points.some((point) => point < 0x1f1e6 || point > 0x1f1ff)) return '';
  return points.map((point) => String.fromCharCode(point - 0x1f1e6 + 65)).join('');
}

function flagIcon(code) {
  const content = FLAG_SVG[code] || `<rect width="24" height="16" rx="1" fill="#edf4ff"/><text x="12" y="11" text-anchor="middle" fill="#3478f6" font-size="6" font-weight="700">${code}</text>`;
  return `<svg class="node-flag" viewBox="0 0 24 16" role="img" aria-label="${code}">${content}</svg>`;
}

function renderName(value) {
  const text = String(value);
  const code = flagCode(text);
  return code ? `${flagIcon(code)}${escapeHtml(text.slice(firstGrapheme(text).length))}` : escapeHtml(text);
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
      <div class="subscription-logo">${flagCode(subscription.name) ? flagIcon(flagCode(subscription.name)) : escapeHtml(firstGrapheme(subscription.name).toUpperCase())}</div>
      <div class="subscription-main">
        <h3><span class="subscription-name">${renderName(subscription.name)}</span></h3>
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
  settingsSubscriptionCount.textContent = subscriptions.length;
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
  const allNodes = filters.subscriptionId || filters.type ? await window.nodeApi.list({}) : nodeView;
  settingsNodeCount.textContent = allNodes.nodes.length;
  settingsRunningCount.textContent = (allNodes.runningNodes || []).length;
  settingsRuntimeStatus.textContent = allNodes.runningNodes?.length ? `运行中 · ${allNodes.runningNodes.length} 个节点` : '未运行';
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
  nodeList.classList.toggle('table-view', nodeLayout === 'table');
  nodeListViewButton.classList.toggle('active', nodeLayout === 'list');
  nodeTableViewButton.classList.toggle('active', nodeLayout === 'table');
  nodeListViewButton.setAttribute('aria-pressed', String(nodeLayout === 'list'));
  nodeTableViewButton.setAttribute('aria-pressed', String(nodeLayout === 'table'));
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
    const tableRow = nodeLayout === 'table';
    const test = nodeTestResults.get(node.id);
    const testOutput = test
      ? `<span class="node-test-result ${test.error ? 'error' : ''}">${test.error ? escapeHtml(test.error) : `IP ${escapeHtml(test.ip)} · ${escapeHtml(test.region)} · ${test.latency} ms`}</span>`
      : '';
    return `
      <article class="card node-item ${tableRow ? 'table-row' : ''} ${running ? 'running' : ''} ${unsupported ? 'unsupported-item' : ''}" data-id="${node.id}" role="button" tabindex="${unsupported ? '-1' : '0'}" aria-disabled="${unsupported}">
        <input class="node-check" type="checkbox" data-node-id="${node.id}" ${selectedNodeIds.has(node.id) ? 'checked' : ''} ${unsupported ? 'disabled' : ''} aria-label="勾选 ${escapeHtml(node.name)}" />
        <div class="node-badge">${escapeHtml(badge)}</div>
        <div class="node-main">
          <h3>${renderName(node.name)}${running && !tableRow ? ' <span class="selected-tag">代理运行中</span>' : ''}</h3>
          <p>${escapeHtml(node.type)} · ${escapeHtml(node.server)}:${escapeHtml(node.port)}${unsupported ? ` · <span class="unsupported">${escapeHtml(node.error)}</span>` : ''}</p>
          ${proxy && !tableRow ? `<span class="node-proxy-meta">代理：${escapeHtml(proxy.mode)} · ${escapeHtml(proxy.listen)}:${escapeHtml(proxy.port)}</span>${testOutput}` : ''}
        </div>
        ${tableRow ? `<div class="node-table-proxy">${proxy ? `<span class="proxy-status running-status">运行中</span><span>${escapeHtml(proxy.listen)}:${escapeHtml(proxy.port)}</span>${testOutput}` : '<span class="proxy-status">未启动</span>'}</div>` : ''}
        ${proxy ? `<button class="node-test" type="button" data-node-id="${node.id}" ${nodeTestPending.has(node.id) ? 'disabled' : ''}>${nodeTestPending.has(node.id) ? '测试中...' : '测试 IP / 延迟'}</button>` : ''}
        <span class="node-action">${unsupported ? '不支持' : running ? '停止代理' : '启动代理'}</span>
      </article>`;
  }).join('');
  updateNodeSelectionActions();
}

function setNodeLayout(layout) {
  nodeLayout = layout === 'table' ? 'table' : 'list';
  localStorage.setItem('nodeLayout', nodeLayout);
  renderNodeList();
}

nodeListViewButton.addEventListener('click', () => setNodeLayout('list'));
nodeTableViewButton.addEventListener('click', () => setNodeLayout('table'));

function updateNodeSelection(action) {
  const runningIds = new Set((nodeView.runningNodes || []).map((proxy) => proxy.nodeId));
  const nodes = nodeView.nodes.filter((node) => node.supported);
  if (action === 'none') selectedNodeIds.clear();
  else if (action === 'invert') nodes.forEach((node) => selectedNodeIds.has(node.id) ? selectedNodeIds.delete(node.id) : selectedNodeIds.add(node.id));
  else nodes.forEach((node) => {
    const matches = action === 'all' || (action === 'running' ? runningIds.has(node.id) : !runningIds.has(node.id));
    if (matches) selectedNodeIds.add(node.id);
    else if (action !== 'all') selectedNodeIds.delete(node.id);
  });
  renderNodeList();
  nodeSelectionMenu.open = false;
}

nodeSelectionMenu.addEventListener('click', (event) => {
  const button = event.target.closest('[data-selection-action]');
  if (button) updateNodeSelection(button.dataset.selectionAction);
});

async function testNodeIp(nodeId) {
  nodeTestPending.add(nodeId);
  nodeTestResults.delete(nodeId);
  renderNodeList();
  try {
    nodeTestResults.set(nodeId, await window.nodeApi.testIp(nodeId));
  } catch (error) {
    nodeTestResults.set(nodeId, { error: error.message });
  } finally {
    nodeTestPending.delete(nodeId);
    renderNodeList();
  }
}

function updateNodeSelectionActions() {
  const count = selectedNodeIds.size;
  nodeSelectionLabel.textContent = `已勾选 ${count} 个节点`;
  startSelectedNodesButton.disabled = count === 0;
  stopSelectedNodesButton.disabled = count === 0;
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
  nodePortInput.value = defaultPort;
  nodeMessage.textContent = '';
  nodeModal.hidden = false;
  nodePortInput.focus();
  nodePortInput.select();
}

function closeBatchNodeModal() {
  batchNodeModal.hidden = true;
  batchNodeMessage.textContent = '';
}

function openBatchNodeModal() {
  const nodes = nodeView.nodes.filter((node) => selectedNodeIds.has(node.id) && node.supported);
  const runningById = new Map((nodeView.runningNodes || []).map((proxy) => [proxy.nodeId, proxy]));
  const usedPorts = new Set((nodeView.runningNodes || []).map((proxy) => proxy.port));
  let nextPort = defaultPort;
  batchNodeSettingsList.innerHTML = nodes.map((node) => {
    const current = runningById.get(node.id);
    if (current) return `<label class="batch-node-setting"><span>${escapeHtml(node.name)}</span><input type="number" min="1" max="65535" step="1" value="${current.port}" data-batch-node-id="${node.id}" required /></label>`;
    while (usedPorts.has(nextPort)) nextPort += 1;
    const port = nextPort++;
    usedPorts.add(port);
    return `<label class="batch-node-setting"><span>${escapeHtml(node.name)}</span><input type="number" min="1" max="65535" step="1" value="${port}" data-batch-node-id="${node.id}" required /></label>`;
  }).join('');
  batchNodeMessage.textContent = '';
  batchNodeModal.hidden = false;
}

nodeList.addEventListener('click', async (event) => {
  if (event.target.closest('.node-check')) return;
  const testButton = event.target.closest('.node-test');
  if (testButton) {
    event.stopPropagation();
    await testNodeIp(testButton.dataset.nodeId);
    return;
  }
  const item = event.target.closest('.node-item');
  if (!item || item.classList.contains('unsupported-item')) return;
  try {
    const node = nodeView.nodes.find((entry) => entry.id === item.dataset.id);
    if (item.classList.contains('running')) {
      if (!window.confirm(`确定关闭“${node.name}”的代理吗？关闭后会重启 sing-box。`)) return;
      await window.nodeApi.stop(item.dataset.id);
      selectedNodeIds.delete(item.dataset.id);
    } else openNodeModal(node);
    await loadNodeList();
  } catch (error) {
    await setMessage(error.message, 'error');
  }
});

nodeList.addEventListener('change', (event) => {
  const checkbox = event.target.closest('.node-check');
  if (!checkbox) return;
  if (checkbox.checked) selectedNodeIds.add(checkbox.dataset.nodeId);
  else selectedNodeIds.delete(checkbox.dataset.nodeId);
  updateNodeSelectionActions();
});

startSelectedNodesButton.addEventListener('click', openBatchNodeModal);

stopSelectedNodesButton.addEventListener('click', async () => {
  const nodes = nodeView.nodes.filter((node) => selectedNodeIds.has(node.id));
  const running = nodes.filter((node) => (nodeView.runningNodes || []).some((proxy) => proxy.nodeId === node.id));
  if (!running.length) return;
  if (!window.confirm(`确定关闭选中的 ${running.length} 个节点代理吗？关闭后会重启 sing-box。`)) return;
  try {
    await window.nodeApi.stop(running.map((node) => node.id));
    running.forEach((node) => selectedNodeIds.delete(node.id));
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

batchNodeSettingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  batchNodeMessage.textContent = '';
  try {
    const nodes = [...batchNodeSettingsList.querySelectorAll('[data-batch-node-id]')].map((input) => ({ id: input.dataset.batchNodeId, port: Number(input.value), mode: 'mixed' }));
    await window.nodeApi.start({ nodes });
    selectedNodeIds.clear();
    closeBatchNodeModal();
    await loadNodeList();
  } catch (error) {
    batchNodeMessage.textContent = error.message;
    batchNodeMessage.className = 'form-message error';
  }
});

document.querySelector('#closeBatchNodeModal').addEventListener('click', closeBatchNodeModal);
document.querySelector('#cancelBatchNodeModal').addEventListener('click', closeBatchNodeModal);
batchNodeModal.addEventListener('click', (event) => {
  if (event.target === batchNodeModal) closeBatchNodeModal();
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

function setStatusDot(dot, status) {
  dot.className = `core-status-dot status-${status}`;
}

function renderCoreRuntimeStatus(status) {
  const runningCount = status.proxy?.nodes?.length || status.runningNodes?.length || 0;
  coreStatus.textContent = runningCount ? `运行中（${runningCount} 个代理）` : status.installed ? '已停止' : '未安装';
  setStatusDot(coreRuntimeDot, runningCount ? 'green' : status.installed ? 'gray' : 'red');
  if (settingsSaveConfig) settingsSaveConfig.disabled = !runningCount;
}

function renderCoreDownloadStatus(status, fallbackInstalled = false) {
  const labels = {
    starting: '准备下载', ready: '准备下载', downloading: '下载中', paused: '已暂停',
    extracting: '安装中', complete: '已完成', cancelled: '已撤销', error: '下载失败'
  };
  const value = status?.status || (fallbackInstalled ? 'complete' : 'not-installed');
  coreDownloadStatus.textContent = labels[value] || '未下载';
  setStatusDot(coreDownloadDot, value === 'complete' ? 'green' : ['starting', 'ready', 'downloading', 'paused', 'extracting'].includes(value) ? 'blue' : ['error', 'cancelled'].includes(value) ? 'red' : 'gray');
}

function renderCoreStatus(status) {
  renderCoreRuntimeStatus(status);
  renderCoreDownloadStatus(status.download, status.installed);
  coreTarget.textContent = status.installed ? `已安装 · ${status.target}` : `${status.target} · 点击下载核心`;
  coreInstallButton.textContent = status.installed ? '重新下载' : '下载核心';
  coreInstallButton.disabled = false;
  if (settingsCoreStatus) settingsCoreStatus.textContent = status.proxy?.nodes?.length ? `运行中 · ${status.proxy.nodes.length} 个节点` : status.installed ? '已安装，未运行' : '未安装';
  if (settingsConfigPath) settingsConfigPath.textContent = status.proxy?.configPath || '未生成';
  if (settingsCoreTarget) settingsCoreTarget.textContent = status.installed ? `已安装 · ${status.target}` : `${status.target} · 未安装`;
  if (defaultPortInput && status.defaultPort) {
    defaultPort = status.defaultPort;
    defaultPortInput.value = defaultPort;
  }
}

settingsSaveConfig.addEventListener('click', async () => {
  try {
    const result = await window.coreApi.saveConfig();
    if (!result.canceled) {
      settingsMessage.textContent = `配置已保存到：${result.path}`;
      settingsMessage.className = 'form-message success';
    }
  } catch (error) {
    settingsMessage.textContent = error.message;
    settingsMessage.className = 'form-message error';
  }
});

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
  renderCoreDownloadStatus(event);
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
    coreDownloadStatus.textContent = '不可用';
    setStatusDot(coreRuntimeDot, 'gray');
    setStatusDot(coreDownloadDot, 'gray');
    coreTarget.textContent = '请通过 Electron 启动';
    return;
  }
  renderCoreStatus(await window.coreApi.getStatus());
}

async function loadSettings() {
  if (!window.settingsApi) return;
  const settings = await window.settingsApi.get();
  defaultPort = settings.defaultPort;
  defaultPortInput.value = defaultPort;
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

defaultPortForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    defaultPort = (await window.settingsApi.setPort(Number(defaultPortInput.value))).defaultPort;
    defaultPortInput.value = defaultPort;
    settingsMessage.textContent = `默认代理端口已保存为 ${defaultPort}。`;
    settingsMessage.className = 'form-message success';
  } catch (error) {
    settingsMessage.textContent = error.message;
    settingsMessage.className = 'form-message error';
  }
});

settingsDownloadCore.addEventListener('click', async () => showCoreModal(await window.coreApi.getStatus()));
settingsOpenDownloadLog.addEventListener('click', async () => {
  const error = await window.coreApi.openLog();
  if (error) { settingsMessage.textContent = `打开日志失败：${error}`; settingsMessage.className = 'form-message error'; }
});
settingsOpenCoreLog.addEventListener('click', async () => {
  const error = await window.coreApi.openCoreLog();
  if (error) { settingsMessage.textContent = `打开日志失败：${error}`; settingsMessage.className = 'form-message error'; }
});
settingsCleanupCore.addEventListener('click', async () => {
  if (!window.confirm('确定清理 sing-box 核心和运行配置吗？订阅和节点数据不会删除。')) return;
  settingsCleanupCore.disabled = true;
  try {
    await window.coreApi.cleanup();
    await loadCoreStatus();
    settingsMessage.textContent = 'sing-box 核心和运行配置已清理。';
    settingsMessage.className = 'form-message success';
  } catch (error) {
    settingsMessage.textContent = error.message;
    settingsMessage.className = 'form-message error';
  } finally {
    settingsCleanupCore.disabled = false;
  }
});

window.coreApi?.onDownloadEvent(renderDownloadEvent);
window.nodeApi?.onStatus(async (status) => {
  renderCoreRuntimeStatus({ installed: true, runningNodes: status.runningNodes });
  settingsCoreStatus.textContent = status.runningNodes?.length ? `运行中 · ${status.runningNodes.length} 个节点` : '已安装，未运行';
  await loadNodeList();
});
loadSubscriptions();
loadCoreStatus();
loadSettings();

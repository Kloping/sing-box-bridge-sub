const path = require('node:path');
const crypto = require('node:crypto');
const { readJson, writeJson } = require('./store.cjs');
const { parseSubscription } = require('./clash-parser.cjs');

const REQUEST_HEADERS = {
  Accept: '*/*',
  'User-Agent': 'clash-verge/v2.5.2',
  'Accept-Encoding': 'gzip'
};
const TIMEOUT_MS = 20000;
const MAX_BYTES = 5 * 1024 * 1024;

function maskUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '<invalid-url>';
  }
}

function validateUrl(url) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('订阅链接必须是 HTTP 或 HTTPS');
}

async function readBodyLimited(response, limit) {
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) throw new Error('订阅响应体超过 5MB 上限');
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function createSubscriptionService(dataDir) {
  const subscriptionsFile = path.join(dataDir, 'subscriptions.json');
  const nodesFile = path.join(dataDir, 'nodes.json');

  const listSubscriptions = () => readJson(subscriptionsFile, []);
  const saveSubscriptions = (subscriptions) => writeJson(subscriptionsFile, subscriptions);
  const listNodeData = () => readJson(nodesFile, { selectedNodeId: null, nodes: [] });
  const saveNodeData = (nodeData) => writeJson(nodesFile, nodeData);

  function keepSelection(nodeData) {
    if (nodeData.selectedNodeId && !nodeData.nodes.some((node) => node.id === nodeData.selectedNodeId)) {
      nodeData.selectedNodeId = null;
    }
    return nodeData;
  }

  async function addSubscription({ name, url }) {
    const cleanName = String(name || '').trim();
    const cleanUrl = String(url || '').trim();
    if (!cleanName) throw new Error('订阅名称不能为空');
    if (!cleanUrl) throw new Error('订阅链接不能为空');
    validateUrl(cleanUrl);
    const subscriptions = await listSubscriptions();
    if (subscriptions.some((item) => item.url === cleanUrl)) throw new Error('这条订阅已经添加过了');
    const subscription = {
      id: crypto.randomUUID(),
      name: cleanName,
      url: cleanUrl,
      enabled: true,
      lastUpdatedAt: null,
      nodeCount: 0,
      status: 'pending',
      error: null
    };
    subscriptions.unshift(subscription);
    await saveSubscriptions(subscriptions);
    return subscription;
  }

  async function updateSubscription(id, { name }) {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('订阅名称不能为空');
    const subscriptions = await listSubscriptions();
    const subscription = subscriptions.find((item) => item.id === id);
    if (!subscription) throw new Error('订阅不存在');
    subscription.name = cleanName;
    await saveSubscriptions(subscriptions);
    return subscription;
  }

  async function removeSubscription(id) {
    const subscriptions = await listSubscriptions();
    await saveSubscriptions(subscriptions.filter((item) => item.id !== id));
    const nodeData = await listNodeData();
    nodeData.nodes = nodeData.nodes.filter((node) => node.sourceId !== id);
    await saveNodeData(keepSelection(nodeData));
  }

  async function downloadAndParse(subscription) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(subscription.url, { headers: REQUEST_HEADERS, signal: controller.signal });
      if (!response.ok) throw new Error(`订阅请求失败：HTTP ${response.status}`);
      const text = await readBodyLimited(response, MAX_BYTES);
      return parseSubscription(text, subscription.id);
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('订阅请求超时');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function refreshSubscription(id) {
    const subscriptions = await listSubscriptions();
    const subscription = subscriptions.find((item) => item.id === id);
    if (!subscription) throw new Error('订阅不存在');
    subscription.status = 'updating';
    subscription.error = null;
    await saveSubscriptions(subscriptions);
    try {
      const nodes = await downloadAndParse(subscription);
      const nodeData = await listNodeData();
      nodeData.nodes = nodeData.nodes.filter((node) => node.sourceId !== id).concat(nodes);
      await saveNodeData(keepSelection(nodeData));
      subscription.status = 'ok';
      subscription.nodeCount = nodes.length;
      subscription.lastUpdatedAt = new Date().toISOString();
      await saveSubscriptions(subscriptions);
      return subscription;
    } catch (error) {
      subscription.status = 'error';
      subscription.error = error.message;
      await saveSubscriptions(subscriptions);
      throw error;
    }
  }

  async function refreshAll() {
    const subscriptions = await listSubscriptions();
    const results = [];
    // ponytail: sequential to keep single-file JSON writes race-free; parallelize when per-subscription stores exist
    for (const subscription of subscriptions) {
      try {
        results.push({ id: subscription.id, ok: true, data: await refreshSubscription(subscription.id) });
      } catch (error) {
        results.push({ id: subscription.id, ok: false, error: error.message });
      }
    }
    return results;
  }

  return {
    listSubscriptions,
    addSubscription,
    updateSubscription,
    removeSubscription,
    refreshSubscription,
    refreshAll,
    async listNodes(filters = {}) {
      const nodeData = await listNodeData();
      let nodes = nodeData.nodes;
      if (filters.subscriptionId) nodes = nodes.filter((node) => node.sourceId === filters.subscriptionId);
      if (filters.type) nodes = nodes.filter((node) => node.type === filters.type);
      if (filters.supported !== undefined) nodes = nodes.filter((node) => node.supported === Boolean(filters.supported));
      return { selectedNodeId: nodeData.selectedNodeId, nodes };
    },
    async getNode(id) {
      const nodeData = await listNodeData();
      return nodeData.nodes.find((node) => node.id === id) || null;
    },
    async selectNode(id) {
      const nodeData = await listNodeData();
      if (id && !nodeData.nodes.some((node) => node.id === id)) throw new Error('节点不存在');
      nodeData.selectedNodeId = id || null;
      await saveNodeData(nodeData);
      return nodeData.selectedNodeId;
    }
  };
}

module.exports = { createSubscriptionService, maskUrl };

const crypto = require('node:crypto');
const yaml = require('js-yaml');

const SUPPORTED_TYPES = new Set(['ss', 'vmess', 'vless', 'trojan', 'socks5', 'http', 'hysteria2']);
const TYPE_ALIASES = { shadowsocks: 'ss', socks: 'socks5' };
const SING_BOX_SKIP = new Set(['direct', 'block', 'dns', 'selector', 'urltest', 'shadow-tls']);

function stableNodeId(sourceId, raw) {
  const key = [sourceId, raw.type, raw.server, raw.port, raw.name].map(String).join('|');
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}

function normalizeNode(raw, sourceId) {
  const type = String(raw.type || '').trim().toLowerCase();
  const server = String(raw.server || '').trim();
  const port = Number(raw.port);
  const name = String(raw.name || '').trim() || `${type}-${server}:${port}`;
  const supported = SUPPORTED_TYPES.has(type) && Boolean(server) && Number.isInteger(port) && port > 0 && port <= 65535;
  return {
    id: stableNodeId(sourceId, { type, server, port, name }),
    name,
    type,
    server,
    port,
    sourceId,
    supported,
    error: supported ? null : '不支持的协议或缺少 server/port',
    raw
  };
}

function decodeBase64(text) {
  const stripped = text.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(stripped)) return null;
  try {
    const decoded = Buffer.from(stripped, 'base64').toString('utf8');
    return decoded.includes('\0') ? null : decoded;
  } catch {
    return null;
  }
}

function toClashLike(raw) {
  const type = String(raw.type || '').toLowerCase();
  return {
    ...raw,
    name: raw.tag || raw.name,
    type: TYPE_ALIASES[type] || type,
    server: raw.server,
    port: raw.server_port
  };
}

function parseText(text) {
  const candidates = [];
  const trimmed = text.trim();
  if (!trimmed) throw new Error('订阅内容为空');
  candidates.push(trimmed);
  const decoded = decodeBase64(trimmed);
  if (decoded) candidates.push(decoded);

  for (const candidate of candidates) {
    let doc = null;
    if (candidate.startsWith('{') || candidate.startsWith('[')) {
      try { doc = JSON.parse(candidate); } catch { doc = null; }
    }
    if (doc === null) {
      try { doc = yaml.load(candidate); } catch { doc = null; }
    }
    if (!doc) continue;
    if (Array.isArray(doc)) return { kind: 'list', list: doc };
    if (Array.isArray(doc.proxies)) return { kind: 'clash', list: doc.proxies };
    if (Array.isArray(doc.outbounds)) return { kind: 'singbox', list: doc.outbounds };
  }
  throw new Error('无法解析订阅内容，未找到 proxies 或 outbounds 节点列表');
}

function parseSubscription(text, sourceId) {
  const { kind, list } = parseText(text);
  const rawList = kind === 'singbox'
    ? list.filter((raw) => raw && raw.server && !SING_BOX_SKIP.has(String(raw.type || '').toLowerCase())).map(toClashLike)
    : list;
  const seen = new Set();
  const nodes = [];
  for (const raw of rawList) {
    if (!raw || typeof raw !== 'object') continue;
    const node = normalizeNode(raw, sourceId);
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    nodes.push(node);
  }
  return nodes;
}

module.exports = { parseSubscription, normalizeNode, stableNodeId, SUPPORTED_TYPES };

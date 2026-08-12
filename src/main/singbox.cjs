const fs = require('node:fs/promises');

const DEFAULT_LISTEN = '127.0.0.1';
const DEFAULT_PORT = 12080;

function value(raw, ...keys) {
  return keys.map((key) => raw[key]).find((item) => item !== undefined && item !== null && item !== '');
}

function tlsConfig(raw) {
  if (raw.tls && typeof raw.tls === 'object') return raw.tls;
  if (!raw.tls) return undefined;
  return {
    enabled: true,
    server_name: value(raw, 'sni', 'servername'),
    insecure: Boolean(raw['skip-cert-verify'])
  };
}

function transportConfig(raw) {
  const network = String(raw.network || '').toLowerCase();
  if (network === 'ws') {
    const options = raw['ws-opts'] || {};
    return { type: 'ws', path: options.path || raw.path || '/', headers: options.headers };
  }
  if (network === 'grpc') {
    const options = raw['grpc-opts'] || {};
    return { type: 'grpc', service_name: options['grpc-service-name'] || options.service_name || raw['grpc-service-name'] };
  }
  return undefined;
}

function buildOutbound(node, tag = 'selected-node') {
  const raw = node.raw || {};
  const base = { tag, server: node.server, server_port: node.port };
  switch (node.type) {
    case 'ss': return { type: 'shadowsocks', ...base, method: value(raw, 'cipher', 'method'), password: raw.password };
    case 'vmess': return { type: 'vmess', ...base, uuid: raw.uuid, security: value(raw, 'cipher', 'security') || 'auto', alter_id: Number(raw.alterId ?? raw.alter_id ?? 0), tls: tlsConfig(raw), transport: transportConfig(raw) };
    case 'vless': return { type: 'vless', ...base, uuid: raw.uuid, flow: raw.flow, tls: tlsConfig(raw), transport: transportConfig(raw) };
    case 'trojan': return { type: 'trojan', ...base, password: raw.password, tls: tlsConfig(raw), transport: transportConfig(raw) };
    case 'socks5': return { type: 'socks', ...base, username: raw.username, password: raw.password };
    case 'http': return { type: 'http', ...base, username: raw.username, password: raw.password };
    case 'hysteria2': return { type: 'hysteria2', ...base, password: raw.password, up_mbps: raw.up || raw.up_mbps, down_mbps: raw.down || raw.down_mbps, obfs: raw.obfs ? { type: raw.obfs, password: raw['obfs-password'] || raw.obfs_password } : undefined, tls: tlsConfig(raw) };
    default: throw new Error(`不支持的节点协议：${node.type}`);
  }
}

function removeUndefined(value) {
  if (Array.isArray(value)) return value.map(removeUndefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, removeUndefined(item)]));
}

async function buildConfig(input, templatePath, { listen = DEFAULT_LISTEN, port = DEFAULT_PORT, mode = 'mixed' } = {}) {
  const template = JSON.parse(await fs.readFile(templatePath, 'utf8'));
  const nodes = Array.isArray(input) ? input : [{ ...input, proxyPort: port }];
  const inbounds = nodes.map((node, index) => ({
    type: mode,
    tag: nodes.length === 1 ? `${mode}-in` : `${mode}-in-${index + 1}`,
    listen: node.listen || listen,
    listen_port: node.proxyPort || port
  }));
  const outbounds = nodes.map((node, index) => buildOutbound(node, `selected-node-${index + 1}`));
  return removeUndefined({
    ...template,
    inbounds,
    outbounds: [...outbounds, { type: 'direct', tag: 'direct' }],
    route: {
      ...(template.route || {}),
      rules: [
        { action: 'sniff' },
        ...nodes.map((node, index) => ({
          inbound: inbounds[index].tag,
          action: 'route',
          outbound: outbounds[index].tag
        }))
      ],
      final: 'direct'
    }
  });
}

module.exports = { DEFAULT_LISTEN, DEFAULT_PORT, buildConfig, buildOutbound };

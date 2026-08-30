const fs = require('node:fs/promises');

const DEFAULT_LISTEN = '::';
const DEFAULT_PORT = 12080;
const UTLS_FINGERPRINTS = new Set(['chrome', 'firefox', 'edge', 'safari', '360', 'qq', 'ios', 'android', 'randomized']);

function value(raw, ...keys) {
  return keys.map((key) => raw[key]).find((item) => item !== undefined && item !== null && item !== '');
}

function tlsConfig(raw, fallbackServer, serverNameKeys = ['servername', 'sni']) {
  if (raw.tls === false) return undefined;
  if (!raw.tls && !raw.sni && !raw.servername && !raw['skip-cert-verify']) return undefined;
  const tls = raw.tls && typeof raw.tls === 'object' ? { ...raw.tls } : {
    enabled: true,
    server_name: value(raw, ...serverNameKeys) || fallbackServer,
    insecure: Boolean(raw['skip-cert-verify'])
  };
  if (tls.server_name === undefined) tls.server_name = value(raw, ...serverNameKeys) || fallbackServer;
  const alpn = value(raw, 'alpn');
  if (alpn !== undefined && tls.alpn === undefined) {
    tls.alpn = Array.isArray(alpn) ? alpn : String(alpn).split(',').map((item) => item.trim()).filter(Boolean);
  }
  const fingerprint = String(value(raw, 'client-fingerprint', 'fingerprint') || '').toLowerCase();
  if (UTLS_FINGERPRINTS.has(fingerprint) && !tls.utls) tls.utls = { enabled: true, fingerprint };
  const reality = raw['reality-opts'] || raw.reality_opts || raw.reality;
  const publicKey = reality && value(reality, 'public-key', 'public_key');
  if (publicKey && !tls.reality) {
    tls.reality = { enabled: true, public_key: publicKey, short_id: value(reality, 'short-id', 'short_id') || '' };
  }
  return tls;
}

function hysteria2DomainResolver(raw) {
  if (raw.domain_resolver !== undefined) return raw.domain_resolver;
  return {
    server: value(raw, 'domain-resolver', 'domain_resolver_server') || 'cloudflare',
    strategy: value(raw, 'domain-resolver-strategy', 'domain_resolver_strategy', 'ip-version') || 'ipv4_only'
  };
}

function hysteria2TlsConfig(raw, fallbackServer) {
  const tls = tlsConfig(raw, fallbackServer, ['sni', 'servername']);
  if (!tls) return { enabled: true, server_name: fallbackServer, insecure: Boolean(raw['skip-cert-verify']), alpn: ['h3'] };
  if (tls.alpn === undefined) tls.alpn = ['h3'];
  return tls;
}

function transportConfig(raw, fallbackServer) {
  const network = String(raw.network || '').toLowerCase();
  if (network === 'ws') {
    const options = raw['ws-opts'] || {};
    const headers = { ...(options.headers || {}) };
    if (!headers.Host) headers.Host = raw['ws-host'] || raw.Host || raw.servername || raw.sni || fallbackServer;
    return { type: 'ws', path: options.path || raw.path || '/', headers };
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
    case 'vmess': return { type: 'vmess', ...base, uuid: raw.uuid, security: value(raw, 'cipher', 'security') || 'auto', alter_id: Number(raw.alterId ?? raw.alter_id ?? 0), tls: tlsConfig(raw, node.server), transport: transportConfig(raw, node.server) };
    case 'vless': return { type: 'vless', ...base, uuid: raw.uuid, flow: raw.flow, tls: tlsConfig(raw, node.server), transport: transportConfig(raw, node.server) };
    case 'trojan': return { type: 'trojan', ...base, password: raw.password, tls: tlsConfig(raw, node.server), transport: transportConfig(raw, node.server) };
    case 'socks5': return { type: 'socks', ...base, username: raw.username, password: raw.password };
    case 'http': return { type: 'http', ...base, username: raw.username, password: raw.password };
    case 'hysteria2': {
      const ports = value(raw, 'server_ports', 'ports');
      const serverPorts = ports === undefined ? undefined : Array.isArray(ports) ? ports : [String(ports).replace(/-/g, ':')];
      return { type: 'hysteria2', ...base, server_ports: serverPorts, domain_resolver: hysteria2DomainResolver(raw), password: raw.password, up_mbps: raw.up || raw.up_mbps, down_mbps: raw.down || raw.down_mbps, obfs: raw.obfs ? { type: raw.obfs, password: raw['obfs-password'] || raw.obfs_password } : undefined, tls: hysteria2TlsConfig(raw, node.server) };
    }
    default: throw new Error(`\u4e0d\u652f\u6301\u7684\u8282\u70b9\u534f\u8bae\uff1a${node.type}`);
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
      default_domain_resolver: template.route?.default_domain_resolver || 'cloudflare',
      rules: [
        { protocol: 'dns', action: 'hijack-dns' },
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

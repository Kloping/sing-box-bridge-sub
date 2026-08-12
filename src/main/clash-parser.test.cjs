const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSubscription, normalizeNode } = require('./clash-parser.cjs');

const YAML = `proxies:
  - name: SG-1
    type: ss
    server: sg1.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
  - name: JP-2
    type: vmess
    server: jp2.example.com
    port: 8443
    uuid: 00000000-0000-0000-0000-000000000000
    alterId: 0
  - name: Bad
    type: wireguard
    server: bad.example.com
    port: 443
  - name: NoServer
    type: trojan
    port: 443
  - name: SG-1
    type: ss
    server: sg1.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;

test('parses yaml, keeps unsupported, dedupes identical nodes', () => {
  const nodes = parseSubscription(YAML, 'sub-1');
  assert.equal(nodes.length, 4);
  const ss = nodes.find((n) => n.name === 'SG-1');
  assert.equal(ss.supported, true);
  assert.equal(ss.server, 'sg1.example.com');
  assert.equal(ss.sourceId, 'sub-1');
  assert.equal(nodes.find((n) => n.name === 'Bad').supported, false);
  assert.equal(nodes.find((n) => n.name === 'NoServer').supported, false);
});

test('parses json proxies', () => {
  const body = JSON.stringify({ proxies: [{ name: 'US', type: 'socks5', server: 'us.example.com', port: 1080 }] });
  const nodes = parseSubscription(body, 'sub-2');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].type, 'socks5');
});

test('parses base64-encoded yaml', () => {
  const body = Buffer.from(YAML, 'utf8').toString('base64');
  const nodes = parseSubscription(body, 'sub-3');
  assert.equal(nodes.length, 4);
});

test('node id is stable for same source and distinct across sources', () => {
  const body = JSON.stringify({ proxies: [{ name: 'A', type: 'ss', server: 'a.com', port: 443, cipher: 'aes-128-gcm', password: 'x' }] });
  const [node1] = parseSubscription(body, 'sub-x');
  const [node2] = parseSubscription(body, 'sub-x');
  const [node3] = parseSubscription(body, 'sub-y');
  assert.equal(node1.id, node2.id);
  assert.notEqual(node1.id, node3.id);
});


test('parses sing-box outbounds (vless reality + hysteria2), skips direct', () => {
  const body = JSON.stringify({
    outbounds: [
      {
        type: 'vless',
        tag: '台湾高速01|BGP|流媒体',
        server: 'aws-link28.liangxin1.xyz',
        server_port: 443,
        uuid: 'e72d4049-f74d-4bc3-bee9-014878ec00d4',
        flow: 'xtls-rprx-vision',
        tls: { enabled: true, server_name: 'download-porter.hoyoverse.com' }
      },
      {
        type: 'hysteria2',
        tag: '香港专线01|BGP|流媒体',
        server: 'aws-linkhy1.liangxin1.xyz',
        server_port: 60000,
        password: 'e72d4049-f74d-4bc3-bee9-014878ec00d4',
        server_ports: ['60000:65530']
      },
      { type: 'direct', tag: 'direct' },
      { type: 'block', tag: 'block' }
    ]
  });
  const nodes = parseSubscription(body, 'sub-sb');
  assert.equal(nodes.length, 2);
  const vless = nodes.find((n) => n.name === '台湾高速01|BGP|流媒体');
  assert.equal(vless.type, 'vless');
  assert.equal(vless.port, 443);
  assert.equal(vless.supported, true);
  assert.equal(vless.raw.server, 'aws-link28.liangxin1.xyz');
  const hy2 = nodes.find((n) => n.type === 'hysteria2');
  assert.equal(hy2.supported, true);
  assert.equal(hy2.port, 60000);
});

test('maps sing-box type aliases shadowsocks/socks', () => {
  const body = JSON.stringify({ outbounds: [
    { type: 'shadowsocks', tag: 'SS', server: 'a.com', server_port: 8388 },
    { type: 'socks', tag: 'S5', server: 'b.com', server_port: 1080 }
  ] });
  const nodes = parseSubscription(body, 'sub-alias');
  assert.equal(nodes.find((n) => n.name === 'SS').type, 'ss');
  assert.equal(nodes.find((n) => n.name === 'S5').type, 'socks5');
  assert.ok(nodes.every((n) => n.supported));
});
test('rejects non-proxy content', () => {
  assert.throws(() => parseSubscription('hello world', 'sub-4'), /无法解析订阅内容/);
});

test('normalizeNode marks missing port as unsupported', () => {
  const node = normalizeNode({ name: 'X', type: 'trojan', server: 'x.com' }, 'sub-5');
  assert.equal(node.supported, false);
  assert.ok(node.id);
});

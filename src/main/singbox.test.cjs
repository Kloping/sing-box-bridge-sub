const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildConfig, DEFAULT_LISTEN } = require('./singbox.cjs');

test('builds a mixed unauthenticated local proxy from the default template', async () => {
  const nodes = [
    { id: 'node-1', type: 'ss', server: 'example.com', port: 443, proxyPort: 12080, raw: { cipher: 'chacha20-ietf-poly1305', password: 'secret' } },
    { id: 'node-2', type: 'ss', server: 'example.org', port: 443, proxyPort: 2081, raw: { cipher: 'aes-128-gcm', password: 'secret-2' } }
  ];
  const config = await buildConfig(nodes, path.join(__dirname, '..', 'test', 'config.json'));
  assert.deepEqual(config.inbounds, [
    { type: 'mixed', tag: 'mixed-in-1', listen: DEFAULT_LISTEN, listen_port: 12080 },
    { type: 'mixed', tag: 'mixed-in-2', listen: DEFAULT_LISTEN, listen_port: 2081 }
  ]);
  assert.equal(config.outbounds[0].type, 'shadowsocks');
  assert.equal(config.outbounds[0].password, 'secret');
  assert.equal(config.outbounds[1].server, 'example.org');
  assert.deepEqual(config.dns, {
    servers: [
      { type: 'local', tag: 'local' },
      { type: 'udp', tag: 'cloudflare', server: '1.1.1.1', server_port: 53 }
    ]
  });
  assert.deepEqual(config.route.rules[0], { protocol: 'dns', action: 'hijack-dns' });
  assert.deepEqual(config.route.rules.slice(2), [
    { inbound: 'mixed-in-1', action: 'route', outbound: 'selected-node-1' },
    { inbound: 'mixed-in-2', action: 'route', outbound: 'selected-node-2' }
  ]);
  assert.equal(config.route.default_domain_resolver, 'cloudflare');
  assert.equal(config.route.final, 'direct');
});

test('builds hysteria2 TLS from Clash fields and preserves server ports', async () => {
  const config = await buildConfig({
    type: 'hysteria2',
    server: 'aws-linkhy1.liangxin1.xyz',
    port: 60000,
    raw: {
      password: 'secret',
      sni: 'iosapps.itunes.apple.com',
      'skip-cert-verify': true,
      'client-fingerprint': 'dd9dd03d942400ad4c1400879bda98f4fa097183aa9a91a1423cdd42a3e183d7',
      alpn: ['h3'],
      server_ports: ['60000:65530']
    }
  }, path.join(__dirname, '..', 'test', 'config.json'));
  assert.deepEqual(config.outbounds[0], {
    type: 'hysteria2',
    tag: 'selected-node-1',
    server: 'aws-linkhy1.liangxin1.xyz',
    server_port: 60000,
    server_ports: ['60000:65530'],
    domain_resolver: { server: 'cloudflare', strategy: 'ipv4_only' },
    password: 'secret',
    tls: { enabled: true, server_name: 'iosapps.itunes.apple.com', insecure: true, alpn: ['h3'] }
  });
});

test('preserves sing-box hysteria2 domain resolver and TLS ALPN', async () => {
  const config = await buildConfig({
    type: 'hysteria2',
    server: 'lxyus2.777078.xyz',
    port: 443,
    raw: {
      password: 'secret',
      domain_resolver: { server: 'custom-dns', strategy: 'prefer_ipv6' },
      tls: { enabled: true, server_name: 'iosapps.itunes.apple.com', insecure: true, alpn: ['h3'] }
    }
  }, path.join(__dirname, '..', 'test', 'config.json'));
  assert.deepEqual(config.outbounds[0].domain_resolver, { server: 'custom-dns', strategy: 'prefer_ipv6' });
  assert.deepEqual(config.outbounds[0].tls.alpn, ['h3']);
});

test('uses h3 by default for hysteria2 when the subscription omits ALPN', async () => {
  const config = await buildConfig({
    type: 'hysteria2', server: 'lxyus2.777078.xyz', port: 443,
    raw: { password: 'secret', sni: 'iosapps.itunes.apple.com', 'skip-cert-verify': true }
  }, path.join(__dirname, '..', 'test', 'config.json'));
  assert.deepEqual(config.outbounds[0].tls.alpn, ['h3']);
});

test('maps Clash VLESS uTLS fingerprint and WebSocket options', async () => {
  const config = await buildConfig({
    type: 'vless',
    server: 'cfyes.7770006.xyz',
    port: 443,
    raw: {
      uuid: 'e72d4049-f74d-4bc3-bee9-014878ec00d4',
      tls: true,
      'skip-cert-verify': false,
      'client-fingerprint': 'safari',
      servername: 'jp1-lx.7770006.xyz',
      network: 'ws',
      'ws-opts': { path: '/liangxin/data/jp', headers: { Host: 'jp1-lx.7770006.xyz' } }
    }
  }, path.join(__dirname, '..', 'test', 'config.json'));
  const outbound = config.outbounds[0];
  assert.deepEqual(outbound.tls, {
    enabled: true,
    server_name: 'jp1-lx.7770006.xyz',
    insecure: false,
    utls: { enabled: true, fingerprint: 'safari' }
  });
  assert.deepEqual(outbound.transport, {
    type: 'ws',
    path: '/liangxin/data/jp',
    headers: { Host: 'jp1-lx.7770006.xyz' }
  });
});

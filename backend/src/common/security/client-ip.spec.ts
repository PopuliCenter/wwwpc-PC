import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { clientIp, resolveTrustProxyHops } from './client-ip';

describe('resolveTrustProxyHops', () => {
  it('defaults to 1 (never trust the whole XFF chain) when unset/invalid', () => {
    expect(resolveTrustProxyHops(undefined)).toBe(1);
    expect(resolveTrustProxyHops('')).toBe(1);
    expect(resolveTrustProxyHops('true')).toBe(1);
    expect(resolveTrustProxyHops('-3')).toBe(1);
  });

  it('accepts explicit hop counts and caps absurd values', () => {
    expect(resolveTrustProxyHops('0')).toBe(0);
    expect(resolveTrustProxyHops('2')).toBe(2);
    expect(resolveTrustProxyHops(' 3 ')).toBe(3);
    expect(resolveTrustProxyHops('99')).toBe(5);
  });
});

describe('clientIp', () => {
  it('uses req.ip and strips the IPv4-mapped prefix', () => {
    expect(clientIp({ ip: '::ffff:203.0.113.7' })).toBe('203.0.113.7');
    expect(clientIp({ ip: '2001:db8::1' })).toBe('2001:db8::1');
  });

  it('ignores X-Forwarded-For headers entirely', () => {
    expect(clientIp({ ip: '10.0.0.5', headers: { 'x-forwarded-for': '8.8.8.8, 1.1.1.1' } })).toBe(
      '10.0.0.5',
    );
  });

  it('falls back to the socket address, then the given fallback', () => {
    expect(clientIp({ socket: { remoteAddress: '10.0.0.9' } })).toBe('10.0.0.9');
    expect(clientIp({}, '0.0.0.0')).toBe('0.0.0.0');
    expect(clientIp(undefined)).toBe('unknown');
  });
});

/**
 * Rantai produksi disimulasikan dengan Express asli: socket = nginx survei_frontend,
 * XFF = "<palsu dari klien>, <klien versi Cloudflare>, <klien versi real_ip edge>, <IP edge>".
 */
describe('trust proxy + clientIp against a forged X-Forwarded-For', () => {
  async function ipSeen(hops: number, xff: string): Promise<string> {
    const app = express();
    app.set('trust proxy', hops);
    app.get('/', (req, res) => res.send(clientIp(req)));
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/`, { headers: { 'X-Forwarded-For': xff } });
      return await res.text();
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }

  const chain = '8.8.8.8, 198.51.100.20, 198.51.100.20, 172.23.0.3';

  it('hops=1 (default) yields the edge container, never the forged left-most value', async () => {
    expect(await ipSeen(1, chain)).toBe('172.23.0.3');
  });

  it('hops=2 (edge with real_ip) yields the real client', async () => {
    expect(await ipSeen(2, chain)).toBe('198.51.100.20');
  });

  it('a client-forged XFF never wins with hops=2 when it hits the origin directly', async () => {
    // Langsung ke origin (melewati Cloudflare): edge tidak memakai real_ip untuk
    // IP non-Cloudflare, jadi entri yang ditambahkan edge = IP penyerang asli.
    expect(await ipSeen(2, '8.8.8.8, 203.0.113.66, 172.23.0.3')).toBe('203.0.113.66');
  });
});

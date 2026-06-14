import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { IakFulfillmentProvider } from './iak.provider';
import { IAK_DEFAULT_PRODUCT_CODES } from './iak-products';

function makeConfig(values: Record<string, string>): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

const md5 = (s: string) => createHash('md5').update(s).digest('hex');

describe('IakFulfillmentProvider', () => {
  describe('detectOperator', () => {
    it('mendeteksi operator dari prefix (format 08, 62, 8)', () => {
      expect(IakFulfillmentProvider.detectOperator('081212121212')).toBe('telkomsel');
      expect(IakFulfillmentProvider.detectOperator('6281712345678')).toBe('xl');
      expect(IakFulfillmentProvider.detectOperator('895712345678')).toBe('tri');
      expect(IakFulfillmentProvider.detectOperator('0856123456')).toBe('indosat');
      expect(IakFulfillmentProvider.detectOperator('0888123456')).toBe('smartfren');
    });

    it('mengembalikan null utk prefix tak dikenal', () => {
      expect(IakFulfillmentProvider.detectOperator('0701234567')).toBeNull();
      expect(IakFulfillmentProvider.detectOperator('')).toBeNull();
    });
  });

  describe('parseCallback', () => {
    const provider = new IakFulfillmentProvider(
      makeConfig({ IAK_USERNAME: 'u', IAK_API_KEY: 'k' }),
    );

    const payload = (status: string, refId = '123456', extra: Record<string, unknown> = {}) => ({
      data: {
        ref_id: refId,
        status,
        sign: md5(`uk${refId}`),
        tr_id: '999',
        sn: 'SN-1',
        message: 'OK',
        ...extra,
      },
    });

    it('memetakan status 1 → completed dgn sn & trx', () => {
      const res = provider.parseCallback(payload('1'));
      expect(res?.refId).toBe('123456');
      expect(res?.outcome.status).toBe('completed');
      expect((res?.outcome as any).sn).toBe('SN-1');
      expect((res?.outcome as any).providerTrxId).toBe('999');
    });

    it('memetakan status 2 → failed', () => {
      const res = provider.parseCallback(payload('2'));
      expect(res?.outcome.status).toBe('failed');
    });

    it('memetakan status 0 → pending', () => {
      const res = provider.parseCallback(payload('0'));
      expect(res?.outcome.status).toBe('pending');
    });

    it('rc=00 → completed walau status 0', () => {
      const res = provider.parseCallback(payload('0', '123456', { rc: '00' }));
      expect(res?.outcome.status).toBe('completed');
    });

    it('rc gagal (mis. 17 saldo kurang) → failed walau status 0', () => {
      const res = provider.parseCallback(payload('0', '123456', { rc: '17' }));
      expect(res?.outcome.status).toBe('failed');
    });

    it('rc=39 (proses) → pending', () => {
      const res = provider.parseCallback(payload('0', '123456', { rc: '39' }));
      expect(res?.outcome.status).toBe('pending');
    });

    it('menolak callback dgn signature salah', () => {
      const bad = payload('1');
      bad.data.sign = 'deadbeef';
      expect(provider.parseCallback(bad)).toBeNull();
    });

    it('mengembalikan null bila ref_id tidak ada', () => {
      expect(provider.parseCallback({ data: { status: '1' } })).toBeNull();
    });
  });

  describe('default product codes (pulsa)', () => {
    it('punya 30 entri (6 operator × 5 nominal)', () => {
      expect(Object.keys(IAK_DEFAULT_PRODUCT_CODES)).toHaveLength(30);
    });

    it('operator dari nomor HP cocok dgn kode default yg ada', () => {
      const op = IakFulfillmentProvider.detectOperator('081299998888'); // telkomsel
      expect(IAK_DEFAULT_PRODUCT_CODES[`${op}:pulsa-10000`]).toBe('htelkomsel10000');
      const op2 = IakFulfillmentProvider.detectOperator('0895111122223'); // tri
      expect(IAK_DEFAULT_PRODUCT_CODES[`${op2}:pulsa-25000`]).toBe('hthree25000');
    });
  });

  describe('parseCallback tanpa verifikasi sign', () => {
    it('menerima callback walau sign tidak cocok bila IAK_VERIFY_CALLBACK_SIGN=false', () => {
      const provider = new IakFulfillmentProvider(
        makeConfig({
          IAK_USERNAME: 'u',
          IAK_API_KEY: 'k',
          IAK_VERIFY_CALLBACK_SIGN: 'false',
        }),
      );
      const res = provider.parseCallback({
        data: { ref_id: '123', status: '1', sign: 'salah' },
      });
      expect(res?.outcome.status).toBe('completed');
    });
  });
});

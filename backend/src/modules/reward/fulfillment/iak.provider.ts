import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  FulfillmentOutcome,
  FulfillmentRequest,
  ProviderCallbackResult,
  RewardFulfillmentProvider,
} from './reward-fulfillment.types';
import { IAK_DEFAULT_PRODUCT_CODES } from './iak-products';

/**
 * Provider IAK (iak.id / Mobilepulsa) — gateway PPOB/H2H prepaid.
 *
 * Env:
 *   IAK_BASE_URL          default 'https://prepaid.iak.dev' (sandbox). Prod: 'https://prepaid.iak.id'
 *   IAK_USERNAME          username developer IAK
 *   IAK_API_KEY           API key (prepaid)
 *   IAK_TEST_PRODUCT_CODE (opsional) — paksa satu product_code utk SEMUA top-up
 *                         saat uji sandbox, tanpa perlu memetakan tiap reward.
 *   IAK_PRODUCT_MAP       (opsional) JSON map → product_code. Kunci:
 *                          - pulsa/paket_data (operator-spesifik):
 *                              "<operator>:<rewardId>"  mis. "telkomsel:pulsa-10000"
 *                            (operator: telkomsel|indosat|xl|axis|tri|smartfren)
 *                            fallback ke "<rewardId>" bila operator tak ada di map.
 *                          - voucher/e_wallet: "<rewardId>".
 *   IAK_VERIFY_CALLBACK_SIGN  default 'true' — verifikasi md5(username+api_key+ref_id).
 *
 * Tanda tangan: sign = md5(username + api_key + ref_id). ref_id = providerRefId
 * (ringkas) → idempoten & muat di batas panjang gateway.
 *
 * CATATAN status (konfirmasi ulang dgn dokumen akun Anda): konvensi prepaid IAK
 * status 0=proses, 1=sukses, 2=gagal. Kasus tak pasti → 'pending' (aman,
 * tidak memicu refund keliru — diselesaikan via callback).
 */

/** Prefix 4-digit nomor HP Indonesia → operator. */
const OPERATOR_BY_PREFIX: Record<string, string> = {};
const registerPrefixes = (operator: string, prefixes: string[]) => {
  for (const p of prefixes) OPERATOR_BY_PREFIX[p] = operator;
};
registerPrefixes('telkomsel', [
  '0811', '0812', '0813', '0821', '0822', '0823', '0851', '0852', '0853',
]);
registerPrefixes('indosat', ['0814', '0815', '0816', '0855', '0856', '0857', '0858']);
registerPrefixes('xl', ['0817', '0818', '0819', '0859', '0877', '0878']);
registerPrefixes('axis', ['0831', '0832', '0833', '0838']);
registerPrefixes('tri', ['0895', '0896', '0897', '0898', '0899']);
registerPrefixes('smartfren', [
  '0881', '0882', '0883', '0884', '0885', '0886', '0887', '0888', '0889',
]);

export class IakFulfillmentProvider implements RewardFulfillmentProvider {
  readonly name = 'iak';
  private readonly logger = new Logger('IakFulfillmentProvider');

  private readonly baseUrl: string;
  private readonly username: string;
  private readonly apiKey: string;
  private readonly testProductCode?: string;
  private readonly productMap: Record<string, string>;
  private readonly verifyCallbackSign: boolean;

  constructor(config: ConfigService) {
    // Sandbox: https://prepaid.iak.dev  |  Produksi: https://prepaid.iak.id
    this.baseUrl = (
      config.get<string>('IAK_BASE_URL') || 'https://prepaid.iak.dev'
    ).replace(/\/+$/, '');
    this.username = config.get<string>('IAK_USERNAME') || '';
    this.apiKey = config.get<string>('IAK_API_KEY') || '';
    this.testProductCode = config.get<string>('IAK_TEST_PRODUCT_CODE') || undefined;
    this.productMap = this.parseProductMap(config.get<string>('IAK_PRODUCT_MAP'));
    this.verifyCallbackSign =
      (config.get<string>('IAK_VERIFY_CALLBACK_SIGN') ?? 'true') !== 'false';
  }

  private parseProductMap(raw?: string): Record<string, string> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      this.logger.warn('IAK_PRODUCT_MAP bukan JSON valid — diabaikan.');
      return {};
    }
  }

  /** Deteksi operator dari nomor HP Indonesia (normalisasi +62/62/8 → 0). */
  static detectOperator(phone: string): string | null {
    let p = (phone || '').replace(/[^0-9]/g, '');
    if (p.startsWith('62')) p = '0' + p.slice(2);
    else if (p.startsWith('8')) p = '0' + p;
    return OPERATOR_BY_PREFIX[p.slice(0, 4)] ?? null;
  }

  private resolveProductCode(req: FulfillmentRequest): string | null {
    // Sandbox: satu kode utk semua top-up.
    if (this.testProductCode) return this.testProductCode;

    // Pulsa & paket data: operator-spesifik. Prioritas: env map → default bawaan.
    if (req.category === 'pulsa' || req.category === 'paket_data') {
      const operator = IakFulfillmentProvider.detectOperator(req.destinationNumber);
      if (operator) {
        const key = `${operator}:${req.rewardId}`;
        const keyed = this.productMap[key] ?? IAK_DEFAULT_PRODUCT_CODES[key];
        if (keyed) return keyed;
      }
    }
    // Fallback / kategori non-operator (voucher, e_wallet): hanya dari env map.
    return this.productMap[req.rewardId] ?? IAK_DEFAULT_PRODUCT_CODES[req.rewardId] ?? null;
  }

  private sign(refId: string): string {
    return createHash('md5')
      .update(`${this.username}${this.apiKey}${refId}`)
      .digest('hex');
  }

  async fulfill(req: FulfillmentRequest): Promise<FulfillmentOutcome> {
    if (!this.username || !this.apiKey) {
      this.logger.warn(
        'Kredensial IAK belum lengkap (IAK_USERNAME/IAK_API_KEY) — redemption ditahan utk proses manual.',
      );
      return { status: 'pending', message: 'Menunggu pemrosesan manual.' };
    }

    const productCode = this.resolveProductCode(req);
    if (!productCode) {
      this.logger.warn(
        `Product code IAK belum dipetakan utk reward '${req.rewardId}' (operator: ${
          IakFulfillmentProvider.detectOperator(req.destinationNumber) ?? '-'
        }) — redemption ditahan utk proses manual.`,
      );
      return { status: 'pending', message: 'Menunggu pemrosesan manual.' };
    }

    const body = {
      username: this.username,
      ref_id: req.refId,
      customer_id: req.destinationNumber,
      product_code: productCode,
      sign: this.sign(req.refId),
    };

    let json: any;
    try {
      const res = await fetch(`${this.baseUrl}/api/top-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      json = await res.json().catch(() => null);
      if (!res.ok) {
        this.logger.error(
          `IAK top-up HTTP ${res.status} utk ${req.refId}: ${JSON.stringify(json)}`,
        );
        return { status: 'pending', message: `Provider merespons HTTP ${res.status}.` };
      }
    } catch (err: any) {
      this.logger.error(`IAK top-up gagal jaringan utk ${req.refId}: ${err?.message}`);
      return { status: 'pending', message: 'Gagal menghubungi provider, akan dicoba ulang.' };
    }

    return this.mapResponse(json, req.refId);
  }

  /**
   * Petakan respons IAK (top-up/callback/check-status) → outcome.
   * status: 0=PROSES, 1=SUKSES, 2=GAGAL. rc: '00'=SUKSES, '39'=PROSES,
   * selain itu = gagal pasti (mis. 17=saldo kurang, 20=produk tak ada,
   * 102=IP belum whitelist, 204=signature salah).
   */
  private mapResponse(json: any, refId: string): FulfillmentOutcome {
    const d = json?.data ?? json ?? {};
    const status = Number(d.status);
    const rc = d.rc != null ? String(d.rc).trim() : '';
    const trxId =
      d.tr_id != null ? String(d.tr_id) : d.trx_id != null ? String(d.trx_id) : undefined;
    const sn = typeof d.sn === 'string' && d.sn.trim() ? d.sn.trim() : undefined;
    const message = typeof d.message === 'string' ? d.message : undefined;

    const isSuccess = status === 1 || rc === '00';
    // Gagal pasti bila status=2 ATAU rc bernilai selain sukses('00')/proses('39').
    const isFailed =
      status === 2 || (rc !== '' && rc !== '00' && rc !== '39');

    if (isSuccess) {
      return { status: 'completed', providerTrxId: trxId, sn, message };
    }
    if (isFailed) {
      return {
        status: 'failed',
        message: message || `Transaksi ditolak provider (IAK rc=${rc || '-'}).`,
      };
    }
    this.logger.log(
      `IAK ${refId} berstatus '${d.status ?? '?'}' (rc=${rc || '-'}) → menunggu hasil akhir.`,
    );
    return { status: 'pending', providerTrxId: trxId, message };
  }

  /**
   * Cek status transaksi (POST /api/check-status). Dipakai sbg cadangan bila
   * callback gagal/tak terkonfigurasi. sign = md5(username+api_key+ref_id).
   */
  async checkStatus(refId: string): Promise<FulfillmentOutcome> {
    if (!this.username || !this.apiKey) {
      return { status: 'pending', message: 'Kredensial IAK belum lengkap.' };
    }
    try {
      const res = await fetch(`${this.baseUrl}/api/check-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.username,
          ref_id: refId,
          sign: this.sign(refId),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) return { status: 'pending', message: `HTTP ${res.status}` };
      return this.mapResponse(json, refId);
    } catch (err: any) {
      this.logger.error(`IAK check-status gagal utk ${refId}: ${err?.message}`);
      return { status: 'pending', message: 'Gagal cek status.' };
    }
  }

  /** Parse + verifikasi payload callback IAK → hasil per-redemption. */
  parseCallback(payload: unknown): ProviderCallbackResult | null {
    const p = payload as any;
    const d = p?.data ?? p ?? {};
    const refId = d.ref_id ?? d.refId;
    if (!refId) return null;

    // Verifikasi keaslian: sign = md5(username + api_key + ref_id).
    if (this.verifyCallbackSign && this.username && this.apiKey) {
      const expected = this.sign(String(refId));
      const got = typeof d.sign === 'string' ? d.sign.toLowerCase() : '';
      if (got !== expected) {
        this.logger.warn(
          `Callback IAK ref_id=${refId} ditolak: signature tidak cocok.`,
        );
        return null;
      }
    }

    return { refId: String(refId), outcome: this.mapResponse(p, String(refId)) };
  }
}

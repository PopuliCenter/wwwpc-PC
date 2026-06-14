import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  FulfillmentOutcome,
  FulfillmentRequest,
  ProviderCallbackResult,
  RewardFulfillmentProvider,
} from './reward-fulfillment.types';

/**
 * Provider IAK (iak.id / Mobilepulsa) — gateway PPOB/H2H prepaid.
 *
 * Env:
 *   IAK_BASE_URL          default 'https://sandbox.iak.id' (sandbox). Prod: 'https://prepaid.iak.id'
 *   IAK_USERNAME          username developer IAK
 *   IAK_API_KEY           API key (prepaid)
 *   IAK_TEST_PRODUCT_CODE (opsional) — paksa satu product_code utk SEMUA top-up
 *                         saat uji sandbox, tanpa perlu memetakan tiap reward.
 *   IAK_PRODUCT_MAP       (opsional) JSON map rewardId → product_code,
 *                         mis. {"pulsa-10000":"tsel10","data-1gb":"xld1"}
 *
 * Tanda tangan top-up: sign = md5(username + api_key + ref_id).
 * ref_id yang kita kirim = redemptionId (UUID) → idempoten.
 *
 * CATATAN: pemetaan kode status di bawah mengikuti konvensi prepaid IAK
 * (status: 0=proses, 1=sukses, 2=gagal). Konfirmasi ulang dgn dokumentasi
 * akun Anda; semua kasus tak pasti diperlakukan 'pending' (aman, tidak
 * memicu refund keliru — diselesaikan via callback/cek status).
 */
export class IakFulfillmentProvider implements RewardFulfillmentProvider {
  readonly name = 'iak';
  private readonly logger = new Logger('IakFulfillmentProvider');

  private readonly baseUrl: string;
  private readonly username: string;
  private readonly apiKey: string;
  private readonly testProductCode?: string;
  private readonly productMap: Record<string, string>;

  constructor(config: ConfigService) {
    this.baseUrl = (
      config.get<string>('IAK_BASE_URL') || 'https://sandbox.iak.id'
    ).replace(/\/+$/, '');
    this.username = config.get<string>('IAK_USERNAME') || '';
    this.apiKey = config.get<string>('IAK_API_KEY') || '';
    this.testProductCode = config.get<string>('IAK_TEST_PRODUCT_CODE') || undefined;
    this.productMap = this.parseProductMap(config.get<string>('IAK_PRODUCT_MAP'));
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

  private resolveProductCode(req: FulfillmentRequest): string | null {
    return this.testProductCode || this.productMap[req.rewardId] || null;
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
        `Product code IAK belum dipetakan utk reward '${req.rewardId}' — redemption ditahan utk proses manual.`,
      );
      return { status: 'pending', message: 'Menunggu pemrosesan manual.' };
    }

    const body = {
      username: this.username,
      ref_id: req.redemptionId,
      customer_id: req.destinationNumber,
      product_code: productCode,
      sign: this.sign(req.redemptionId),
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
        // Error HTTP (mis. 4xx/5xx). Anggap pending agar tidak refund keliru;
        // diselesaikan via cek-status/callback atau intervensi admin.
        this.logger.error(
          `IAK top-up HTTP ${res.status} utk ${req.redemptionId}: ${JSON.stringify(json)}`,
        );
        return {
          status: 'pending',
          message: `Provider merespons HTTP ${res.status}.`,
        };
      }
    } catch (err: any) {
      // Kegagalan jaringan → pending (jangan refund; mungkin transaksi tetap jalan).
      this.logger.error(`IAK top-up gagal jaringan utk ${req.redemptionId}: ${err?.message}`);
      return { status: 'pending', message: 'Gagal menghubungi provider, akan dicoba ulang.' };
    }

    return this.mapResponse(json, req.redemptionId);
  }

  /** Petakan respons sinkron IAK → outcome. */
  private mapResponse(json: any, redemptionId: string): FulfillmentOutcome {
    const d = json?.data ?? json ?? {};
    const status = Number(d.status);
    const trxId = d.tr_id != null ? String(d.tr_id) : d.trx_id != null ? String(d.trx_id) : undefined;
    const sn = typeof d.sn === 'string' && d.sn.trim() ? d.sn.trim() : undefined;
    const message = typeof d.message === 'string' ? d.message : undefined;

    if (status === 1) {
      return { status: 'completed', providerTrxId: trxId, sn, message };
    }
    if (status === 2) {
      return { status: 'failed', message: message || 'Transaksi ditolak provider (IAK).' };
    }
    // status 0 (proses) atau tak dikenal → tunggu hasil akhir.
    this.logger.log(
      `IAK top-up ${redemptionId} berstatus '${d.status ?? 'unknown'}' → menunggu callback.`,
    );
    return { status: 'pending', providerTrxId: trxId, message };
  }

  /** Parse payload callback IAK → hasil per-redemption. */
  parseCallback(payload: unknown): ProviderCallbackResult | null {
    const p = payload as any;
    const d = p?.data ?? p ?? {};
    const refId = d.ref_id ?? d.refId;
    if (!refId) return null;
    return { redemptionId: String(refId), outcome: this.mapResponse(p, String(refId)) };
  }
}

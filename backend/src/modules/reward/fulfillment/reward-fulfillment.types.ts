/**
 * Abstraksi penyedia pemenuhan (fulfillment) reward.
 *
 * Titik integrasi tunggal untuk mengirim reward nyata (pulsa, paket data,
 * top-up e-wallet, voucher) lewat gateway PPOB/H2H seperti IAK (iak.id).
 * Implementasi default `manual` tidak mengirim apa pun — redemption tetap
 * berstatus PROCESSING sampai admin memprosesnya. Dipilih via env REWARD_PROVIDER.
 */

/** Token DI untuk provider fulfillment terpilih. */
export const REWARD_FULFILLMENT_PROVIDER = 'REWARD_FULFILLMENT_PROVIDER';

export interface FulfillmentRequest {
  /** ID redemption kita — dipakai sebagai ref_id (idempoten) ke provider. */
  redemptionId: string;
  /** ID item katalog (mis. 'pulsa-10000'). */
  rewardId: string;
  /** Kategori: pulsa | paket_data | voucher | e_wallet. */
  category: string;
  /** Nomor tujuan (HP / akun e-wallet). */
  destinationNumber: string;
  /** Poin yang dipotong (untuk audit). */
  pointsSpent: number;
}

export type FulfillmentOutcome =
  | {
      // Selesai sinkron (produk sandbox/instan). Reward terkirim.
      status: 'completed';
      providerTrxId?: string;
      sn?: string;
      message?: string;
    }
  | {
      // Diterima provider, hasil akhir menyusul via callback/cek-status.
      status: 'pending';
      providerTrxId?: string;
      message?: string;
    }
  | {
      // Ditolak/gagal pasti → poin WAJIB dikembalikan.
      status: 'failed';
      message: string;
    };

export interface ProviderCallbackResult {
  /** redemptionId yang kita kirim sebagai ref_id. */
  redemptionId: string;
  outcome: FulfillmentOutcome;
}

export interface RewardFulfillmentProvider {
  /** Nama provider, mis. 'manual' | 'iak'. */
  readonly name: string;

  /** Eksekusi pengiriman reward. Tidak boleh melempar untuk kegagalan bisnis —
   *  kembalikan outcome 'failed'. Boleh melempar hanya untuk error tak terduga. */
  fulfill(req: FulfillmentRequest): Promise<FulfillmentOutcome>;

  /** Parse payload callback async menjadi hasil per-redemption (jika didukung). */
  parseCallback?(payload: unknown): ProviderCallbackResult | null;
}

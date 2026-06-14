/**
 * Default pemetaan product_code IAK untuk PULSA.
 * Sumber: pricelist IAK 14-06-2026 (hanya produk berstatus Active).
 * Kunci: "<operator>:<rewardId>" — operator dideteksi dari prefix nomor HP.
 *
 * Bisa di-override/diperluas via env IAK_PRODUCT_MAP (env menang).
 *
 * PULSA: kunci "<operator>:<rewardId>" (operator dari prefix HP), pola
 * h<operator><nominal> (XL = xld<nominal>).
 * E-WALLET: kunci "<rewardId>" karena dompet sudah eksplisit di katalog
 * (ewallet-<dompet>-<nominal>).
 * Paket data & voucher belum dipetakan (SKU sangat spesifik) → bila ada item-nya
 * akan jatuh ke manual (PROCESSING → finalisasi admin).
 */
export const IAK_DEFAULT_PRODUCT_CODES: Record<string, string> = {
  // Telkomsel
  'telkomsel:pulsa-5000': 'htelkomsel5000',
  'telkomsel:pulsa-10000': 'htelkomsel10000',
  'telkomsel:pulsa-25000': 'htelkomsel25000',
  'telkomsel:pulsa-50000': 'htelkomsel50000',
  'telkomsel:pulsa-100000': 'htelkomsel100000',
  // Indosat
  'indosat:pulsa-5000': 'hindosat5000',
  'indosat:pulsa-10000': 'hindosat10000',
  'indosat:pulsa-25000': 'hindosat25000',
  'indosat:pulsa-50000': 'hindosat50000',
  'indosat:pulsa-100000': 'hindosat100000',
  // XL (prefix kode 'xld')
  'xl:pulsa-5000': 'xld5000',
  'xl:pulsa-10000': 'xld10000',
  'xl:pulsa-25000': 'xld25000',
  'xl:pulsa-50000': 'xld50000',
  'xl:pulsa-100000': 'xld100000',
  // AXIS
  'axis:pulsa-5000': 'haxis5000',
  'axis:pulsa-10000': 'haxis10000',
  'axis:pulsa-25000': 'haxis25000',
  'axis:pulsa-50000': 'haxis50000',
  'axis:pulsa-100000': 'haxis100000',
  // Tri (Three)
  'tri:pulsa-5000': 'hthree5000',
  'tri:pulsa-10000': 'hthree10000',
  'tri:pulsa-25000': 'hthree25000',
  'tri:pulsa-50000': 'hthree50000',
  'tri:pulsa-100000': 'hthree100000',
  // Smartfren
  'smartfren:pulsa-5000': 'hsmart5000',
  'smartfren:pulsa-10000': 'hsmart10000',
  'smartfren:pulsa-25000': 'hsmart25000',
  'smartfren:pulsa-50000': 'hsmart50000',
  'smartfren:pulsa-100000': 'hsmart100000',

  // ── E-Wallet (kunci = rewardId; dompet eksplisit di katalog) ──────────────
  // DANA
  'ewallet-dana-10000': 'dana10',
  'ewallet-dana-25000': 'dana25',
  'ewallet-dana-50000': 'dana50',
  'ewallet-dana-100000': 'dana100',
  // OVO
  'ewallet-ovo-10000': 'ovo10',
  'ewallet-ovo-25000': 'ovo25',
  'ewallet-ovo-50000': 'ovo50',
  'ewallet-ovo-100000': 'ovo100',
  // ShopeePay
  'ewallet-shopeepay-10000': 'shopeepay10',
  'ewallet-shopeepay-25000': 'shopeepay25',
  'ewallet-shopeepay-50000': 'shopeepay50',
  'ewallet-shopeepay-100000': 'shopeepay100',
  // GoPay (kode IAK berawalan 'go')
  'ewallet-gopay-10000': 'go10',
  'ewallet-gopay-25000': 'go25',
  'ewallet-gopay-50000': 'go50',
  'ewallet-gopay-100000': 'go100',
  // LinkAja
  'ewallet-linkaja-10000': 'linkaja10',
  'ewallet-linkaja-25000': 'linkaja25',
  'ewallet-linkaja-50000': 'linkaja50',
  'ewallet-linkaja-100000': 'linkaja100',
};

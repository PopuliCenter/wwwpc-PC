/**
 * Default pemetaan product_code IAK untuk PULSA.
 * Sumber: pricelist IAK 14-06-2026 (hanya produk berstatus Active).
 * Kunci: "<operator>:<rewardId>" — operator dideteksi dari prefix nomor HP.
 *
 * Bisa di-override/diperluas via env IAK_PRODUCT_MAP (env menang).
 *
 * Hanya PULSA yang dipetakan otomatis karena pola kodenya deterministik
 * (h<operator><nominal>, kecuali XL = xld<nominal>). Paket data, e-wallet
 * (Etoll), dan voucher memakai SKU spesifik per produk → dibiarkan manual
 * (redemption → PROCESSING → finalisasi admin) sampai katalog reward dirinci.
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
};

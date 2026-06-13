#!/usr/bin/env bash
# =============================================================================
# apply.sh — pulihkan + pasang routing survei.risetcenter.com (Opsi B)
# =============================================================================
# Jalankan di VPS. Memberi efek LANGSUNG (live) tanpa menunggu redeploy:
#   1) pastikan network "web" ada
#   2) sambungkan nginx app lama ke "web" (agar bisa menjangkau survei_frontend)
#   3) tulis server block survei ke FILE HOST yang di-mount nginx + reload
#
# CATATAN PENTING (dipelajari 2026-06-14):
#   - Conf survei di-bind-mount PER-FILE ke container, jadi `docker cp` GAGAL
#     dengan "device or resource busy". Solusinya: tulis ke file host sumber
#     mount (${OLD_APP_DIR}/survei.risetcenter.com.conf). `cp` mempertahankan
#     inode → nginx di container langsung melihat isi baru. Ini SEKALIGUS
#     membuat perubahan PERSISTEN (file ada di folder app lama yang di-mount).
#   - Block survei WAJIB punya `listen 80;` — Cloudflare zona risetcenter.com
#     memakai SSL mode **Flexible** (Cloudflare → origin via HTTP :80, bukan
#     443). Tanpa :80, request survei jatuh ke catch-all app lama → app lama.
#   - Menambah listener baru (mis. `listen 80`) kadang tidak langsung terikat
#     lewat `nginx -s reload`; bila verifikasi :80 masih app lama, restart
#     container nginx (AMAN: `docker restart` mempertahankan attach network web).
#
# Variabel yang bisa di-override:
#   NGINX_CONTAINER  nama container nginx app lama (default: survey-populicenter-nginx-1)
#   OLD_APP_DIR      folder app lama (default: /var/www/survey-populicenter)
# =============================================================================
set -euo pipefail

NGINX_CONTAINER="${NGINX_CONTAINER:-survey-populicenter-nginx-1}"
OLD_APP_DIR="${OLD_APP_DIR:-/var/www/survey-populicenter}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF="${SCRIPT_DIR}/survei.risetcenter.com.conf"
DEST_HOST="${OLD_APP_DIR}/survei.risetcenter.com.conf"
DEST_IN_CONTAINER="/etc/nginx/conf.d/survei.risetcenter.com.conf"

echo "▶ Container nginx app lama : ${NGINX_CONTAINER}"
echo "▶ Sumber server block      : ${CONF}"
echo "▶ Target host (persisten)  : ${DEST_HOST}"

# 1) Pastikan network "web" ada
if ! docker network inspect web >/dev/null 2>&1; then
  echo "▶ Membuat network 'web'..."
  docker network create web
fi

# 2) Sambungkan nginx app lama ke "web" (idempoten)
if docker network inspect web --format '{{range .Containers}}{{.Name}} {{end}}' | grep -qw "${NGINX_CONTAINER}"; then
  echo "✓ ${NGINX_CONTAINER} sudah tergabung ke 'web'"
else
  echo "▶ Menyambungkan ${NGINX_CONTAINER} ke 'web'..."
  docker network connect web "${NGINX_CONTAINER}"
fi

# 3) Tulis server block ke file host yang di-mount nginx (cp = pertahankan inode)
echo "▶ Menulis server block ke ${DEST_HOST}..."
mkdir -p "${OLD_APP_DIR}"
cp -f "${CONF}" "${DEST_HOST}"

# Deteksi apakah file sudah benar-benar ter-mount ke container
MOUNTED="$(docker inspect "${NGINX_CONTAINER}" \
  --format '{{range .Mounts}}{{println .Destination}}{{end}}' 2>/dev/null \
  | grep -Fx "${DEST_IN_CONTAINER}" || true)"

if [ -z "${MOUNTED}" ]; then
  echo "⚠ ${DEST_IN_CONTAINER} belum di-mount dari host."
  echo "  Memasang via docker cp (SEMENTARA — hilang saat container dibuat ulang)."
  echo "  Agar PERSISTEN, mount ${DEST_HOST} → ${DEST_IN_CONTAINER} di compose"
  echo "  app lama (lihat docker-compose.override.yml + README.md)."
  docker cp "${DEST_HOST}" "${NGINX_CONTAINER}:${DEST_IN_CONTAINER}"
else
  echo "✓ Conf sudah di-mount dari host — perubahan file langsung terbaca."
fi

# 4) Validasi + reload
echo "▶ Validasi konfigurasi nginx..."
if ! docker exec "${NGINX_CONTAINER}" nginx -t; then
  echo "✗ nginx -t GAGAL. Periksa path ssl_certificate/key di ${DEST_HOST}"
  echo "  (samakan dengan server block risetcenter.com app lama)."
  exit 1
fi
docker exec "${NGINX_CONTAINER}" nginx -s reload
echo "✓ nginx reload dikirim."

# 5) Verifikasi origin: port 80 (jalur Cloudflare Flexible) DAN 443
VPS_IP="$(curl -s -4 ifconfig.me 2>/dev/null || true)"
[ -z "${VPS_IP}" ] && VPS_IP="127.0.0.1"

verify() {  # $1=scheme  $2=port  $3=insecure(1/0)
  local flags=(-s --resolve "survei.risetcenter.com:$2:${VPS_IP}")
  [ "$3" = "1" ] && flags+=(-k)
  local title
  title="$(curl "${flags[@]}" "$1://survei.risetcenter.com/" 2>/dev/null \
    | grep -i -o '<title>[^<]*' | head -1 | sed 's/<title>//I')"
  echo "  ${1} (:$2) → ${title:-<tidak ada title / gagal>}"
}

echo "── Verifikasi origin (IP ${VPS_IP}) ─────────────────────────────────────"
verify http  80 0
verify https 443 1
echo "  Target keduanya: 'Populi Center - Survei Online' (app survei BARU)."

cat <<EOF

── Jika :80 masih app lama ──────────────────────────────────────────────────
Config sudah benar tapi reload kadang tak langsung mengikat listener baru.
Restart container nginx (AMAN — attach network 'web' tetap terjaga oleh
docker restart, beda dengan 'docker compose up' yang membuat ulang container):
  docker restart ${NGINX_CONTAINER}
  docker exec ${NGINX_CONTAINER} nginx -t

── Verifikasi akhir lewat Cloudflare ────────────────────────────────────────
  curl -s https://survei.risetcenter.com/ | grep -i '<title>'   # → Survei Online
  curl -sI https://risetcenter.com/        | head -1            # → app lama TETAP normal
EOF

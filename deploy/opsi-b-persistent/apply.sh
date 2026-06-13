#!/usr/bin/env bash
# =============================================================================
# apply.sh — pulihkan + pasang routing survei.risetcenter.com (Opsi B)
# =============================================================================
# Jalankan di VPS. Memberi efek LANGSUNG (live) tanpa menunggu redeploy:
#   1) pastikan network "web" ada
#   2) sambungkan nginx app lama ke "web"
#   3) salin server block survei ke conf.d nginx app lama + reload
#
# Untuk PERSISTENSI lintas redeploy, lihat README.md (pasang docker-compose.override.yml).
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

echo "▶ Container nginx app lama : ${NGINX_CONTAINER}"
echo "▶ File server block         : ${CONF}"

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

# 3) Salin server block ke conf.d + validasi + reload
echo "▶ Menyalin server block ke conf.d..."
docker cp "${CONF}" "${NGINX_CONTAINER}:/etc/nginx/conf.d/survei.risetcenter.com.conf"

echo "▶ Validasi konfigurasi nginx..."
if docker exec "${NGINX_CONTAINER}" nginx -t; then
  docker exec "${NGINX_CONTAINER}" nginx -s reload
  echo "✓ nginx reload sukses — survei.risetcenter.com seharusnya sudah aktif."
else
  echo "✗ nginx -t GAGAL. Periksa path cert/key di survei.risetcenter.com.conf"
  echo "  (samakan dengan server block risetcenter.com app lama)."
  exit 1
fi

echo ""
echo "── Verifikasi ──────────────────────────────────────────────────────────"
echo "curl -I https://survei.risetcenter.com            # → 200 (app survei baru)"
echo "curl -I https://risetcenter.com                   # → app lama TETAP normal"
echo ""
echo "‼ PERSISTENSI: salin docker-compose.override.yml + survei.risetcenter.com.conf"
echo "  ke ${OLD_APP_DIR}/ agar routing TIDAK hilang saat app lama redeploy."
echo "  (lihat README.md langkah 'Persistensi')"

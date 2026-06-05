# Runbook Deploy — Opsi B (survei via nginx app lama)

Menjalankan **survei** di `https://survei.populicenter.org` dengan menumpang
nginx milik `survey-populicenter` (yang sudah memegang port 80/443), **tanpa
mengubah** konfigurasi risetcenter.com. SSL survei pakai Let's Encrypt.

```
risetcenter.com ──► Cloudflare ──► VPS:443 ─┐
                                            ├─► survey-populicenter-nginx-1
survei.populicenter.org ────────────────────┘     ├─ server_name risetcenter.com → app lama (UTUH)
              (langsung ke VPS:443)                └─ server_name survei.* → proxy ke survei_frontend
                                                                                    │ (jaringan "web")
                                                                       survei_frontend ─► survei_backend
```

Perubahan pada app lama: **hanya menambah** (server block baru + keanggotaan
jaringan + mount sertifikat). Blok risetcenter.com tidak diubah.

> Catatan: Opsi B TIDAK memakai Nginx Proxy Manager. File di
> `deploy/reverse-proxy/` dan `deploy/DEPLOY.md` adalah alternatif (Opsi C / NPM)
> yang tidak dipakai — boleh diabaikan atau dihapus.

---

## Prasyarat

- [ ] **DNS**: A record `survei.populicenter.org` → IP VPS (langsung, bukan proxy CF).
      Cek: `dig +short survei.populicenter.org` → harus muncul IP VPS.
- [ ] `/var/www/online-survei/.env` & `backend/.env` sudah terisi (password +
      `ALLOWED_ORIGINS=https://survei.populicenter.org`). ✅ sudah disiapkan.
- [ ] File app lama (`docker-compose.yml`, `nginx.conf`) versi Opsi B sudah
      di-upload ke `/var/www/survey-populicenter/`.

## Langkah 0 — Backup app lama

```bash
cd /var/www/survey-populicenter
cp docker-compose.yml docker-compose.yml.bak
cp nginx.conf nginx.conf.bak
```

## Langkah 1 — Jaringan bersama + folder certbot + certbot

```bash
docker network create web            # sekali saja
sudo mkdir -p /var/www/certbot
sudo apt-get update && sudo apt-get install -y certbot   # jika belum ada
```

## Langkah 2 — Terapkan app lama versi Opsi B

File `docker-compose.yml` & `nginx.conf` versi baru sudah berisi:
- nginx gabung jaringan `web` + mount `/etc/letsencrypt` & `/var/www/certbot`
- server block port 80 untuk `survei.populicenter.org` (jalur ACME + redirect)
- server block port 443 survei **masih dikomentari** (cert belum ada)

```bash
cd /var/www/survey-populicenter
docker compose up -d           # nginx dibuat ulang dgn mount & network baru
docker exec survey-populicenter-nginx-1 nginx -t   # pastikan config valid
```

> Saat ini `https://survei...` belum jalan (443 belum aktif) — normal.
> Yang penting jalur `http://survei.populicenter.org/.well-known/acme-challenge/`
> sudah dilayani untuk penerbitan sertifikat.

## Langkah 3 — Jalankan app survei

```bash
cd /var/www/online-survei
docker compose up -d
# survei_frontend otomatis tergabung ke jaringan "web"
```

Verifikasi nginx lama & survei_frontend satu jaringan:

```bash
docker network inspect web --format '{{range .Containers}}{{.Name}} {{end}}'
# harus memuat: survey-populicenter-nginx-1  survei_frontend
```

## Langkah 4 — Terbitkan sertifikat Let's Encrypt

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d survei.populicenter.org \
  --email ningratkumara@gmail.com --agree-tos --no-eff-email
```

Berhasil → sertifikat ada di `/etc/letsencrypt/live/survei.populicenter.org/`.
Jika gagal: pastikan DNS sudah mengarah ke VPS dan port 80 dapat diakses publik.

## Langkah 5 — Aktifkan HTTPS survei

Buka komentar blok `server { listen 443 ssl; server_name survei.populicenter.org; ... }`
di `/var/www/survey-populicenter/nginx.conf` (hapus tanda `#` di tiap baris blok itu),
lalu:

```bash
docker exec survey-populicenter-nginx-1 nginx -t        # validasi
docker exec survey-populicenter-nginx-1 nginx -s reload # reload tanpa downtime
```

## Langkah 6 — Auto-perpanjang sertifikat

certbot memasang timer perpanjangan otomatis. Tambahkan hook agar nginx reload
setelah perpanjangan:

```bash
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
echo '#!/bin/sh
docker exec survey-populicenter-nginx-1 nginx -s reload' \
  | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

sudo certbot renew --dry-run     # uji simulasi perpanjangan
```

## Langkah 7 — Verifikasi akhir

```bash
curl -I  https://survei.populicenter.org           # → 200, sertifikat valid
curl -sI https://survei.populicenter.org/api/health # → 200 dari survei_backend
curl -I  https://risetcenter.com                    # → app lama TETAP normal
```

---

## Rollback cepat

```bash
cd /var/www/survey-populicenter
cp nginx.conf.bak nginx.conf
cp docker-compose.yml.bak docker-compose.yml
docker compose up -d
# Matikan survei bila perlu:
cd /var/www/online-survei && docker compose down
```

## Kenapa risetcenter.com aman

- Blok `server_name risetcenter.com www.risetcenter.com _;` tidak diubah.
- nginx mencocokkan `server_name` eksaks dulu → request `survei.populicenter.org`
  masuk ke blok baru; `risetcenter.com` tetap ke blok lama.
- Penambahan mount & jaringan `web` tidak mengubah cara nginx melayani risetcenter.com.
- Sertifikat Cloudflare Origin untuk risetcenter.com tidak tersentuh.

# Routing persisten `survei.risetcenter.com` (Opsi B)

Memperbaiki masalah **"survei.risetcenter.com tiba-tiba balik ke aplikasi lama"**.

## Penyebab

Routing survei menumpang nginx app lama lewat 2 perubahan **live/manual** yang
hilang setiap app lama di-restart/redeploy:

1. server block `survei.risetcenter.com` di `nginx.conf` app lama, dan
2. keanggotaan nginx app lama di Docker network `web`.

Kalau salah satu hilang → permintaan jatuh ke `server_name _` (catch-all) →
**muncul aplikasi lama**.

## Isi folder

| File | Fungsi |
|---|---|
| `survei.risetcenter.com.conf` | Server block nginx untuk subdomain survei (proxy ke `survei_frontend`). |
| `docker-compose.override.yml` | Override app lama → network `web` + mount conf **persisten** lintas redeploy. |
| `apply.sh` | Pemulihan **langsung** (live): connect network + pasang conf + reload. |

---

## Langkah 1 — Pulihkan sekarang (efek langsung)

Salin folder ini ke VPS lalu:

```bash
cd deploy/opsi-b-persistent
# sesuaikan bila nama container nginx app lama berbeda:
#   NGINX_CONTAINER=nama-lain ./apply.sh
chmod +x apply.sh && ./apply.sh
```

Skrip akan: membuat network `web` (bila belum ada) → menyambungkan nginx app
lama → menyalin server block → `nginx -t` → reload.

> **Cek path sertifikat dulu.** Buka `survei.risetcenter.com.conf` dan samakan
> `ssl_certificate` / `ssl_certificate_key` dengan yang dipakai server block
> `risetcenter.com` app lama. Lihat dengan:
> `docker exec survey-populicenter-nginx-1 nginx -T | grep -i ssl_certificate`

Verifikasi:

```bash
curl -I https://survei.risetcenter.com   # → 200, aplikasi survei BARU
curl -I https://risetcenter.com          # → app lama tetap normal
```

---

## Langkah 2 — Persistensi (agar tidak kambuh)

Agar routing **tidak hilang lagi** saat app lama redeploy, pasang override:

```bash
cp survei.risetcenter.com.conf   /var/www/survey-populicenter/
cp docker-compose.override.yml   /var/www/survey-populicenter/

cd /var/www/survey-populicenter
docker compose config --services      # pastikan nama service nginx = "nginx"
docker compose up -d                  # merge override → persisten
```

### Prasyarat penting

Override **opsi B1** (mount ke `conf.d`) hanya bekerja bila `nginx.conf` app lama
meng-include conf.d. Cek:

```bash
docker exec survey-populicenter-nginx-1 sh -c 'grep -n "include .*conf.d" /etc/nginx/nginx.conf'
```

- **Ada include `conf.d/*.conf`** → pakai `docker-compose.override.yml` apa adanya. ✅
- **TIDAK ada** (nginx.conf monolitik) → **opsi B2**: tempelkan isi
  `survei.risetcenter.com.conf` langsung ke dalam blok `http { … }` di
  `/var/www/survey-populicenter/nginx.conf`, lalu **commit file itu ke repo app
  lama** supaya redeploy tidak menimpanya. (Override tetap berguna untuk network `web`.)

> Jika nama service nginx app lama bukan `nginx`, sesuaikan di
> `docker-compose.override.yml`. Bila ragu, kirimkan `nginx.conf` +
> `docker-compose.yml` app lama dan saya buatkan yang persis.

---

## Rollback

```bash
cd /var/www/survey-populicenter
rm -f docker-compose.override.yml survei.risetcenter.com.conf
docker compose up -d
```

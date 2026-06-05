> ⚠️ ARSIP / TIDAK DIPAKAI. Ini runbook Opsi C (Nginx Proxy Manager) yang
> memindahkan risetcenter.com ke belakang NPM. Kita memilih **Opsi B** —
> lihat **`DEPLOY-OPSI-B.md`**. Dokumen ini disimpan sebagai referensi saja.

# Runbook Deploy — Survei di VPS bersama `survey-populicenter`

Target: menjalankan aplikasi survei baru di **`https://survei.populicenter.org`**
pada VPS yang **sudah** menjalankan `survey-populicenter`, tanpa mengganggu app
lama, dengan satu reverse proxy bersama (Nginx Proxy Manager / NPM) yang
menangani port 80/443 + SSL untuk SEMUA app.

## Kondisi awal VPS

| Container | Port | Peran |
|-----------|------|-------|
| `survey-populicenter-nginx-1` | `80:80`, `443:443` | Pintu masuk app lama (akan didemosi) |
| `survey-populicenter-backend` | `3000:3000` | API app lama |
| `survey-populicenter-postgres` | internal | DB app lama |
| `survey-populicenter-redis-1` | internal | Redis app lama |
| `survey-populicenter-worker` | internal | Worker app lama |

Masalah: port 80/443 dipegang `survey-populicenter-nginx-1`. NPM butuh port itu.
Solusi: nginx app lama diturunkan jadi backend internal (expose 80 saja), NPM
yang pegang 80/443 dan meneruskan per-subdomain.

```
Internet :80/:443
      │
   ┌──▼── NPM ──┐  (pegang 80/443 + SSL)
   │            │
populicenter.org    survei.populicenter.org
   │            │
populicenter-     survei_frontend:80
nginx-1:80
```

---

## Langkah 0 — Backup & DNS (sebelum mulai)

```bash
# Backup compose app lama dulu
cp docker-compose.yml docker-compose.yml.bak

# DNS: tambahkan A record di pengelola domain populicenter.org
#   survei   A   <IP_VPS>
# Pastikan A record app lama juga tetap menunjuk ke <IP_VPS>.
# Cek propagasi:
dig +short survei.populicenter.org
```

## Langkah 1 — Jaringan bersama

```bash
docker network create web
```

## Langkah 2 — Demosi nginx app lama (lepas 80/443)

Edit `docker-compose.yml` milik **survey-populicenter**, pada service `nginx`:

```yaml
  nginx:
    # SEBELUM:
    #   ports:
    #     - "80:80"
    #     - "443:443"
    # SESUDAH: jadi backend internal di belakang NPM
    expose:
      - "80"
    networks:
      - default          # jaringan internal app lama (sesuaikan namanya)
      - web              # jaringan bersama agar NPM bisa menjangkau

# dan di bagian networks paling bawah, tambahkan:
networks:
  web:
    external: true
```

> PENTING: kalau config nginx app lama memaksa redirect HTTP→HTTPS (mis.
> `return 301 https://...`), NONAKTIFKAN di blok port 80, karena NPM yang akan
> menangani SSL dan meneruskan HTTP polos ke nginx ini. Kalau tidak, terjadi
> redirect loop. Sertifikat 443 lama di nginx ini tidak dipakai lagi (NPM yang
> menerbitkan SSL baru via Let's Encrypt).

Terapkan:

```bash
cd /var/www/survey-populicenter
docker compose up -d        # nginx lama kini lepas dari 80/443
```

## Langkah 3 — Jalankan Nginx Proxy Manager

```bash
cp /var/www/online-survei/deploy/reverse-proxy/docker-compose.yml /var/www/reverse-proxy/
cd /var/www/reverse-proxy
docker compose up -d
```

Buka GUI: `http://<IP_VPS>:81`
Login awal: `admin@example.com` / `changeme` → WAJIB ganti email & password.

## Langkah 4 — Jalankan app survei

```bash
cd /var/www/online-survei

# Pastikan .env & backend/.env sudah terisi (password + ALLOWED_ORIGINS=https://survei.populicenter.org)
docker compose up -d
```

`survei_frontend` otomatis bergabung ke network `web` (sudah diset di compose).

## Langkah 5 — Daftarkan host di NPM (GUI → Hosts → Proxy Hosts → Add)

**App lama:**
| Field | Nilai |
|-------|-------|
| Domain Names | `populicenter.org` (atau domain app lama yang sekarang) |
| Forward Hostname | `survey-populicenter-nginx-1` |
| Forward Port | `80` |
| Scheme | `http` |
| Block Common Exploits | on |
| Websockets Support | on |
| SSL tab | Request new Let's Encrypt cert + Force SSL + HTTP/2 |

**App survei:**
| Field | Nilai |
|-------|-------|
| Domain Names | `survei.populicenter.org` |
| Forward Hostname | `survei_frontend` |
| Forward Port | `80` |
| Scheme | `http` |
| Block Common Exploits | on |
| Websockets Support | on |
| SSL tab | Request new Let's Encrypt cert + Force SSL + HTTP/2 |

> Forward Hostname memakai NAMA CONTAINER, bukan IP. Agar bisa di-resolve, NPM
> dan kedua container target harus berada di network `web` yang sama.

## Langkah 6 — Verifikasi

```bash
# Kedua container target harus terlihat di network web
docker network inspect web --format '{{range .Containers}}{{.Name}} {{end}}'
# harus memuat: nginx_proxy_manager, survey-populicenter-nginx-1, survei_frontend

curl -I https://survei.populicenter.org          # → 200/301, sertifikat valid
curl -I https://survei.populicenter.org/api/health   # → 200 dari backend survei
```

## Firewall

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow OpenSSH
# JANGAN buka 81 (GUI NPM) ke publik — akses via SSH tunnel:
#   ssh -L 81:localhost:81 user@IP_VPS  → buka http://localhost:81 di laptop
sudo ufw enable
```

## Rollback cepat (jika ada masalah)

```bash
# Kembalikan app lama pegang 80/443
cd /var/www/survey-populicenter
cp docker-compose.yml.bak docker-compose.yml
docker compose up -d
# Matikan NPM & survei
cd /var/www/reverse-proxy && docker compose down
cd /var/www/online-survei && docker compose down
```

## Catatan resource (KVM 2, 8 GB RAM)

| Stack | RAM perkiraan |
|-------|---------------|
| survey-populicenter (5 container) | ~240 MB |
| survei (6 container) | ~1 GB |
| Nginx Proxy Manager | ~50 MB |
| **Total** | **~1.3 GB / 7.75 GB** → sisa ~6.5 GB |

Masih sangat lega untuk menambah app ke-3 s/d ke-5.

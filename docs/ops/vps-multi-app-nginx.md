# VPS Bersama: Edge Nginx Multi-Aplikasi (risetcenter.com)

> **Konteks:** Satu VPS (Hostinger) menjalankan **beberapa aplikasi terpisah**
> (masing-masing Docker Compose sendiri), berbagi **satu nginx edge** yang
> memegang port 80/443. Dokumen ini adalah peta arsitektur + panduan langkah
> demi langkah untuk menambah aplikasi baru **tanpa mematikan aplikasi lain**
> (insiden ini pernah terjadi — lihat bagian Riwayat Insiden di bawah).

## 1. Peta arsitektur

```
Internet → Cloudflare (DNS + SSL) → VPS:80/443
                                        │
                                        ▼
                    container "survey-populicenter-nginx-1"
                    (edge nginx bersama, SATU-SATUNYA yang publish port 80/443)
                    stack: /var/www/survey-populicenter/ (app lama/base-populicenter)
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
         server_name              server_name          server_name
      risetcenter.com          survei.risetcenter    wa.risetcenter
      www.risetcenter.com      .com (conf sendiri)   .com (conf sendiri)
      "_" (catch-all)                │                     │
            │                        ▼                     ▼
            ▼                 survei_frontend:80     wa_frontend:80
   nginx-common.conf          (proxy /api internal    (proxy internal
   → backend:3000             ke survei_backend)      ke wa_backend)
   (API app LAMA sendiri,
   BUKAN app survei kita!)
```

**Penting:** `nginx.service` di **host** (systemd) **mati/tidak dipakai**
(`inactive (dead)`). Seluruh routing HTTP/HTTPS untuk SEMUA domain di VPS ini
ditangani oleh **satu container** `survey-populicenter-nginx-1`, bagian dari
stack aplikasi lama, BUKAN reverse proxy khusus (bukan Nginx Proxy Manager/
Traefik/dsb).

## 2. Inventaris saat ini

| Domain                                   | Diproxy ke                                   | Compose stack                         | Lokasi compose                      |
| ---------------------------------------- | -------------------------------------------- | ------------------------------------- | ----------------------------------- |
| `risetcenter.com`, `www.risetcenter.com` | `backend` (app lama) via `nginx-common.conf` | survey-populicenter                   | `/var/www/survey-populicenter/`     |
| `survei.risetcenter.com`                 | `survei_frontend:80`                         | aplikasi-survei-web-online (repo ini) | `/var/www/online-survei/`           |
| `wa.risetcenter.com`                     | `wa_frontend:80`                             | app WhatsApp                          | `/var/www/survei-wa/` (deploy asal) |

File kunci di `/var/www/survey-populicenter/` (host, di-_bind mount_ ke
container edge nginx):

| File host                              | Mount ke container                              | Isi                                                                                                                                                                                                        |
| -------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker-compose.yml`                   | —                                               | Stack ASLI app lama (nginx, backend, worker, postgres, redis). **Publish port 80/443 di sini.**                                                                                                            |
| `docker-compose.override.yml`          | —                                               | **Tempat menambah vhost baru** tanpa mengubah `docker-compose.yml`. Compose **menggabung** (bukan menimpa) `volumes:` berdasarkan path tujuan di container — jadi aman menambah baris baru di sini.        |
| `nginx.conf`                           | `/etc/nginx/conf.d/default.conf`                | Server block `risetcenter.com`/catch-all `_` (app lama). Dimuat **paling awal** (alfabetis) → jadi _implicit default server_.                                                                              |
| `nginx-common.conf`                    | `/etc/nginx/nginx-common.conf`                  | Rute API **app lama saja** (`/auth`, `/surveys`, `/responses`, dst. — mirip nama tapi BUKAN app survei kita!). Jangan bingung.                                                                             |
| `certs/origin.pem`, `certs/origin.key` | `/etc/nginx/certs/`                             | **Cloudflare Origin Certificate** zona populicenter.com (sejak migrasi domain; cert risetcenter lama = `*.bak`, lihat [migrasi §1](migrasi-domain-populicenter.md)). Dipakai bersama oleh SEMUA subdomain. |
| `wa.risetcenter.com.conf`              | `/etc/nginx/conf.d/wa.risetcenter.com.conf`     | Vhost WA — mandiri, proxy semua path ke `wa_frontend:80`.                                                                                                                                                  |
| `survei.risetcenter.com.conf`          | `/etc/nginx/conf.d/survei.risetcenter.com.conf` | Vhost survei — mandiri, proxy semua path ke `survei_frontend:80`.                                                                                                                                          |

## 3. Panduan: menambah aplikasi baru (app ke-4, dst.)

### Syarat aplikasi baru

1. **JANGAN** publish port 80/443 sendiri di `docker-compose.yml` app baru.
   Cukup `expose: "80"` (internal) pada container frontend-nya.
2. Container frontend app baru harus join **network eksternal `web`**
   (sudah ada, jangan dibuat ulang):
   ```yaml
   services:
     frontend:
       expose: ['80']
       networks:
         - app_network # internal app baru sendiri
         - web # supaya bisa dijangkau edge nginx
   networks:
     web:
       external: true
   ```
3. Idealnya, frontend app baru punya **nginx internal sendiri** yang
   mem-proxy `/api` ke backend-nya (pola yang sudah dipakai `survei_frontend`
   dan `wa_frontend`) — supaya edge nginx cukup teruskan SEMUA path apa
   adanya, tanpa perlu tahu detail rute app.

### Langkah di edge nginx (`/var/www/survey-populicenter/`)

1. **Buat file vhost baru**, mandiri, pola sama seperti `wa.risetcenter.com.conf`:

   ```bash
   cat > /var/www/survey-populicenter/<subdomain>.risetcenter.com.conf <<'EOF'
   server {
       listen 80;
       listen [::]:80;
       listen 443 ssl;
       listen [::]:443 ssl;
       server_name <subdomain>.risetcenter.com;

       ssl_certificate     /etc/nginx/certs/origin.pem;
       ssl_certificate_key /etc/nginx/certs/origin.key;

       client_max_body_size 12m;
       resolver 127.0.0.11 valid=30s;
       set $app_upstream <nama_container_frontend>;

       location / {
           proxy_pass http://$app_upstream:80;
           proxy_http_version 1.1;
           proxy_set_header Host              $host;
           proxy_set_header X-Real-IP         $remote_addr;
           proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_set_header Upgrade           $http_upgrade;
           proxy_set_header Connection        "upgrade";
           proxy_read_timeout 120s;
       }
   }
   EOF
   ```

2. **Cadangkan override, lalu tambah SATU baris** di
   `docker-compose.override.yml` (JANGAN ganti baris lain, JANGAN edit
   `docker-compose.yml` dasar):

   ```bash
   cd /var/www/survey-populicenter
   cp docker-compose.override.yml docker-compose.override.yml.bak-$(date +%Y%m%d-%H%M)
   ```

   Contoh di bawah hanya ilustrasi bentuk file — **jangan tempel utuh /
   menimpa file di VPS** (isi aktualnya bisa lebih banyak, mis.
   `survei.populicenter.com.conf`); buka file yang ada lalu tambahkan barisnya
   saja:

   ```yaml
   services:
     nginx:
       volumes:
         - ./wa.risetcenter.com.conf:/etc/nginx/conf.d/wa.risetcenter.com.conf:ro
         - ./survei.risetcenter.com.conf:/etc/nginx/conf.d/survei.risetcenter.com.conf:ro
         - ./<subdomain>.risetcenter.com.conf:/etc/nginx/conf.d/<subdomain>.risetcenter.com.conf:ro # BARU
       networks:
         - default
         - web
   networks:
     web:
       external: true
   ```

3. **Periksa dulu sebelum apply** — mount lama + baru, image nginx, dan vhost
   baru (jangan percaya asumsi/komentar, verifikasi langsung).

   Muat fungsi bantu di bawah — sekali per sesi shell **bash**; dipakai lagi di
   langkah 4, 6 dan §4. Tempel bloknya, atau (bila repo survei di VPS sudah
   `git pull`) muat langsung dari dokumen ini:

   ```bash
   source <(sed -n '/^ *# >>> fungsi-edge/,/^ *# <<< fungsi-edge/p' /var/www/online-survei/docs/ops/vps-multi-app-nginx.md)
   ```

   Keluaran fungsi-fungsi ini hanya `sumber -> tujuan`, nama image,
   domain/kode HTTP/judul halaman, dan pesan tetap — tanpa `environment` atau
   nilai `.env` lain, jadi aman ditempel ke chat:

   ```bash
   # >>> fungsi-edge (bash) — mount_rencana, mount_aktual, image_rencana, cek_edge, cek_domain
   : "${EDGE_DIR:=/var/www/survey-populicenter}" "${EDGE_CTR:=survey-populicenter-nginx-1}"
   # Isi `docker compose config` (MEMUAT nilai .env) — hanya utk disaring, JANGAN dicetak.
   # stderr dibuang: pesan error .env bisa memuat nilainya; diganti pesan tetap.
   _edge_config() {
     (cd "$EDGE_DIR" && docker compose config 2>/dev/null) || {
       echo "GAGAL: docker compose config error. Lihat sendiri: docker compose config -q (JANGAN tempel pesannya)" >&2
       return 1; }
   }
   # Mount nginx menurut compose (docker-compose.yml + override) = yang AKAN diterapkan.
   # awk hanya membaca blok volumes: service nginx (sintaks panjang type/source/target
   # maupun pendek src:dst) dan berhenti di service/kunci tingkat atas berikutnya.
   # Selain bind, sumber ditulis "(volume)"/"(tmpfs)" — sama dgn mount_aktual.
   mount_rencana() {
     local cfg hasil
     cfg=$(_edge_config) || return 1
     hasil=$(printf '%s\n' "$cfg" | awk -v svc=nginx '
       function out() { if (t != "") print (ty == "bind" ? s : "(" ty ")") " -> " t; s = t = ty = "" }
       /^[^ ]/            { out(); top = $0; on = vol = 0; next }       # kunci tingkat atas
       top != "services:" { next }
       /^  [^ ]/          { out(); on = ($1 == svc ":"); vol = 0; next } # awal sebuah service
       !on                { next }
       /^    [^ -]/       { out(); vol = ($1 == "volumes:"); next }      # kunci lain: environment, dst.
       !vol               { next }
       { gsub(/"/, "") }
       /^ *- /            { out(); sub(/^ *- */, "")
                            if ($0 !~ /^[a-z_]+:( |$)/) {                # sintaks pendek
                              k = split($0, p, ":"); s = (k > 1 ? p[1] : ""); t = p[k > 1 ? 2 : 1]
                              ty = (s ~ /^[.\/~]/ ? "bind" : "volume"); out(); next } }
       { sub(/^ */, "") }
       /^type: /          { ty = $2 }
       /^source: /        { s = substr($0, 9) }
       /^target: /        { t = substr($0, 9) }
       END { out() }' | sort)
     [ -n "$hasil" ] || { echo "PERINGATAN: tak ada mount utk service nginx (cek: docker compose config --services)" >&2; return 1; }
     printf '%s\n' "$hasil"
   }
   # Mount container edge yang SEDANG jalan.
   mount_aktual() {
     local hasil
     hasil=$(docker inspect "$EDGE_CTR" \
       --format '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}}{{else}}({{.Type}}){{end}} -> {{.Destination}}{{println}}{{end}}' |
       grep . | sort)
     [ -n "$hasil" ] || { echo "PERINGATAN: container $EDGE_CTR tak ditemukan / tanpa mount" >&2; return 1; }
     printf '%s\n' "$hasil"
   }
   # Image service nginx menurut compose (hanya baris image:).
   image_rencana() {
     local cfg
     cfg=$(_edge_config) || return 1
     printf '%s\n' "$cfg" | awk '/^[^ ]/ { top = $0; on = 0; next }
       top == "services:" && /^  [^ ]/ { on = ($1 == "nginx:"); next }
       on && /^    image: / { gsub(/"/, ""); print $2 }'
   }
   # GERBANG sebelum recreate: container yang jalan vs rencana compose (mount + image).
   # Kode keluar 0 = boleh diterapkan; selain 0 = STOP (alasannya dicetak).
   cek_edge() {
     local a r hilang baru ic ir
     a=$(mount_aktual) && r=$(mount_rencana) || { echo "STOP: cek gagal (lihat pesan di atas)"; return 2; }
     echo "Jumlah mount: container $(printf '%s\n' "$a" | wc -l), rencana $(printf '%s\n' "$r" | wc -l)"
     hilang=$(printf '%s\n' "$a" | grep -vxF -f <(printf '%s\n' "$r"))   # di container, tak di rencana
     baru=$(printf '%s\n' "$r" | grep -vxF -f <(printf '%s\n' "$a"))     # di rencana, belum di container
     [ -z "$hilang" ] || printf '%s\n' "$hilang" | sed 's/^/< /'
     [ -z "$baru" ] || printf '%s\n' "$baru" | sed 's/^/> /'
     if [ -n "$hilang" ]; then
       echo "STOP: mount bertanda < akan HILANG saat nginx di-recreate — perbaiki override dulu"; return 1
     fi
     # ID image yang dipakai container vs ID image yang kini ditunjuk tag di compose.
     ic=$(docker inspect -f '{{.Image}}' "$EDGE_CTR")
     ir=$(docker image inspect -f '{{.Id}}' "$(image_rencana)" 2>/dev/null)
     if [ "$ic" != "$ir" ]; then
       echo "STOP: image nginx rencana ($(image_rencana)) beda dgn image container"
       echo "      ($(docker inspect -f '{{.Config.Image}}' "$EDGE_CTR")) — recreate akan ikut mengganti versi app lama."
       return 3
     fi
     if [ -z "$baru" ]; then echo "SAMA: mount & image container = rencana compose"
     else echo "AMAN: hanya mount baru (>) — boleh: docker compose up -d --no-deps nginx"; fi
   }
   # Kode HTTP + <title> tiap server_name di nginx yang jalan, via 443 (SNI benar) dan 80.
   cek_domain() {
     local d p hasil
     for d in $(docker exec "$EDGE_CTR" nginx -T 2>/dev/null |
         awk '$1 == "server_name" { for (i = 2; i <= NF; i++) { sub(/;$/, "", $i); if ($i != "") print $i } }' |
         grep -Ev '^(_|~|\*|\.)' | sort -u); do
       printf '%-28s' "$d"
       for p in https:443 http:80; do
         hasil=$(curl -sk --max-time 10 --resolve "$d:${p#*:}:127.0.0.1" "${p%%:*}://$d/" -w '\n%{http_code}')
         printf ' %s:%s %s' "${p#*:}" "${hasil##*$'\n'}" "$(printf '%s' "$hasil" | grep -o '<title>[^<]*</title>' | head -1)"
       done
       echo
     done
   }
   # <<< fungsi-edge
   ```

   Lalu jalankan:

   ```bash
   cd /var/www/survey-populicenter
   mount_rencana                                # harus memuat SEMUA vhost (lama + baru)
   cek_edge                                     # container yang jalan vs rencana compose
   cek_domain > /tmp/edge-domain-sebelum.txt    # pembanding utk langkah 6
   ```

   Cara baca `cek_edge` (`<` = hanya ada di container, `>` = hanya ada di
   rencana):
   - `AMAN` + hanya baris `>` (mount yang kamu tambahkan) → lanjut. Jumlah
     mount rencana = container + jumlah mount baru.
   - `SAMA` → mount tidak berubah: baris barumu belum tersimpan / file yang
     disunting salah (atau memang hanya isi conf yang berubah → lihat
     "Hanya isi conf" di langkah 4).
   - `STOP` + baris `<` → mount itu akan **HILANG** saat nginx di-recreate
     (pola insiden 1 Juli 2026) → perbaiki override dulu.
   - `STOP: image nginx …` → recreate akan ikut mengganti image app lama (mis.
     `latest` baru sudah ter-pull, atau deploy terakhir memakai
     `IMAGE_TAG=sha-…`). Samakan `IMAGE_TAG` dengan tag container di pesan
     (`IMAGE_TAG=sha-… docker compose …`) atau koordinasikan dulu dengan
     pemilik app lama. Bila perubahan image memang diterima (dan tak ada baris
     `<`), jalankan `docker compose up -d --no-deps nginx` tanpa gerbang.
   - `STOP: cek gagal` + `GAGAL`/`PERINGATAN` → `docker compose config` error
     (lihat sendiri dengan `docker compose config -q`, jangan tempel
     pesannya), container edge tak ditemukan, atau nama service bukan `nginx`
     (`docker compose config --services`).

   **Uji vhost baru di container sekali pakai.** Galat sintaks di vhost
   membuat nginx edge gagal start setelah recreate (restart-loop) → SEMUA
   domain mati, dan `docker exec … nginx -t` pun tak bisa jalan:

   ```bash
   docker run --rm --network web \
     -v /var/www/survey-populicenter/<subdomain>.risetcenter.com.conf:/etc/nginx/conf.d/uji.conf:ro \
     -v /var/www/survey-populicenter/certs:/etc/nginx/certs:ro \
     nginx:alpine nginx -t
   ```

   Harus `syntax is ok` + `test is successful` (pertama kali menarik image
   `nginx:alpine`).

   > ⚠️ **Jangan pernah menempel keluaran utuh `docker compose config`** ke
   > chat/AI, issue, atau grup — isinya sudah diinterpolasi dari `.env` app
   > lama (sandi DB, JWT, MinIO, Sentry DSN, dst.). Pesan error-nya pun bisa
   > memuat nilai `.env` (mis. kutip tak tertutup). Menyaring dengan
   > `grep -A N` juga TIDAK aman: dengan banyak mount, mount terbaru terpotong
   > (Compose v2 mencetak ±5–6 baris per mount); dengan blok pendek, grep
   > meluber ke `build.args` / service berikutnya (`postgres`, `redis`,
   > `worker`, …) dan ikut mencetak nilainya. Yang aman ditempel hanya
   > keluaran fungsi-fungsi di atas.

4. **Recreate HANYA service nginx** — lewat gerbang `cek_edge`, wajib
   `--no-deps`:

   ```bash
   cd /var/www/survey-populicenter
   cek_edge && docker compose up -d --no-deps nginx   # up TIDAK jalan bila STOP / fungsi belum dimuat
   docker exec survey-populicenter-nginx-1 nginx -t
   cek_edge                                           # sesudah recreate harus "SAMA"
   ```

   Kenapa `--no-deps`: `nginx` app lama punya `depends_on: backend` (yang
   bergantung ke `postgres`/`redis`). Tanpa `--no-deps`, `up -d nginx` ikut
   mengonvergensi service-service itu — yang config/image-nya berubah sejak
   terakhir di-up (mis. image `latest` baru sudah ter-pull, `.env` diubah) ikut
   di-recreate, dan compose menunggu healthcheck-nya. Dengan `--no-deps` hanya
   container nginx yang disentuh — tapi image nginx itu SENDIRI tetap ikut
   diperbarui bila berubah; karena itu `cek_edge` juga membandingkan image.
   Keluaran `up` hanya boleh menyebut `survey-populicenter-nginx-1`
   (`Recreated`/`Started`; `Running` = tak ada perubahan). Ingin lihat
   dampaknya dulu? Bila `docker compose --help` memuat `--dry-run`:
   `docker compose --dry-run up -d --no-deps nginx` (tidak membuat apa pun).

   **Rollback** (nginx restart-loop, atau domain lain rusak di langkah 6):

   ```bash
   cd /var/www/survey-populicenter
   cp docker-compose.override.yml.bak-<waktu> docker-compose.override.yml
   docker compose up -d --no-deps nginx   # tanpa gerbang: "<" utk mount baru memang diharapkan
   cek_edge                               # harus "SAMA" lagi
   ```

   **Hanya isi conf yang berubah** (mount tetap)? Tak perlu recreate — cukup
   reload, ASALKAN file ditulis _in-place_ (`cat salinan > file`,
   `cp salinan file`, nano). Mount per-file mengikat inode: `sed -i`, vim
   (umumnya) dan `mv` membuat file baru, sehingga container tetap melihat isi
   LAMA. Cek dulu, lalu reload:

   ```bash
   cd /var/www/survey-populicenter
   docker exec survey-populicenter-nginx-1 cat /etc/nginx/conf.d/<subdomain>.risetcenter.com.conf |
     diff - <subdomain>.risetcenter.com.conf && echo "SAMA: container melihat isi baru"
   docker exec survey-populicenter-nginx-1 nginx -t && docker exec survey-populicenter-nginx-1 nginx -s reload
   ```

   Bila `diff` menampilkan beda (inode terganti): uji file itu dengan
   container sekali pakai (langkah 3), lalu
   `docker restart survey-populicenter-nginx-1` (memasang ulang mount menurut
   path; semua domain putus beberapa detik).

5. **Verifikasi dengan SNI yang benar** (⚠️ lihat gotcha #3 di bawah — `-H
"Host:"` biasa TIDAK CUKUP untuk domain HTTPS/HTTP2):

   ```bash
   curl -sk --resolve <subdomain>.risetcenter.com:443:127.0.0.1 \
     https://<subdomain>.risetcenter.com/ -o /dev/null -w "HTTP: %{http_code}\n"
   ```

   Harus `200`. Lalu cek juga dari browser asli.

6. **Cek SEMUA domain di edge masih benar** (jangan cuma cek yang baru!).
   `cek_domain` mengambil daftar `server_name` dari nginx yang jalan, lalu
   mencetak kode HTTP + `<title>` lewat 443 dan 80 (zona Cloudflare
   ber-SSL Flexible masuk lewat 80):

   ```bash
   cek_domain | diff /tmp/edge-domain-sebelum.txt -
   ```

   (`<` = sebelum, `>` = sesudah.) Hanya baris `>` untuk domain baru → OK. Ada
   baris `<` → domain itu berubah perilaku (hilang dari daftar = vhost-nya tak
   termuat; judul kini judul app lama; kode `000`/`502`) → rollback (langkah
   4). Kode wajar: `200`, atau `301` untuk domain redirect (mis.
   `survei.risetcenter.com`).

## 4. Runbook troubleshooting: "app X tidak bisa diakses setelah instal app Y"

Jalankan berurutan:

```bash
# 1) Siapa pegang port 80/443? HARUS selalu survey-populicenter-nginx-1
sudo ss -ltnp | grep -E ':80|:443'
docker ps -a | grep -iE "nginx|proxy"

# 2) Semua container yang perlu dijangkau edge nginx masih di network "web"?
docker network inspect web --format '{{range .Containers}}{{println .Name}}{{end}}'
# Harus muncul: survey-populicenter-nginx-1, survei_frontend, wa_frontend, dst.
# Kalau ada yang HILANG dari daftar → reattach:
#   docker network connect web <nama_container>
#   docker exec survey-populicenter-nginx-1 nginx -s reload

# 3) Config vhost domain yang bermasalah masih ada & termuat?
docker exec survey-populicenter-nginx-1 grep -rl "<domain-bermasalah>" /etc/nginx/
# Kosong / hanya muncul di KOMENTAR file lain → vhost hilang, lihat §3.

# 4) Mount & image nginx: container yang jalan vs rencana compose. Butuh fungsi dari
#    §3 langkah 3 (sesi shell baru → muat dulu; tanpa itu muncul "command not found",
#    BUKAN berarti OK). JANGAN pakai `docker compose config | grep ...` — terpotong &
#    bisa mencetak sandi .env.
cek_edge
# SAMA          → container cocok dgn compose
# AMAN + ">"    → mount baru belum diterapkan → §3 langkah 4
# STOP + "<"    → ada di container, TIDAK di compose → akan HILANG saat recreate; perbaiki override

# 5) Syntax nginx OK?
docker exec survey-populicenter-nginx-1 nginx -t

# 6) Tes routing SEMUA domain dgn SNI benar (lihat §5 gotcha #3), atau satu domain:
cek_domain
curl -sk --resolve <domain>:443:127.0.0.1 https://<domain>/ | grep -o "<title>.*</title>"

# 7) Resource VPS (disk/RAM) — jangan lupa cek juga
free -h; df -h /; docker stats --no-stream
```

## 5. Gotcha yang WAJIB diingat

1. **Jangan pernah publish port 80/443 di compose app baru.** Hanya
   `survey-populicenter-nginx-1` yang boleh memegang port itu. Kalau app baru
   punya nginx/traefik/caddy bawaan, matikan publish port-nya dan pakai pola
   vhost mandiri di §3.
2. **`docker-compose.override.yml` menggabung `volumes:` berdasarkan path
   TUJUAN di container** (additive), bukan menimpa seluruh list — tapi
   **selalu verifikasi hasil gabungannya** dengan `mount_rencana`/`cek_edge`
   (§3 langkah 3, membaca `docker compose config` secara aman), jangan percaya
   asumsi/komentar lama (ini persis penyebab insiden 1 Juli 2026 — komentar
   bilang "mount survei.conf tetap ada" padahal mount itu **tidak pernah ada**
   di `docker-compose.yml` dasar).
3. **`curl -H "Host: xxx" https://127.0.0.1/` BISA memberi `421 Misdirected
Request` PALSU** untuk domain HTTPS/HTTP2 kalau SNI tidak diset — itu bukan
   berarti config salah. Selalu uji dengan `curl --resolve <domain>:443:127.0.0.1
https://<domain>/` (SNI **dan** Host sama-sama benar). Browser asli tidak
   pernah kena masalah ini (selalu kirim SNI benar).
4. **Jangan hapus/recreate network `web`** (mis. lewat `docker compose down`
   pada project yang salah mendefinisikan `web` TANPA `external: true`) — ini
   akan memutus SEMUA app dari edge nginx sekaligus.
5. **`nginx-common.conf` di stack app lama BUKAN untuk app survei kita** —
   nama rutenya kebetulan mirip (`/surveys`, `/responses`, dst.) karena app
   lama juga aplikasi survei (base-populicenter, cikal-bakal repo ini), tapi
   proxy targetnya beda container. Jangan pernah edit file ini untuk
   keperluan app survei — buat vhost sendiri (§3).
6. **Disk VPS saat insiden ini: 74% terpakai (71G/96G).** Pantau berkala
   (`df -h /`) — jangan sampai penuh saat menambah app baru.
7. **Keluaran `docker compose config` memuat rahasia** (nilai `.env` sudah
   diinterpolasi; pesan error-nya pun bisa). Jangan tempel ke mana pun, dan
   jangan disaring dengan `grep -A N` (terpotong/meluber ke service lain). Cek
   mount pakai fungsi di §3 langkah 3.
8. **Menerapkan perubahan edge di stack app lama: selalu
   `cek_edge && docker compose up -d --no-deps nginx`** — jangan `up -d` tanpa
   target (menyentuh SEMUA service app lama) dan jangan `up -d nginx` tanpa
   `--no-deps` (ikut mengonvergensi `backend` dkk. lewat `depends_on`).
   Cadangkan override sebelum menyunting (§3 langkah 2).
9. **Mount per-file mengikat inode.** Sunting conf vhost _in-place_ (`cp`,
   `cat >`, nano); `sed -i`/vim/`mv` membuat container tetap melihat isi lama
   sampai di-restart — reload saja tak cukup (§3 langkah 4).

## 6. Riwayat insiden

**1 Juli 2026** — instalasi app WhatsApp (ketiga) menyebabkan
`survei.risetcenter.com` menyajikan aplikasi lama (`survey-populicenter`)
alih-alih `survei_frontend`. Akar masalah: vhost `survei.risetcenter.com.conf`
ternyata **tidak pernah didaftarkan secara persisten** di
`docker-compose.yml`/`docker-compose.override.yml` — kemungkinan sebelumnya
sempat ditambal manual ke container yang berjalan (tidak persisten) dan hilang
saat container di-_recreate_ untuk pasang app WA. Diperbaiki dengan membuat
`survei.risetcenter.com.conf` (mandiri, proxy ke `survei_frontend:80`) dan
mendaftarkannya via `docker-compose.override.yml` (lihat §3 sbg SOP ke depan).

## 7. IP klien asli: real_ip Cloudflare di edge, lalu `TRUST_PROXY_HOPS`

Rantai: Cloudflare → edge nginx → nginx `survei_frontend` → backend. Backend
membaca IP **hanya** dari `req.ip` (Express `trust proxy` = `TRUST_PROXY_HOPS`,
lihat `backend/src/main.ts`); `X-Forwarded-For` paling kiri tidak lagi dipakai
karena bisa dipalsukan klien. Tanpa langkah di bawah, `req.ip` = IP container
edge untuk **semua** pengunjung, sehingga rate-limit login/OTP (5/menit) menjadi
kuota bersama seluruh situs. **Kerjakan berurutan.**

**Langkah 0 — cek baca-saja (kondisi awal).**

```bash
grep -E '^(TRUST_PROXY_HOPS|IAK_CALLBACK_IPS)=' /var/www/online-survei/backend/.env
docker exec survey-populicenter-nginx-1 nginx -T 2>/dev/null | grep -nE 'real_ip_header|set_real_ip_from'
```

Bila `IAK_CALLBACK_IPS` **terisi**: sejak rilis ini allowlist membaca `req.ip`,
jadi dengan hops=1 semua callback IAK ditolak 403 (IP yang terlihat = container
edge). Kosongkan dulu (signature md5 tetap memverifikasi callback) dan isi lagi
setelah langkah 4 lulus.

**Langkah 1 — real_ip di vhost survei pada edge** (aman dikerjakan kapan saja;
tidak mengubah apa pun selama hops masih 1). Buat daftar rentang resmi
Cloudflare:

```bash
{ echo "    # real_ip Cloudflare — dibuat $(date -I) dari https://www.cloudflare.com/ips/"
  for c in $(curl -fsS https://www.cloudflare.com/ips-v4) $(curl -fsS https://www.cloudflare.com/ips-v6); do
    echo "    set_real_ip_from $c;"
  done
  echo "    real_ip_header CF-Connecting-IP;"
} > /tmp/cf-realip.txt
wc -l /tmp/cf-realip.txt   # puluhan baris; kosong = curl gagal, JANGAN lanjut
```

Cadangkan `survei.populicenter.com.conf` di `/var/www/survey-populicenter/`,
lalu tempel isi `/tmp/cf-realip.txt` di dalam blok `server { }` vhost itu (di
bawah `server_name`). Sunting **in-place** dengan nano (gotcha #9: jangan
`sed -i`/`mv`). Lalu:

```bash
docker exec survey-populicenter-nginx-1 nginx -t && docker exec survey-populicenter-nginx-1 nginx -s reload
docker exec survey-populicenter-nginx-1 nginx -T 2>/dev/null | grep -c set_real_ip_from   # > 0
```

`set_real_ip_from` **hanya** rentang Cloudflare (jangan `0.0.0.0/0`): koneksi
langsung ke origin dari IP lain tetap tercatat dengan IP aslinya, sehingga hops=2
aman walau origin belum dikunci. Rentang Cloudflare jarang berubah; ulangi
langkah ini bila Cloudflare mengumumkan perubahan.

**Langkah 2 (opsional, disarankan) — kunci origin ke Cloudflare.** Port Docker
melewati UFW, jadi pakai chain `DOCKER-USER`. **Hanya** bila SEMUA domain di VPS
ini ber-proxy Cloudflare (awan oranye) dan SSL mode Full (strict); domain yang
DNS-only akan langsung tidak bisa diakses. Contoh IPv4 (`eth0` = interface
publik, sesuaikan; IPv6 serupa dengan `ip6tables` bila Docker memakai IPv6):

```bash
sudo iptables -N CF-ONLY 2>/dev/null || sudo iptables -F CF-ONLY
for c in $(curl -fsS https://www.cloudflare.com/ips-v4); do sudo iptables -A CF-ONLY -s "$c" -j RETURN; done
sudo iptables -A CF-ONLY -j DROP
for p in 80 443; do
  sudo iptables -I DOCKER-USER -i eth0 -p tcp -m conntrack --ctorigdstport "$p" --ctdir ORIGINAL -j CF-ONLY
done
```

Aturan iptables hilang saat reboot; simpan (mis. `iptables-persistent`) setelah
terbukti benar. Cabut: hapus dua aturan `DOCKER-USER` di atas (`-D` dengan
argumen yang sama).

**Langkah 3 — baru setelah langkah 1 lulus: `TRUST_PROXY_HOPS=2`.**

```bash
cd /var/www/online-survei
nano backend/.env            # TRUST_PROXY_HOPS=2   (jangan 3)
docker compose up -d --no-deps --no-build backend
```

Hops=2 **tanpa** langkah 1 = `req.ip` menjadi IP server Cloudflare (kuota
bersama per PoP, audit tak bermakna). Hops=3 = IP bisa dipalsukan. Rollback:
kembalikan ke 1 dan ulangi perintah `up`.

**Langkah 4 — verifikasi baca-saja.** Dari HP (data seluler, bukan Wi-Fi
kantor), buka `https://survei.populicenter.com/cdn-cgi/trace` dan catat baris
`ip=`. Login sekali dari HP itu, lalu:

```bash
docker exec survei_postgres psql -U postgres -d survei_online -c \
  "SELECT ip_address, created_at FROM audit_log WHERE action_type = 'login' ORDER BY created_at DESC LIMIT 3;"
```

`ip_address` teratas harus sama dengan `ip=` tadi. Bila berisi IP privat
(`172.x`, `10.x`, `192.168.x`) → langkah 1 belum termuat atau hops masih 1; bila
IP milik Cloudflare → hops=2 tetapi real_ip belum aktif (kembali ke hops=1 dulu).
Setelah lulus, isi kembali `IAK_CALLBACK_IPS` (langkah 0) bila dipakai.

Rate-limit kini disimpan di Redis (lintas replika; fallback in-memory bila Redis
mati). Tambahkan juga rate limiting Cloudflare (WAF) untuk `/api/*` sebagai
lapisan luar.

# Populi Center - Survei Online

Sistem survei online berbasis web dengan pendaftaran mandiri, notifikasi email, dashboard admin, survey builder, manajemen data, dan reward poin.

## Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| Backend | Node.js + NestJS (TypeScript) |
| Frontend | React + Vite (TypeScript) |
| Database | PostgreSQL |
| Cache & Queue | Redis + BullMQ |
| File Storage | MinIO (S3-compatible) |
| Containerization | Docker Compose |

---

## Prasyarat

- **Node.js** v18+ (disarankan v20+)
- **Docker Desktop** (untuk PostgreSQL, Redis, MinIO)
- **npm** (sudah termasuk dengan Node.js)

---

## Cara Menjalankan

### 1. Stop PostgreSQL Lokal (jika ada)

Jika Anda memiliki PostgreSQL yang terinstall secara lokal, stop service-nya terlebih dahulu agar tidak konflik port 5432:

```bash
# Windows (buka CMD/PowerShell sebagai Administrator)
net stop postgresql-x64-18
# Sesuaikan versi: postgresql-x64-17, postgresql-x64-16, dll.
```

### 2. Jalankan Docker Containers

```bash
docker compose up -d
```

Ini akan menjalankan:
- **PostgreSQL** (port 5432) - Database utama
- **Redis** (port 6379) - Cache & job queue
- **MinIO** (port 9000/9001) - Object storage untuk file export

### 3. Install Dependencies

```bash
# Install semua dependencies (root + backend + frontend)
npm install
```

### 4. Setup Database

```bash
cd backend
node scripts/setup-db.js
```

### 5. Seed Data (Buat User Default)

```bash
cd backend
node scripts/seed-admin.js
```

### 6. Jalankan Backend

```bash
cd backend
npm run dev
```

Backend akan berjalan di **http://localhost:3000**

### 7. Jalankan Frontend (terminal baru)

```bash
cd frontend
npm run dev
```

Frontend akan berjalan di **http://localhost:5173**

### 8. Buka Browser

Akses **http://localhost:5173** dan login dengan akun default.

---

## Akun Default

| Role | Email | Password |
|------|-------|----------|
| **Super Admin** | superadmin@survei.com | SuperAdmin123! |
| **Admin** | admin@survei.com | Admin123! |
| **Responden** | responden@survei.com | Responden123! |

### Hak Akses Per Role

| Fitur | Super Admin | Admin | Analyst | Viewer | Responden |
|-------|:-----------:|:-----:|:-------:|:------:|:---------:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ❌ |
| Buat/Edit Survei | ✅ | ✅ | ❌ | ❌ | ❌ |
| Lihat Respons | ✅ | ✅ | ✅ | ✅ | ❌ |
| Export Data | ✅ | ✅ | ✅ | ❌ | ❌ |
| Audit Log | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manajemen User | ✅ | ❌ | ❌ | ❌ | ❌ |
| Data Cleanup | ✅ | ✅ | ❌ | ❌ | ❌ |
| Isi Survei | ❌ | ❌ | ❌ | ❌ | ✅ |
| Reward Poin | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## Perintah Berguna

### Backend

```bash
cd backend

# Development (watch mode)
npm run dev

# Build production
npm run build

# Run tests
npm run test

# Run tests with coverage
npm run test:coverage
```

### Frontend

```bash
cd frontend

# Development
npm run dev

# Build production
npm run build

# Preview production build
npm run preview

# Run tests
npm run test
```

### Docker

```bash
# Start semua containers
docker compose up -d

# Stop semua containers
docker compose down

# Lihat logs
docker compose logs -f

# Lihat status containers
docker compose ps

# Reset database (hapus volume)
docker compose down -v
docker compose up -d
cd backend && node scripts/setup-db.js && node scripts/seed-admin.js
```

---

## Struktur Proyek

```
survei-web-online/
├── backend/                 # NestJS API Server
│   ├── src/
│   │   ├── config/          # Database, Redis, Bull config
│   │   ├── modules/         # Feature modules
│   │   │   ├── auth/        # Autentikasi & JWT
│   │   │   ├── registration/# Registrasi & OTP
│   │   │   ├── survey/      # Survey Builder
│   │   │   ├── response/    # Response Manager
│   │   │   ├── reward/      # Reward Engine
│   │   │   ├── notification/# Email Notifications
│   │   │   ├── geolocation/ # Geolocation Service
│   │   │   ├── export/      # Data Export
│   │   │   ├── dashboard/   # Dashboard Analytics
│   │   │   ├── audit/       # Audit Logger
│   │   │   ├── user-manager/# User Management
│   │   │   ├── data-cleanup/# Data Cleanup & GDPR
│   │   │   └── events/      # Event Bus
│   │   └── shared/          # Shared utilities
│   ├── scripts/             # Setup & seed scripts
│   └── .env                 # Environment variables
├── frontend/                # React SPA
│   ├── src/
│   │   ├── components/      # Reusable components
│   │   ├── pages/           # Page components
│   │   ├── router/          # React Router config
│   │   ├── services/        # API client
│   │   ├── stores/          # Zustand state
│   │   └── types/           # TypeScript types
│   └── public/              # Static assets & logo
├── docker/                  # Docker configs
│   ├── nginx/               # Nginx config
│   └── postgres/            # PostgreSQL init
├── docker-compose.yml       # Docker services
└── README.md                # Dokumentasi ini
```

---

## Environment Variables

File `.env` di folder `backend/`:

```env
# Application
NODE_ENV=development
PORT=3000

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=survei_online
DB_SYNCHRONIZE=true

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

---

## Troubleshooting

### Port 5432 sudah digunakan
Stop PostgreSQL lokal: `net stop postgresql-x64-18` (sebagai Administrator)

### Cannot POST /api/...
Pastikan backend berjalan di port 3000 dan Vite proxy sudah dikonfigurasi dengan benar.

### Database connection error
Pastikan Docker container PostgreSQL sudah running: `docker compose ps`

---

## Lisensi

Private - Populi Center

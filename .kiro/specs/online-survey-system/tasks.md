# Rencana Implementasi: Sistem Survei Online

## Ringkasan

Implementasi Sistem Survei Online full-stack menggunakan Node.js/NestJS (backend), React + TypeScript (frontend), PostgreSQL (database), Redis (cache/queue), dan BullMQ (job queue). Implementasi mengikuti arsitektur modular monolith dengan 12 modul aplikasi. Testing menggunakan Vitest + fast-check untuk property-based testing.

## Tasks

- [x] 1. Setup proyek dan infrastruktur dasar
  - [x] 1.1 Inisialisasi monorepo dan konfigurasi proyek
    - Buat struktur monorepo dengan workspace (backend + frontend)
    - Setup NestJS project dengan TypeScript strict mode
    - Setup React project dengan Vite + TypeScript
    - Konfigurasi ESLint, Prettier, dan path aliases
    - Setup Vitest untuk unit testing dan property-based testing
    - Tambahkan fast-check sebagai dependency untuk PBT
    - _Requirements: Semua (infrastruktur dasar)_

  - [x] 1.2 Konfigurasi database dan ORM
    - Setup PostgreSQL connection dengan TypeORM/Prisma
    - Konfigurasi connection pooling dan environment variables
    - Setup migration framework
    - Konfigurasi Redis connection untuk cache dan session
    - _Requirements: Semua (data layer)_

  - [x] 1.3 Setup Docker Compose untuk development
    - Buat docker-compose.yml dengan PostgreSQL, Redis, MinIO (S3-compatible)
    - Konfigurasi volume persistence dan networking
    - Tambahkan health checks untuk semua services
    - _Requirements: Semua (development environment)_

  - [x] 1.4 Implementasi shared modules dan utilities
    - Buat error response format standar (ErrorResponse interface)
    - Implementasi base repository pattern
    - Setup logging framework (structured JSON logs)
    - Implementasi pagination helper dan response wrapper
    - Buat shared TypeScript interfaces dan enums (UserRole, AuditActionType, dll)
    - _Requirements: Semua (shared infrastructure)_

- [x] 2. Skema database dan migrasi
  - [x] 2.1 Buat migrasi untuk entitas User dan Profile
    - Buat tabel `users` dengan kolom: id, email, phone, password_hash, full_name, role, status, email_verified, profile_completed, created_at, updated_at
    - Buat tabel `user_profile` dengan kolom: id, user_id, age, gender, occupation, city, province, created_at, updated_at
    - Tambahkan UNIQUE constraint pada email dan phone
    - Tambahkan index untuk query performa
    - _Requirements: 1.3, 1.4, 2.1_

  - [x] 2.2 Buat migrasi untuk entitas Geolocation
    - Buat tabel `geolocation` dengan kolom: id, user_id, encrypted_latitude, encrypted_longitude, city, province, captured_at
    - Kolom latitude/longitude menggunakan tipe bytea untuk enkripsi AES-256
    - Setup pgcrypto extension
    - _Requirements: 17.1, 17.3_

  - [x] 2.3 Buat migrasi untuk entitas Survey dan komponen terkait
    - Buat tabel `survey` dengan semua kolom sesuai ER diagram
    - Buat tabel `survey_page` untuk halaman survei
    - Buat tabel `question` dengan tipe JSONB untuk validation_rules
    - Buat tabel `question_option` untuk opsi jawaban
    - Buat tabel `skip_logic_rule`, `visibility_rule`, `branching_rule`
    - Buat tabel `survey_time_config` dan `survey_reward_config`
    - _Requirements: 6.1, 6.2, 6.5, 6.7, 6.8, 6.9, 18.1, 18.2_

  - [x] 2.4 Buat migrasi untuk entitas Response dan Answer
    - Buat tabel `survey_response` dengan kolom sesuai ER diagram
    - Buat tabel `answer` dengan JSONB value
    - Tambahkan UNIQUE constraint `uq_one_response_per_survey` pada (survey_id, respondent_id)
    - Tambahkan index pada survey_id, status, dan submitted_at
    - _Requirements: 7.1, 7.2, 8.1_

  - [x] 2.5 Buat migrasi untuk entitas Reward dan Redemption
    - Buat tabel `point_transaction` dengan kolom: id, user_id, amount, transaction_type, reason, reference_id, earned_at, expires_at, expired
    - Buat tabel `reward_redemption` dengan kolom sesuai ER diagram
    - Buat tabel `streak_tracker` untuk tracking streak harian
    - Buat tabel `manual_reward_distribution`
    - Tambahkan index pada user_id dan expires_at
    - _Requirements: 13.1-13.8, 14.1-14.4, 15.1-15.7, 16.1-16.10_

  - [x] 2.6 Buat migrasi untuk entitas Audit, Export, dan Cleanup
    - Buat tabel `audit_log` dengan kolom sesuai ER diagram
    - Buat tabel `export_job` untuk tracking export async
    - Buat tabel `otp_verification` untuk OTP management
    - Buat tabel `scheduled_purge_config`
    - Tambahkan index pada audit_log(created_at) dan audit_log(user_id, action_type)
    - _Requirements: 10.1-10.5, 9.1-9.6, 12.1-12.9_

- [x] 3. Modul Autentikasi (Auth Module)
  - [x] 3.1 Implementasi service autentikasi
    - Implementasi `login()` dengan validasi kredensial dan pembuatan JWT token pair (access + refresh)
    - Implementasi `logout()` dengan invalidasi session di Redis
    - Implementasi `refreshToken()` untuk token rotation
    - Implementasi `validateSession()` untuk middleware guard
    - Implementasi pesan error generik (tidak mengungkapkan field mana yang salah)
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 3.2 Implementasi password reset flow
    - Implementasi `requestPasswordReset()` yang mengirim link reset via email
    - Implementasi `resetPassword()` dengan validasi token dan update password
    - Token reset berlaku 1 jam
    - _Requirements: 3.4_

  - [x] 3.3 Implementasi RBAC guards dan decorators
    - Buat `@Roles()` decorator untuk NestJS
    - Implementasi `RolesGuard` yang memeriksa role user terhadap permission yang diperlukan
    - Definisikan permission matrix: Super_Admin/Admin → CRUD survei; Super_Admin/Admin/Analyst → export; Super_Admin/Admin → cleanup; Analyst/Viewer → read-only dashboard
    - _Requirements: 5.10, 11.5, 11.6, 11.7_

  - [ ]* 3.4 Property test untuk Authentication Security (Property 5)
    - **Property 5: Authentication Security**
    - Untuk setiap login attempt, jika kredensial cocok maka session dibuat; jika tidak cocok, error message yang sama dikembalikan terlepas dari field mana yang salah
    - **Validates: Requirements 3.2, 3.3**

  - [ ]* 3.5 Property test untuk RBAC Enforcement (Property 6)
    - **Property 6: RBAC Enforcement**
    - Untuk setiap user dengan role tertentu dan operasi sistem, operasi diizinkan jika dan hanya jika role memiliki permission yang diperlukan
    - **Validates: Requirements 5.10, 11.5, 11.6, 11.7**

  - [ ]* 3.6 Property test untuk Deactivated Account Login Rejection (Property 33)
    - **Property 33: Deactivated Account Login Rejection**
    - Untuk setiap akun dengan status 'deactivated', login attempt dengan kredensial benar HARUS ditolak
    - **Validates: Requirements 11.4**

- [x] 4. Checkpoint - Pastikan semua test lulus
  - Pastikan semua test lulus, tanyakan ke user jika ada pertanyaan.

- [x] 5. Modul Registrasi (Registration Module)
  - [x] 5.1 Implementasi registration service
    - Implementasi `register()` dengan validasi: email unik, phone unik, password strength (min 8 char, 1 uppercase, 1 digit)
    - Implementasi `sendOtp()` yang generate kode 6 digit dan simpan di Redis dengan TTL 15 menit
    - Implementasi `verifyOtp()` dengan validasi kode dan expiry
    - Implementasi `resendOtp()` dengan limit 3x per registrasi
    - Implementasi `completeProfile()` yang mengaktifkan akun
    - _Requirements: 1.1-1.11, 2.1-2.4_

  - [x] 5.2 Implementasi validasi password dan input
    - Buat fungsi validasi password (min 8 char, 1 uppercase, 1 digit)
    - Buat validasi format email
    - Buat validasi format nomor HP Indonesia
    - Buat validasi field profil (age, gender, occupation, city, province)
    - _Requirements: 1.2, 6.6_

  - [ ]* 5.3 Property test untuk Registration Uniqueness (Property 1)
    - **Property 1: Registration Uniqueness**
    - Untuk dua registrasi dengan email/phone yang sama, sistem HARUS menolak yang kedua
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6**

  - [ ]* 5.4 Property test untuk Password Validation (Property 2)
    - **Property 2: Password Validation**
    - Untuk setiap string, fungsi validasi password menerima jika dan hanya jika mengandung min 8 char, 1 uppercase, 1 digit
    - **Validates: Requirements 1.2**

  - [ ]* 5.5 Property test untuk OTP Round-Trip Verification (Property 3)
    - **Property 3: OTP Round-Trip Verification**
    - OTP yang benar dalam 15 menit HARUS berhasil; kode berbeda atau setelah 15 menit HARUS gagal
    - **Validates: Requirements 1.7, 1.8, 1.10, 1.11**

  - [ ]* 5.6 Property test untuk Profile Completion Activates Account (Property 4)
    - **Property 4: Profile Completion Activates Account**
    - Profil valid setelah verifikasi email HARUS mengaktifkan akun
    - **Validates: Requirements 2.4**

- [x] 6. Modul Survey Builder
  - [x] 6.1 Implementasi CRUD survei
    - Implementasi `createSurvey()` dengan konfigurasi waktu, reward mode, dan max respondents
    - Implementasi `updateSurvey()`, `duplicateSurvey()`, `deactivateSurvey()`, `deleteSurvey()`, `archiveSurvey()`
    - Validasi bahwa hanya Admin/Super_Admin yang dapat melakukan operasi ini
    - _Requirements: 6.1, 6.2, 16.1, 16.2_

  - [x] 6.2 Implementasi manajemen pertanyaan
    - Implementasi `addQuestion()` dengan support untuk semua 10 tipe pertanyaan
    - Implementasi `updateQuestion()`, `deleteQuestion()`, `reorderQuestions()`
    - Implementasi validasi rules (required, min/max length, email format, phone format, numeric range, regex, max checkbox)
    - Implementasi opsi "Lainnya" (has_other_option)
    - _Requirements: 6.5, 6.6, 6.11_

  - [x] 6.3 Implementasi logika kondisional survei
    - Implementasi skip logic evaluator berdasarkan jawaban sebelumnya
    - Implementasi conditional visibility (show/hide) evaluator
    - Implementasi page branching evaluator
    - Buat engine evaluasi kondisi yang mendukung operator: equals, not_equals, contains, greater_than, less_than
    - _Requirements: 6.7, 6.8, 6.9_

  - [x] 6.4 Implementasi randomisasi opsi dan konfigurasi waktu
    - Implementasi Fisher-Yates shuffle untuk randomisasi opsi jawaban
    - Implementasi survey time config (start/end datetime, max duration, max respondents)
    - _Requirements: 6.10, 6.3, 6.4, 18.1-18.4_

  - [ ]* 6.5 Property test untuk Survey CRUD Round-Trip (Property 7)
    - **Property 7: Survey CRUD Round-Trip**
    - Membuat survei lalu membaca kembali HARUS mengembalikan data yang ekuivalen
    - **Validates: Requirements 6.1**

  - [ ]* 6.6 Property test untuk Conditional Logic Evaluation (Property 8)
    - **Property 8: Conditional Logic Evaluation**
    - Evaluator logika kondisional HARUS menentukan pertanyaan mana yang di-skip/show/hide berdasarkan rules dan jawaban
    - **Validates: Requirements 6.7, 6.8, 6.9**

  - [ ]* 6.7 Property test untuk Option Randomization Preserves Set (Property 9)
    - **Property 9: Option Randomization Preserves Set**
    - Randomisasi HARUS menghasilkan set opsi yang sama (elemen sama, urutan mungkin berbeda)
    - **Validates: Requirements 6.10**

  - [ ]* 6.8 Property test untuk Survey Time Access Control (Property 10)
    - **Property 10: Survey Time Access Control**
    - Akses ditolak sebelum start_datetime; submission ditolak setelah end_datetime
    - **Validates: Requirements 18.1, 18.2**

  - [ ]* 6.9 Property test untuk Respondent Cap Enforcement (Property 11)
    - **Property 11: Respondent Cap Enforcement**
    - Setelah N respons lengkap, semua submission berikutnya HARUS ditolak
    - **Validates: Requirements 6.4, 18.4**

  - [ ]* 6.10 Property test untuk Field Validation Rules (Property 31)
    - **Property 31: Field Validation Rules**
    - Fungsi validasi HARUS mengembalikan valid jika dan hanya jika input memenuhi kriteria rule
    - **Validates: Requirements 6.6**

- [x] 7. Checkpoint - Pastikan semua test lulus
  - Pastikan semua test lulus, tanyakan ke user jika ada pertanyaan.

- [x] 8. Modul Response Manager
  - [x] 8.1 Implementasi submission dan penyimpanan respons
    - Implementasi `submitResponse()` dengan enforce one-response-per-survey (unique constraint)
    - Implementasi `saveProgress()` untuk auto-save respons yang sedang berlangsung
    - Implementasi resume in-progress response (kembalikan respons existing jika ada)
    - Implementasi validasi timer (reject jika melebihi max_duration)
    - Trigger event untuk reward crediting setelah submission complete
    - _Requirements: 7.1, 7.2, 7.3, 18.3_

  - [x] 8.2 Implementasi filter dan query respons
    - Implementasi `getResponses()` dengan filter: dateRange, region, profileAttributes, completionStatus, deviceType, tags
    - Implementasi pagination untuk hasil filter
    - Pastikan semua filter diterapkan secara AND (semua kriteria harus cocok)
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 8.3 Implementasi panel distribusi reward manual
    - Implementasi `getManualRewardRecipients()` yang hanya mengembalikan responden dengan status 'complete'
    - Implementasi `markRewardDistributed()` untuk update status individual dan bulk
    - Catat timestamp distribusi dan admin yang bertindak
    - _Requirements: 16.5, 16.6, 16.7, 16.8, 16.9, 16.10_

  - [ ]* 8.4 Property test untuk One Response Per Survey (Property 12)
    - **Property 12: One Response Per Survey**
    - Responden yang sudah submit HARUS ditolak untuk submission berikutnya ke survei yang sama
    - **Validates: Requirements 7.1, 7.2**

  - [ ]* 8.5 Property test untuk Resume In-Progress Response (Property 13)
    - **Property 13: Resume In-Progress Response**
    - Responden dengan respons in-progress HARUS mendapat respons existing, bukan yang baru
    - **Validates: Requirements 7.3**

  - [ ]* 8.6 Property test untuk Response Filter Correctness (Property 14)
    - **Property 14: Response Filter Correctness**
    - Setiap respons yang dikembalikan HARUS memenuhi SEMUA kriteria filter yang ditentukan
    - **Validates: Requirements 8.2, 8.3**

  - [ ]* 8.7 Property test untuk Manual Reward Recipient Filter (Property 30)
    - **Property 30: Manual Reward Recipient Filter**
    - Daftar penerima reward manual HANYA berisi responden dengan status 'complete'
    - **Validates: Requirements 16.10**

- [x] 9. Modul Reward Engine
  - [x] 9.1 Implementasi point crediting
    - Implementasi `creditPoints()` untuk berbagai alasan: registration (500), profile_completion (250), survey_completion (1000-15000), streak_bonus, manual_credit
    - Implementasi validasi bahwa poin hanya diberikan untuk respons complete
    - Implementasi streak tracking dan multiplier calculation (1.5x untuk 7 hari, 2.0x untuk 30 hari)
    - Set expires_at = earned_at + 12 bulan untuk setiap transaksi
    - _Requirements: 13.1-13.8_

  - [x] 9.2 Implementasi balance management dan expiration
    - Implementasi `getBalance()` yang menghitung total, available, pending, dan expiringWithin30Days
    - Implementasi `processExpiredPoints()` sebagai scheduled job (cron) yang menandai poin expired
    - Implementasi `getTransactionHistory()` dengan pagination
    - Enforce non-transferable rule (tidak ada endpoint transfer antar akun)
    - _Requirements: 14.1-14.4_

  - [x] 9.3 Implementasi redemption flow
    - Implementasi `getRewardCatalog()` dengan kategori: pulsa, paket data, voucher, e-wallet
    - Implementasi `initiateRedemption()` dengan validasi threshold (min 10.000 poin) dan saldo cukup
    - Implementasi `confirmRedemption()` dengan OTP verification
    - Deduct poin dari saldo setelah konfirmasi berhasil
    - Trigger notifikasi email setelah redemption berhasil
    - _Requirements: 15.1-15.7_

  - [ ]* 9.4 Property test untuk Point Crediting for Survey Completion (Property 20)
    - **Property 20: Point Crediting for Survey Completion**
    - Menyelesaikan survei HARUS mengkreditkan tepat sejumlah poin yang dikonfigurasi
    - **Validates: Requirements 13.3, 13.4**

  - [ ]* 9.5 Property test untuk Streak Multiplier Calculation (Property 21)
    - **Property 21: Streak Multiplier Calculation**
    - Multiplier 1.5x jika streak >= 7 hari, 2.0x jika >= 30 hari, 1.0x jika < 7 hari
    - **Validates: Requirements 13.5, 13.6**

  - [ ]* 9.6 Property test untuk Points Only for Complete Responses (Property 22)
    - **Property 22: Points Only for Complete Responses**
    - Respons yang tidak complete HARUS TIDAK mendapat poin
    - **Validates: Requirements 13.7**

  - [ ]* 9.7 Property test untuk Point Expiration (Property 23)
    - **Property 23: Point Expiration**
    - Poin yang belum ditukar setelah 12 bulan HARUS ditandai expired
    - **Validates: Requirements 14.1**

  - [ ]* 9.8 Property test untuk Points Non-Transferable (Property 24)
    - **Property 24: Points Non-Transferable**
    - Transfer poin antar akun HARUS ditolak dan kedua saldo tidak berubah
    - **Validates: Requirements 14.2**

  - [ ]* 9.9 Property test untuk Redemption Threshold Enforcement (Property 25)
    - **Property 25: Redemption Threshold Enforcement**
    - Redemption dengan saldo < 10.000 atau < jumlah reward HARUS ditolak
    - **Validates: Requirements 14.4, 15.5**

  - [ ]* 9.10 Property test untuk Redemption Balance Deduction (Property 26)
    - **Property 26: Redemption Balance Deduction**
    - Redemption berhasil HARUS mengurangi saldo tepat sebesar P poin (balance_before - P = balance_after)
    - **Validates: Requirements 15.4**

- [x] 10. Checkpoint - Pastikan semua test lulus
  - Pastikan semua test lulus, tanyakan ke user jika ada pertanyaan.

- [x] 11. Modul Notifikasi (Notification Service)
  - [x] 11.1 Implementasi email service dengan BullMQ
    - Setup BullMQ queue untuk pengiriman email asinkron
    - Implementasi email templates: survey invitation, reminder (H-3, H-1), submission confirmation, points threshold, redemption confirmation, OTP, password reset
    - Implementasi `sendSurveyInvitation()` yang mengirim ke semua responden eligible
    - Implementasi `sendReminder()` untuk H-3 dan H-1 sebelum deadline
    - Implementasi retry logic dengan exponential backoff
    - _Requirements: 4.1-4.6_

  - [x] 11.2 Implementasi scheduled notification jobs
    - Buat cron job untuk mengirim reminder H-3 dan H-1 otomatis
    - Implementasi filter responden yang belum mengisi survei
    - Implementasi circuit breaker untuk email service
    - _Requirements: 4.2, 4.3_

- [x] 12. Modul Geolokasi (Geolocation Service)
  - [x] 12.1 Implementasi geolocation capture dan reverse geocoding
    - Implementasi `captureLocation()` yang menerima koordinat GPS
    - Implementasi `reverseGeocode()` menggunakan Nominatim/Google Maps API
    - Implementasi enkripsi AES-256 untuk latitude/longitude sebelum penyimpanan
    - Implementasi fallback ke manual input jika geocoding gagal atau izin ditolak
    - _Requirements: 17.1, 17.2, 17.3_

  - [x] 12.2 Implementasi heatmap data dan privacy controls
    - Implementasi `getHeatmapData()` yang mengembalikan data agregat (city/province level)
    - Pastikan raw GPS coordinates TIDAK pernah dikembalikan di API response ke user lain
    - Implementasi filter geolokasi untuk response queries
    - _Requirements: 17.4, 17.5_

  - [ ]* 12.3 Property test untuk Geolocation Encryption (Property 28)
    - **Property 28: Geolocation Encryption**
    - Nilai latitude/longitude di database HARUS terenkripsi (tidak readable sebagai plain-text)
    - **Validates: Requirements 17.3**

  - [ ]* 12.4 Property test untuk GPS Coordinates Privacy (Property 29)
    - **Property 29: GPS Coordinates Privacy**
    - API response ke user selain pemilik data HARUS TIDAK mengandung raw GPS coordinates
    - **Validates: Requirements 17.5**

- [x] 13. Modul Export
  - [x] 13.1 Implementasi export service dengan BullMQ
    - Implementasi `exportCsv()` yang generate file CSV dengan data respons mentah
    - Implementasi `exportExcel()` dengan data respons dan statistik ringkasan
    - Implementasi `exportPdf()` dengan laporan visual (chart)
    - Implementasi `exportJson()` dengan data respons terstruktur
    - Semua export dijalankan sebagai background job via BullMQ
    - _Requirements: 9.1-9.4_

  - [x] 13.2 Implementasi filter application dan export marking
    - Implementasi penerapan filter aktif pada dataset export
    - Implementasi marking respons dengan export timestamp setelah export selesai
    - Implementasi `getExportStatus()` dan `downloadExport()` untuk tracking dan download
    - Upload file export ke S3/MinIO
    - _Requirements: 9.5, 9.6_

  - [x] 13.3 Implementasi export audit log dan manual reward data
    - Implementasi `exportAuditLog()` dalam format CSV
    - Implementasi `extractManualRewardData()` yang mencakup nama, nomor tujuan, status pengisian
    - _Requirements: 10.4, 16.5_

  - [ ]* 13.4 Property test untuk Export Filter Application (Property 15)
    - **Property 15: Export Filter Application**
    - Dataset export HANYA berisi respons yang cocok dengan semua filter criteria
    - **Validates: Requirements 9.5**

  - [ ]* 13.5 Property test untuk Export Marks Responses (Property 16)
    - **Property 16: Export Marks Responses**
    - Semua respons dalam export HARUS ditandai dengan export timestamp
    - **Validates: Requirements 9.6**

- [x] 14. Modul Dashboard Service
  - [x] 14.1 Implementasi agregasi metrik dan chart data
    - Implementasi `getOverviewMetrics()`: registrasi 24h, total responden, survei aktif, total respons
    - Implementasi `getRegistrationChart()` untuk bar chart registrasi harian
    - Implementasi `getCumulativeTrendChart()` untuk line chart tren kumulatif
    - Implementasi `getDistributionCharts()` untuk pie/donut chart (wilayah, usia, pekerjaan)
    - Implementasi `getSurveyCompletionRates()` untuk tingkat penyelesaian per survei
    - _Requirements: 5.1-5.9_

  - [x] 14.2 Implementasi heatmap dan caching
    - Implementasi `getHeatmapData()` untuk distribusi geografis
    - Setup Redis caching untuk dashboard queries (TTL 5 menit)
    - Implementasi materialized view atau cache invalidation strategy
    - Enforce read-only mode untuk role Analyst dan Viewer
    - _Requirements: 5.8, 5.10_

- [x] 15. Modul Audit Logger
  - [x] 15.1 Implementasi audit logging service
    - Implementasi `log()` yang mencatat event dengan semua field wajib: user_id, action_type, timestamp, module, ip_address
    - Implementasi event listener/interceptor NestJS untuk auto-logging
    - Implementasi `query()` dengan filter: user, action_type, date range, module, IP
    - Implementasi retensi minimal 12 bulan
    - _Requirements: 10.1-10.5_

  - [ ]* 15.2 Property test untuk Audit Entry Completeness (Property 27)
    - **Property 27: Audit Entry Completeness**
    - Setiap audit log entry HARUS mengandung semua field wajib tanpa null
    - **Validates: Requirements 10.2**

- [x] 16. Modul User Manager
  - [x] 16.1 Implementasi CRUD pengguna dan role management
    - Implementasi `createUser()`, `updateUserRole()`, `activateUser()`, `deactivateUser()`
    - Implementasi `resetUserPassword()` yang generate password baru
    - Implementasi `listUsers()` dengan filter dan pagination
    - Implementasi `getUserActivityHistory()` dari audit log
    - Hanya Super_Admin yang dapat melakukan operasi ini
    - _Requirements: 11.1, 11.2, 11.4_

  - [x] 16.2 Implementasi bulk import pengguna
    - Implementasi `bulkImportUsers()` yang parse CSV file
    - Validasi setiap row: nama, email, phone, role
    - Handle duplikat dan error per-row (partial success)
    - Return BulkImportResult dengan jumlah sukses/gagal dan detail error
    - _Requirements: 11.3_

  - [ ]* 16.3 Property test untuk Bulk User Import Round-Trip (Property 32)
    - **Property 32: Bulk User Import Round-Trip**
    - Import CSV valid HARUS membuat users dengan atribut yang cocok persis dengan data CSV
    - **Validates: Requirements 11.3**

- [x] 17. Modul Data Cleanup
  - [x] 17.1 Implementasi controlled deletion
    - Implementasi `requestDeletion()` dengan validasi: hanya respons yang sudah diexport yang boleh dihapus
    - Implementasi `confirmDeletion()` dengan double confirmation (two-step acknowledgment)
    - Implementasi `archiveSurvey()` untuk survei tidak aktif
    - Reject deletion jika data belum diexport (412 Precondition Failed)
    - _Requirements: 12.1-12.4, 12.7_

  - [x] 17.2 Implementasi GDPR compliance dan scheduled purge
    - Implementasi `deletePersonalData()` yang menghapus semua PII (nama, email, phone, lokasi) dengan approval Super_Admin
    - Implementasi `configureScheduledPurge()` dengan cron expression
    - Implementasi scheduled job yang menghapus data exported yang lebih lama dari retention period
    - Log semua operasi cleanup ke audit log
    - _Requirements: 12.5, 12.6, 12.8, 12.9_

  - [ ]* 17.3 Property test untuk Export-First Deletion Rule (Property 17)
    - **Property 17: Export-First Deletion Rule**
    - Deletion HANYA diizinkan untuk respons dengan export timestamp non-null
    - **Validates: Requirements 12.1, 12.2**

  - [ ]* 17.4 Property test untuk GDPR Data Deletion Completeness (Property 18)
    - **Property 18: GDPR Data Deletion Completeness**
    - Setelah deletion dieksekusi, TIDAK ADA PII yang tersisa terkait respondent target
    - **Validates: Requirements 12.5**

  - [ ]* 17.5 Property test untuk Scheduled Purge Logic (Property 19)
    - **Property 19: Scheduled Purge Logic**
    - Hanya respons yang sudah diexport DAN lebih lama dari retention period yang dihapus
    - **Validates: Requirements 12.9**

- [x] 18. Checkpoint - Pastikan semua test backend lulus
  - Pastikan semua test lulus, tanyakan ke user jika ada pertanyaan.

- [x] 19. Implementasi Frontend - Setup dan Layout
  - [x] 19.1 Setup React project structure
    - Konfigurasi routing (React Router) dengan protected routes
    - Setup state management (Zustand/Redux Toolkit)
    - Implementasi API client layer dengan axios/fetch dan interceptors untuk JWT
    - Buat layout components: AdminLayout, RespondentLayout, AuthLayout
    - Setup UI component library (Ant Design/MUI atau custom)
    - _Requirements: Semua (frontend infrastructure)_

  - [x] 19.2 Implementasi halaman autentikasi
    - Buat halaman Login dengan form email + password
    - Buat halaman Register dengan form multi-step (data dasar → OTP → profil)
    - Buat halaman Forgot Password dan Reset Password
    - Implementasi geolocation permission request dan auto-fill kota/provinsi
    - _Requirements: 1.1-1.11, 2.1-2.4, 3.1-3.4, 17.1, 17.2_

- [x] 20. Implementasi Frontend - Admin Dashboard
  - [x] 20.1 Implementasi dashboard admin
    - Buat overview cards (registrasi 24h, total responden, survei aktif, total respons)
    - Implementasi bar chart registrasi harian (Recharts)
    - Implementasi line chart tren kumulatif
    - Implementasi pie/donut chart distribusi (wilayah, usia, pekerjaan)
    - Implementasi heat map dengan Leaflet + heatmap plugin
    - Implementasi survey completion rates table
    - _Requirements: 5.1-5.10_

  - [x] 20.2 Implementasi survey builder UI
    - Buat form pembuatan survei (title, description, dates, reward mode, config)
    - Implementasi drag-and-drop question builder dengan semua 10 tipe pertanyaan
    - Implementasi UI untuk skip logic, conditional visibility, dan page branching rules
    - Implementasi preview mode survei
    - Implementasi duplikasi, deaktivasi, hapus, dan arsip survei
    - _Requirements: 6.1-6.11, 16.1-16.2_

  - [x] 20.3 Implementasi halaman manajemen respons
    - Buat tabel respons dengan filter panel (date range, region, profile, status, device, tags)
    - Implementasi detail view per respons
    - Implementasi panel "Distribusi Reward Manual" dengan bulk marking
    - Implementasi export buttons (CSV, Excel, PDF, JSON)
    - _Requirements: 8.1-8.3, 9.1-9.6, 16.5-16.9_

- [x] 21. Implementasi Frontend - Responden
  - [x] 21.1 Implementasi survey filling UI
    - Buat survey renderer yang mendukung semua 10 tipe pertanyaan
    - Implementasi multi-page navigation dengan progress indicator
    - Implementasi skip logic dan conditional visibility di frontend
    - Implementasi countdown timer untuk max duration
    - Implementasi auto-save progress
    - Implementasi randomisasi opsi jawaban
    - Tampilkan info reward yang dijanjikan untuk survei manual
    - _Requirements: 6.3, 6.5, 6.7-6.10, 7.3, 16.3, 16.4, 18.3_

  - [x] 21.2 Implementasi halaman reward responden
    - Buat halaman saldo poin dengan riwayat transaksi
    - Implementasi katalog reward dengan kategori
    - Implementasi flow penukaran: pilih reward → masukkan nomor tujuan → konfirmasi OTP
    - Tampilkan poin yang akan expired dalam 30 hari
    - _Requirements: 15.1-15.7_

- [x] 22. Implementasi Frontend - Admin Tools
  - [x] 22.1 Implementasi halaman user management
    - Buat tabel pengguna dengan filter dan pagination
    - Implementasi form tambah/edit user dan role assignment
    - Implementasi bulk import via CSV upload
    - Implementasi activate/deactivate toggle dan password reset
    - _Requirements: 11.1-11.7_

  - [x] 22.2 Implementasi halaman audit log
    - Buat tabel audit log dengan filter (user, action, date, module, IP)
    - Implementasi export audit log ke CSV
    - _Requirements: 10.1-10.5_

  - [x] 22.3 Implementasi halaman data cleanup
    - Buat UI untuk filter data yang dapat dihapus
    - Implementasi double confirmation dialog
    - Implementasi scheduled purge configuration UI
    - Implementasi GDPR deletion request flow
    - _Requirements: 12.1-12.9_

- [x] 23. Checkpoint - Pastikan semua test lulus
  - Pastikan semua test lulus, tanyakan ke user jika ada pertanyaan.

- [x] 24. Integrasi dan wiring komponen
  - [x] 24.1 Integrasi event-driven architecture
    - Wire semua modul ke event bus untuk audit logging otomatis
    - Wire Response Manager → Reward Engine untuk auto-credit poin setelah submission
    - Wire Reward Engine → Notification Service untuk threshold notification
    - Wire Survey activation → Notification Service untuk invitation emails
    - Wire scheduled jobs: point expiration, reminder emails, scheduled purge
    - _Requirements: 4.1-4.6, 10.1, 13.1-13.7, 14.1_

  - [x] 24.2 Implementasi circuit breaker dan error handling
    - Implementasi circuit breaker untuk external services (email, geocoding, reward fulfillment)
    - Konfigurasi: failureThreshold=5, successThreshold=3, timeout=30s
    - Implementasi fallback behavior untuk setiap service
    - Implementasi rate limiting pada API gateway
    - _Requirements: Semua (reliability)_

  - [ ]* 24.3 Integration tests untuk end-to-end flows
    - Test flow registrasi lengkap: register → OTP → profile → account active
    - Test flow survei: create survey → invite → fill → submit → reward credited
    - Test flow export: filter → export → mark exported → cleanup eligible
    - Test flow redemption: earn points → reach threshold → redeem → confirm OTP → deduct
    - _Requirements: Semua_

- [x] 25. Final checkpoint - Pastikan semua test lulus
  - Pastikan semua test lulus, tanyakan ke user jika ada pertanyaan.

## Catatan

- Task yang ditandai dengan `*` bersifat opsional dan dapat dilewati untuk MVP yang lebih cepat
- Setiap task mereferensikan requirements spesifik untuk traceability
- Checkpoint memastikan validasi inkremental di setiap tahap
- Property tests memvalidasi correctness properties universal (33 properties dari dokumen desain)
- Unit tests memvalidasi contoh spesifik dan edge cases
- Implementasi menggunakan TypeScript untuk backend (NestJS) dan frontend (React)
- Testing framework: Vitest + fast-check untuk property-based testing
- Urutan task mengikuti dependency: infrastruktur → database → backend modules → frontend → integrasi

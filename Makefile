.PHONY: help \
        setup \
        docker-up docker-down docker-restart docker-build docker-build-nc \
        docker-logs docker-logs-backend docker-logs-frontend \
        docker-ps docker-health docker-clean docker-volumes \
        docker-psql docker-redis-cli docker-minio-console \
        migrate migrate-revert \
        dev-backend dev-frontend \
        test-backend test-frontend

# Warna output
CYAN  := \033[0;36m
RESET := \033[0m

# ── Help ──────────────────────────────────────────────────────────────────────
help:
	@echo "$(CYAN)Survei Online — Perintah Make$(RESET)"
	@echo ""
	@echo "  $(CYAN)Setup$(RESET)"
	@echo "    setup              Salin file .env dari contoh (sekali saja)"
	@echo ""
	@echo "  $(CYAN)Docker$(RESET)"
	@echo "    docker-up          Jalankan semua service (detached)"
	@echo "    docker-down        Hentikan semua service"
	@echo "    docker-restart     Hentikan lalu jalankan ulang"
	@echo "    docker-build       Build ulang image semua service"
	@echo "    docker-build-nc    Build ulang tanpa cache"
	@echo "    docker-ps          Tampilkan status container"
	@echo "    docker-health      Tampilkan status health semua service"
	@echo "    docker-clean       Hapus semua container + volume (DATA HILANG!)"
	@echo ""
	@echo "  $(CYAN)Logs$(RESET)"
	@echo "    docker-logs        Semua log (follow)"
	@echo "    docker-logs-backend   Log backend saja"
	@echo "    docker-logs-frontend  Log frontend saja"
	@echo ""
	@echo "  $(CYAN)Database$(RESET)"
	@echo "    docker-psql        Buka psql CLI ke database"
	@echo "    migrate            Jalankan migration yang belum dieksekusi"
	@echo "    migrate-revert     Rollback migration terakhir"
	@echo ""
	@echo "  $(CYAN)Storage$(RESET)"
	@echo "    docker-redis-cli   Buka Redis CLI"
	@echo "    docker-minio-console  Buka URL console MinIO di browser"
	@echo ""
	@echo "  $(CYAN)Development$(RESET)"
	@echo "    dev-backend        Jalankan backend lokal (watch mode)"
	@echo "    dev-frontend       Jalankan frontend lokal (Vite dev server)"
	@echo ""
	@echo "  $(CYAN)Testing$(RESET)"
	@echo "    test-backend       Jalankan semua test backend"
	@echo "    test-frontend      Jalankan semua test frontend"

# ── Setup ─────────────────────────────────────────────────────────────────────
setup:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✓ .env dibuat dari .env.example — edit sebelum docker-up"; \
	else \
		echo "! .env sudah ada, dilewati"; \
	fi
	@if [ ! -f backend/.env ]; then \
		cp backend/.env.example backend/.env; \
		echo "✓ backend/.env dibuat dari backend/.env.example — edit sebelum menjalankan"; \
	else \
		echo "! backend/.env sudah ada, dilewati"; \
	fi

# ── Docker lifecycle ──────────────────────────────────────────────────────────
docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-restart:
	docker compose down
	docker compose up -d

docker-build:
	docker compose build

docker-build-nc:
	docker compose build --no-cache

# ── Logs ─────────────────────────────────────────────────────────────────────
docker-logs:
	docker compose logs -f

docker-logs-backend:
	docker compose logs -f backend

docker-logs-frontend:
	docker compose logs -f frontend

# ── Status ───────────────────────────────────────────────────────────────────
docker-ps:
	docker compose ps

docker-health:
	@echo "$(CYAN)Health status:$(RESET)"
	@docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

# ── Cleanup ───────────────────────────────────────────────────────────────────
docker-clean:
	@echo "⚠️  Ini akan menghapus semua container DAN volume (data DB, Redis, MinIO)."
	@read -p "Ketik 'hapus' untuk konfirmasi: " confirm; \
	if [ "$$confirm" = "hapus" ]; then \
		docker compose down -v; \
		echo "✓ Semua container dan volume dihapus"; \
	else \
		echo "Dibatalkan."; \
	fi

docker-volumes:
	docker volume ls | grep survei

# ── Database ──────────────────────────────────────────────────────────────────
docker-psql:
	docker compose exec postgres psql -U $${DB_USERNAME:-postgres} -d $${DB_DATABASE:-survei_online}

# Jalankan migration secara manual (biasanya otomatis saat backend start di production)
migrate:
	docker compose exec backend node -e " \
		const { DataSource } = require('typeorm'); \
		const ds = new DataSource({ \
			type: 'postgres', \
			host: process.env.DB_HOST, \
			port: +process.env.DB_PORT, \
			username: process.env.DB_USERNAME, \
			password: process.env.DB_PASSWORD, \
			database: process.env.DB_DATABASE, \
			migrations: ['dist/migrations/*.js'], \
			migrationsTableName: 'typeorm_migrations', \
		}); \
		ds.initialize().then(() => ds.runMigrations()).then(m => { \
			console.log('Migration selesai:', m.map(x => x.name)); \
			process.exit(0); \
		}).catch(e => { console.error(e); process.exit(1); }); \
	"

migrate-revert:
	docker compose exec backend node -e " \
		const { DataSource } = require('typeorm'); \
		const ds = new DataSource({ \
			type: 'postgres', \
			host: process.env.DB_HOST, \
			port: +process.env.DB_PORT, \
			username: process.env.DB_USERNAME, \
			password: process.env.DB_PASSWORD, \
			database: process.env.DB_DATABASE, \
			migrations: ['dist/migrations/*.js'], \
			migrationsTableName: 'typeorm_migrations', \
		}); \
		ds.initialize().then(() => ds.undoLastMigration()).then(() => { \
			console.log('Migration terakhir di-rollback'); \
			process.exit(0); \
		}).catch(e => { console.error(e); process.exit(1); }); \
	"

# ── Redis ─────────────────────────────────────────────────────────────────────
docker-redis-cli:
	docker compose exec redis redis-cli -a $${REDIS_PASSWORD}

# ── MinIO ─────────────────────────────────────────────────────────────────────
docker-minio-console:
	@echo "MinIO Console: http://127.0.0.1:9001"
	@echo "User: $${MINIO_ROOT_USER:-minioadmin}"
	@command -v xdg-open >/dev/null 2>&1 && xdg-open http://127.0.0.1:9001 || \
	command -v open >/dev/null 2>&1 && open http://127.0.0.1:9001 || \
	echo "(Buka URL di atas secara manual di browser)"

# ── Development lokal ─────────────────────────────────────────────────────────
dev-backend:
	cd backend && npm run dev

dev-frontend:
	cd frontend && npm run dev

# ── Testing ───────────────────────────────────────────────────────────────────
test-backend:
	cd backend && npm test

test-frontend:
	cd frontend && npm test

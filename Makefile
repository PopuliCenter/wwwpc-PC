.PHONY: docker-up docker-down docker-restart docker-logs docker-ps docker-clean docker-volumes

# Start all services in detached mode
docker-up:
	docker compose up -d

# Stop all services
docker-down:
	docker compose down

# Restart all services
docker-restart:
	docker compose down && docker compose up -d

# Show logs (follow mode)
docker-logs:
	docker compose logs -f

# Show logs for a specific service (usage: make docker-logs-service SERVICE=postgres)
docker-logs-service:
	docker compose logs -f $(SERVICE)

# Show running containers
docker-ps:
	docker compose ps

# Stop services and remove volumes (WARNING: destroys data)
docker-clean:
	docker compose down -v

# Show volume usage
docker-volumes:
	docker volume ls | grep survei

# Connect to PostgreSQL CLI
docker-psql:
	docker compose exec postgres psql -U postgres -d survei_online

# Connect to Redis CLI
docker-redis-cli:
	docker compose exec redis redis-cli

# Check health status of all services
docker-health:
	docker compose ps --format "table {{.Name}}\t{{.Status}}"

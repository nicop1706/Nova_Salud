# Nova Salud · atajos.  `make help` lista los objetivos.
COMPOSE ?= docker compose
.DEFAULT_GOAL := help

help: ## Muestra esta ayuda
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[32m%-10s\033[0m %s\n", $$1, $$2}'

env: ## Crea .env desde .env.example si no existe
	@test -f .env || (cp .env.example .env && echo ".env creado")

secrets: env ## Genera secretos JWT y clave de BD aleatorios en .env
	@sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$$(openssl rand -hex 48)|; s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$$(openssl rand -hex 48)|" .env
	@echo "Secretos JWT regenerados. La clave de BD solo puede cambiarse antes del primer arranque: make reset && edita POSTGRES_PASSWORD"

up: env ## Construye y levanta todo (http://localhost:8080)
	$(COMPOSE) up --build -d
	@echo "Listo: http://localhost:8080  ·  API docs: http://localhost:8080/api/docs"

down: ## Detiene los contenedores (conserva los datos)
	$(COMPOSE) down

logs: ## Sigue los logs de la API
	$(COMPOSE) logs -f --tail=100 backend

ps: ## Estado de los contenedores
	$(COMPOSE) ps

seed: ## Recarga los datos de demostración (BORRA los datos actuales)
	$(COMPOSE) exec -e SEED_FORCE=true backend node dist/seeds/seed.js

test: ## Ejecuta las pruebas de backend y frontend (requiere Node 20 y PostgreSQL local; ver README)
	cd backend && npm test
	cd frontend && npm test

backup: ## Respaldo de la base de datos en ./backups
	./scripts/backup.sh

restore: ## Restaura un respaldo: make restore FILE=backups/xxx.sql.gz
	./scripts/restore.sh $(FILE)

dev: env ## Desarrollo con recarga en caliente (http://localhost:5173)
	$(COMPOSE) -f docker-compose.dev.yml up --build

adminer: ## Levanta Adminer (http://localhost:8081)
	$(COMPOSE) --profile tools up -d adminer

reset: ## Elimina contenedores Y volúmenes (borra la base de datos)
	$(COMPOSE) down -v

.PHONY: help env secrets up down logs ps seed test backup restore dev adminer reset

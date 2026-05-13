# Makefile — SSO Frontend DevOps Lifecycle
#
# Usage:
#   make dev          Start Vite dev server
#   make test         Run unit tests
#   make lint         Lint + typecheck
#   make build        Production build
#   make docker       Build Docker image
#   make deploy       Deploy to staging via docker compose
#   make clean        Remove dist + node_modules cache

.PHONY: dev test lint build docker deploy clean gate ci help

# ─── Variables ─────────────────────────────────────────────────────
IMAGE_NAME   ?= sso-frontend
IMAGE_TAG    ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "local")
COMPOSE_FILE ?= docker-compose.yml

# ─── Development ───────────────────────────────────────────────────
dev: ## Start Vite dev server
	npm run dev

install: ## Install dependencies
	npm ci --ignore-scripts

# ─── Quality ───────────────────────────────────────────────────────
lint: ## ESLint + TypeScript check
	npm run typecheck
	npm run lint

test: ## Run Vitest unit tests
	npm run test

test-watch: ## Run Vitest in watch mode
	npx vitest

test-coverage: ## Run tests with coverage report
	npx vitest run --coverage

# ─── Build ─────────────────────────────────────────────────────────
build: ## Production build (typecheck + vite build)
	npm run build

preview: ## Preview production build locally
	npm run preview

# ─── Gate (CI equivalent locally) ─────────────────────────────────
gate: lint test build ## Run full quality gate (lint + test + build)
	@echo "✅ All gates passed"

ci: gate ## Alias for gate

# ─── Docker ────────────────────────────────────────────────────────
docker: ## Build Docker image
	docker build \
		-f Dockerfile \
		--build-arg VITE_SSO_API_URL="" \
		--build-arg VITE_APP_NAME="Dev-SSO Portal" \
		--build-arg VITE_OIDC_ISSUER="" \
		--build-arg VITE_OIDC_CLIENT_ID="sso-frontend-portal" \
		-t $(IMAGE_NAME):$(IMAGE_TAG) \
		-t $(IMAGE_NAME):latest \
		../..

docker-run: docker ## Build and run Docker container locally
	docker run --rm -p 3000:80 \
		-e SSO_BACKEND_UPSTREAM=host.docker.internal:8200 \
		-e SSO_FRONTEND_SERVER_NAME=_ \
		$(IMAGE_NAME):$(IMAGE_TAG)

docker-compose-up: ## Start via docker compose
	docker compose -f $(COMPOSE_FILE) up -d --build

docker-compose-down: ## Stop docker compose
	docker compose -f $(COMPOSE_FILE) down

docker-compose-logs: ## Follow docker compose logs
	docker compose -f $(COMPOSE_FILE) logs -f sso-frontend

# ─── Deploy ────────────────────────────────────────────────────────
deploy: ## Deploy to staging (pull + restart)
	docker compose -f $(COMPOSE_FILE) pull sso-frontend
	docker compose -f $(COMPOSE_FILE) up -d sso-frontend --no-deps
	@echo "✅ Deployed sso-frontend"

deploy-prod: ## Deploy to production (requires confirmation)
	@echo "⚠️  Production deploy — are you sure? [y/N]" && read ans && [ $${ans:-N} = y ]
	docker compose -f docker-compose.prod.yml pull sso-frontend
	docker compose -f docker-compose.prod.yml up -d sso-frontend --no-deps
	@echo "✅ Deployed sso-frontend to production"

# ─── Cleanup ───────────────────────────────────────────────────────
clean: ## Remove dist and caches
	rm -rf dist .cache coverage test-results.xml
	@echo "✅ Cleaned"

clean-all: clean ## Remove dist + node_modules
	rm -rf node_modules
	@echo "✅ Cleaned all (run 'make install' to restore)"

# ─── Help ──────────────────────────────────────────────────────────
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help

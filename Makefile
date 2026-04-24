up:
	docker compose --env-file .env up --build

down:
	docker compose --env-file .env down --remove-orphans

bootstrap:
	cp .env.example .env || true
	cp services/sso-frontend/.env.example services/sso-frontend/.env || true
	cp apps/app-a-next/.env.example apps/app-a-next/.env || true
	cp services/sso-backend/.env.example services/sso-backend/.env || true
	cp apps/app-b-laravel/.env.example apps/app-b-laravel/.env || true

test-backend:
	cd services/sso-backend && php artisan test

test-app-b:
	cd apps/app-b-laravel && php artisan test

lint-web:
	cd services/sso-frontend && npm run lint
	cd apps/app-a-next && npm run lint

validate-devops:
	./scripts/validate-devops-lifecycle.sh
	./scripts/validate-laravel-vue-lifecycle.sh --strict-target
	./infra/sre/check-coexistence-policy.sh
	./infra/sre/check-zero-downtime-migration-policy.sh
	./infra/sre/check-observability-assets.sh

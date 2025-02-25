.PHONY: build run stop clean logs help

# Docker image and container names
# CONTAINER_NAME = api-express-ts # compose.yml
CONTAINER_NAME = express-typescript-boilerplate-api-1 # compose.dev.yml

# Default target
.DEFAULT_GOAL := help

help: ## Display this help screen
	@grep -h -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

build: ## Build the Docker image
	docker compose --env-file .env.development --profile dev build

dev: ## Run the container in development mode with hot-reload
#	docker compose --env-file .env.development --profile dev up -d

prod: ## Run the container in production mode
	docker compose --env-file .env.production --profile prod up -d

stop: ## Stop and remove the container
	docker stop $(CONTAINER_NAME) || true
	docker rm $(CONTAINER_NAME) || true

down: ## Stop and remove all containers, networks, and volumes
	docker compose --env-file .env.development --profile dev down --remove-orphans --volumes

logs: ## View container logs
	docker logs -f $(CONTAINER_NAME)

workspace: ## Access container shell
	docker exec -it $(CONTAINER_NAME) sh

docs: ## Generate documentation
	docker exec -it $(CONTAINER_NAME) pnpm swagger-autogen

prisma: ## Generate Prisma client
	npx prisma generate

prisma-migrate: ## Run Prisma migrations
	docker exec -it $(CONTAINER_NAME) pnpm prisma migrate dev

seed: ## Seed the database
	@docker exec -it $(CONTAINER_NAME) npx prisma migrate reset --force
	@docker exec -it $(CONTAINER_NAME) npx prisma migrate deploy
	@docker exec -it $(CONTAINER_NAME) pnpm run seed

recharge-bdd: ## Recharge la base de données
	@docker exec -it $(CONTAINER_NAME) pnpm prisma migrate dev
	@docker exec -it $(CONTAINER_NAME) pnpm run seed

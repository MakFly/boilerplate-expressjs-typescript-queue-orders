.PHONY: build run stop clean logs help

# Docker image and container names
# CONTAINER_NAME = api-express-ts # compose.yml
CONTAINER_NAME = backend-api-1 # compose.dev.yml

# Default target
.DEFAULT_GOAL := help

help: ## Display this help screen
	@grep -h -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

build: ## Build the Docker image
	docker compose --env-file .env.development --profile dev build

dev: ## Run the container in development mode with hot-reload
	./start.sh dev

prod: ## Run the container in production mode
	./start.sh prod

stop: ## Stop and remove the container
	docker stop $(CONTAINER_NAME) || true
	docker rm $(CONTAINER_NAME) || true

down: ## Stop and remove all containers, networks, and volumes
	./start.sh down
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
	@docker exec -it $(CONTAINER_NAME) pnpm run clean-queues
	@docker exec -it $(CONTAINER_NAME) pnpm run clean-alerts
	@docker exec -it $(CONTAINER_NAME) pnpm run seed
	@docker exec -it $(CONTAINER_NAME) pnpm run queue-pending-orders

clean-queues: ## Nettoyer les files d'attente RabbitMQ des commandes annulées
	@docker exec -it $(CONTAINER_NAME) pnpm run clean-queues

clean-alerts: ## Nettoyer les alertes obsolètes dans la base de données
	@docker exec -it $(CONTAINER_NAME) pnpm run clean-alerts

recharge-bdd: ## Recharge la base de données
	@docker exec -it $(CONTAINER_NAME) pnpm prisma migrate dev
	@docker exec -it $(CONTAINER_NAME) pnpm run seed

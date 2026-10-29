# Development tasks for @flecoufle/node-red-linky.
# No Node.js/npm needed on the host: everything runs in containers.

SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE       ?= docker compose
COMPOSE_TOOLS := $(COMPOSE) --profile tools
SERVICE       ?= node-red
TOOLS         ?= tools

NR_PORT       ?= 1880
NR_TZ         ?= Europe/Paris
NR_IMAGE      ?= nodered/node-red:4.1.17-22
NR_FLOWS      ?= flows.json
NR_DEBUG_PORT ?= 9229
NODE_IMAGE    ?= node:22-bookworm-slim
LOCAL_UID     ?= $(shell id -u)
LOCAL_GID     ?= $(shell id -g)
MODULE_NAME   ?= $(shell sed -n 's/^[[:space:]]*"name":[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -n1)

-include .env
export NR_PORT NR_TZ NR_IMAGE NR_FLOWS NR_DEBUG_PORT NODE_IMAGE LOCAL_UID LOCAL_GID MODULE_NAME

NR_URL        := http://127.0.0.1:$(NR_PORT)
STAMP_DIR     := .make
INSTALL_STAMP := $(STAMP_DIR)/install.stamp

.PHONY: help env doctor config up down restart dev watch logs ps open install update \
        outdated shell nr-shell lint test check pack version seed clean reset debug

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z0-9_.-]+:.*##/ {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@printf "\nNode-RED UI: %s\n\n" "$(NR_URL)"

env: ## Create .env from .env.example if missing
	@test -f .env && echo ".env already exists" || (cp .env.example .env && echo ".env created")

doctor: ## Check Docker/Compose and port availability
	@command -v docker >/dev/null || { echo "docker is required"; exit 1; }
	@$(COMPOSE) version
	@docker info >/dev/null 2>&1 || { echo "Docker daemon is not reachable"; exit 1; }
	@if ss -ltn 2>/dev/null | awk '{print $$4}' | grep -qE '[:.]$(NR_PORT)$$'; then \
		echo "WARNING: port $(NR_PORT) is already in use (set NR_PORT in .env)"; \
	else echo "port $(NR_PORT) is free"; fi

config: ## Validate the compose configuration
	@$(COMPOSE) config -q && echo "compose config OK"

$(STAMP_DIR):
	@mkdir -p $@

install: | $(STAMP_DIR) ## Install node dependencies in the tools container
	@if [ ! -d node_modules/got ] || [ package.json -nt $(INSTALL_STAMP) ] || [ package-lock.json -nt $(INSTALL_STAMP) ]; then \
		echo "==> npm ci"; \
		$(COMPOSE_TOOLS) run --rm $(TOOLS) npm ci; \
		touch $(INSTALL_STAMP); \
	else \
		echo "==> node_modules up to date"; \
	fi

up: install ## Start Node-RED and wait until healthy
	@$(COMPOSE) up -d --remove-orphans --wait $(SERVICE)
	@echo "==> Node-RED: $(NR_URL)"

dev: up ## Start the stack and follow the logs
	@$(COMPOSE) logs -f --tail=50 $(SERVICE)

down: ## Stop the stack (Node-RED data is kept)
	@$(COMPOSE) down --remove-orphans

restart: ## Restart Node-RED to reload node code
	@$(COMPOSE) restart $(SERVICE)
	@echo "==> Node-RED restarted"

watch: ## Poll linky/ and restart Node-RED on change
	@echo "Watching linky/** — Ctrl+C to stop"
	@last=$$(date +%s); while true; do \
		sleep 2; \
		changed=$$(find linky -type f -newermt "@$$last" 2>/dev/null | head -n1); \
		if [ -n "$$changed" ]; then \
			echo "==> $$changed changed, restarting"; \
			$(COMPOSE) restart $(SERVICE) >/dev/null; \
			last=$$(date +%s); \
		fi; \
	done

logs: ## Follow Node-RED logs
	@$(COMPOSE) logs -f --tail=200 $(SERVICE)

ps: ## Show stack status
	@$(COMPOSE) ps

open: ## Open the Node-RED editor in a browser
	@command -v xdg-open >/dev/null && xdg-open $(NR_URL) || echo "Open $(NR_URL)"

shell: ## Shell in the tools container
	@$(COMPOSE_TOOLS) run --rm $(TOOLS) bash

nr-shell: ## Shell in the running Node-RED container
	@$(COMPOSE) exec $(SERVICE) sh

update: ## Update dependencies within semver ranges
	@$(COMPOSE_TOOLS) run --rm $(TOOLS) npm update
	@touch $(INSTALL_STAMP)

outdated: ## Show outdated dependencies
	@$(COMPOSE_TOOLS) run --rm $(TOOLS) npm outdated || true

lint: install ## Run the linter (no-op until a lint script exists)
	@$(COMPOSE_TOOLS) run --rm $(TOOLS) npm run lint --if-present

test: install ## Run tests (no-op until a test script exists)
	@$(COMPOSE_TOOLS) run --rm $(TOOLS) npm run test --if-present

check: lint test ## Run lint + tests

pack: install ## Build the npm tarball
	@$(COMPOSE_TOOLS) run --rm $(TOOLS) npm pack
	@ls -lh ./*.tgz 2>/dev/null || true

version: ## Print the package version
	@sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -n1

seed: ## Replace Node-RED flows with examples/Examples.json (stops the stack)
	@$(COMPOSE) down --remove-orphans
	@$(COMPOSE) run --rm --no-deps --entrypoint sh $(SERVICE) \
		-c 'cp /data/node_modules/$(MODULE_NAME)/examples/Examples.json /data/flows.json'
	@echo "==> examples/Examples.json installed as flows.json; run 'make up'"

clean: ## Remove node_modules, stamps and tarballs
	@rm -rf node_modules $(STAMP_DIR) ./*.tgz

reset: ## Delete the Node-RED data volume (flows/settings/credentials)
	@read -r -p "Delete Node-RED flows/settings/credentials? [y/N] " a; \
	if [ "$$a" = "y" ] || [ "$$a" = "Y" ]; then \
		$(COMPOSE) down -v --remove-orphans; \
		rm -rf $(STAMP_DIR); \
		echo "==> reset done"; \
	else echo "==> aborted"; fi

debug: install ## Run Node-RED in foreground with inspector on :9229
	@$(COMPOSE) stop $(SERVICE) >/dev/null 2>&1 || true
	@$(COMPOSE) run --rm --service-ports -p $(NR_DEBUG_PORT):9229 \
		-e NODE_OPTIONS="--inspect=0.0.0.0:9229" $(SERVICE)

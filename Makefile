# Transout — 内网穿透控制面板
# 用法: make help

SHELL := /bin/bash
PORT  ?= 7321
WEB_DIR    := web
SERVER_DIR := server
DIST       := $(WEB_DIR)/dist
PID_FILE   := $(CURDIR)/$(SERVER_DIR)/data/server.pid
LOG_FILE   := $(CURDIR)/$(SERVER_DIR)/data/server.log
# 部署目标（可用 make deploy WEB_ROOT=/var/www/transout 覆盖）
WEB_ROOT   ?= /var/www/transout

.PHONY: help install build dev dev-server dev-web start stop restart status deploy clean

help: ## 显示帮助
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  make %-12s %s\n", $$1, $$2}'

install: ## 安装前后端依赖
	cd $(SERVER_DIR) && npm install
	cd $(WEB_DIR) && npm install

build: ## 构建前端静态产物 (web/dist)
	cd $(WEB_DIR) && npm run build

dev-server: ## 开发: 启动后端 (端口 $(PORT))
	cd $(SERVER_DIR) && PORT=$(PORT) npm run dev

dev-web: ## 开发: 启动前端 Vite (代理 /api 到 7321)
	cd $(WEB_DIR) && npm run dev

dev: ## 开发: 同时启动前后端
	@$(MAKE) --no-print-directory dev-server & $(MAKE) --no-print-directory dev-web

start: build ## 生产: 构建前端并后台启动后端
	@mkdir -p $(SERVER_DIR)/data
	@if [ -f $(PID_FILE) ] && kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
		echo "已在运行 (pid $$(cat $(PID_FILE)))"; exit 0; \
	fi
	PORT=$(PORT) nohup node $(CURDIR)/$(SERVER_DIR)/src/index.js > $(LOG_FILE) 2>&1 & echo $$! > $(PID_FILE)
	@echo "后端已启动: http://localhost:$(PORT)  (前端产物在 $(DIST), 请用 nginx 托管, 参考 deploy/nginx.conf.example)"

stop: ## 停止后端
	@if [ -f $(PID_FILE) ] && kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
		kill $$(cat $(PID_FILE)) && echo "已停止 (pid $$(cat $(PID_FILE)))"; \
	else echo "未在运行"; fi
	@rm -f $(PID_FILE)

restart: stop start ## 重启后端

status: ## 查看后端运行状态
	@if [ -f $(PID_FILE) ] && kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
		echo "运行中 (pid $$(cat $(PID_FILE)), 端口 $(PORT))"; \
	else echo "未运行"; fi

deploy: build ## 部署: 拷贝前端产物到 WEB_ROOT (默认 /var/www/transout)
	@test -d $(WEB_ROOT) || { echo "请先创建 $(WEB_ROOT) 或用 WEB_ROOT=... 指定"; exit 1; }
	rsync -a --delete $(DIST)/ $(WEB_ROOT)/
	@echo "前端已部署到 $(WEB_ROOT)。请将 deploy/nginx.conf.example 接入 nginx 并重载。"

clean: ## 清理构建产物与依赖
	rm -rf $(DIST) $(WEB_DIR)/node_modules $(SERVER_DIR)/node_modules

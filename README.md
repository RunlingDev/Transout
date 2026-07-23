# Transout — 内网穿透资源控制面板

管理需要从内网穿透到公网的资源：统一配置 frp / ngrok 穿透渠道，在其上建立隧道并控制启停，配合用户组权限与源站黑白名单进行访问控制。

## 架构

单仓库（monorepo），前后端目录隔离：

- `web/` — 前端：Vue3 + Vite + Naive UI + Pinia + Vue Router（设计语言参照 Apple HIG）
- `server/` — 后端：Node.js + Express + better-sqlite3，进程级管理 frpc / ngrok
- `deploy/` — nginx 与 systemd 配置示例
- `Makefile` — 安装、构建、开发、启动、部署入口

数据全部落在 `server/data/`（SQLite 库、JWT 密钥、运行时配置、日志），已 gitignore。

## 功能

- **穿透渠道**：frp（frpc 客户端）与 ngrok 两种类型，支持多渠道；token/authtoken 存储脱敏回显；一键检测二进制可用性
- **隧道控制**：配置源（内网 host:port）、渠道、协议（tcp/http/https）、公网端（remote_port 或 subdomain/domain），Switch 直接启停；异常时展示 last_error；ngrok 公网地址自动回读展示；详情页提供源站/穿透后连通性测试（含时延）与运行日志
- **用户与用户组**：
  - 管理员：全局渠道、用户、用户组、全部隧道的管理
  - 自定义用户组：由管理员创建并分配成员；一个用户可加入多个用户组
  - 默认组：未分组用户的归属，不可删除
  - 渠道授权：按用户组或用户暴露渠道，无授权记录的渠道仅管理员可见可用（默认拒绝）
  - 源站控制：按用户组配置允许集合——不限制（全集）/白名单（名单集合）/黑名单（名单补集），条目支持 IP、CIDR、`*.域名`、可带 `:端口`；多组时按用户设置取各组允许集合的并集或交集
  - 用户邮箱：用于 Cravatar/Gravatar 头像

## 快速开始

```bash
make install    # 安装前后端依赖
make dev        # 开发模式：后端 :7321 + 前端 Vite :5173（/api 已代理）
```

首次访问会引导创建管理员账号。

## 生产部署（sqlite + nginx）

一键部署（构建前端、安装后端到 /opt/transout、生成 nginx 配置、注册并启用 systemd 服务）：

```bash
sudo bash deploy/install.sh                      # 全默认；--domain/--port/--web-root/--user 可覆盖
sudo bash deploy/install.sh --domain example.com # 指定域名（nginx server_name）
sudo bash deploy/install.sh --port 8080          # 指定 nginx 监听端口（后端固定 127.0.0.1:7321，由 nginx 反代）
sudo bash deploy/install.sh --skip-nginx         # 只装后端 + systemd
```

检测到已有安装时脚本自动进入升级模式：更新代码与依赖、保留 `data/` 与已有 systemd/nginx 配置并重启服务；升级时显式传 `--domain`/`--port` 才会重写 nginx 配置。

```bash
git pull && sudo bash deploy/install.sh          # 一键升级
```

手动部署：

```bash
make start                        # 构建前端并后台启动后端（127.0.0.1:7321）
sudo mkdir -p /var/www/transout
sudo make deploy                  # 前端产物同步到 /var/www/transout
# 参考 deploy/nginx.conf.example 配置 nginx 并重载
```

后端常驻也可使用 `deploy/transout.service.example`（systemd）。

`make stop` / `make restart` / `make status` 管理后端进程。

## frp / ngrok 二进制

面板在「设置」中配置 `frpc`、`ngrok` 可执行文件路径（默认从 PATH 查找）。
- frp：同一渠道下的启用隧道共用一个 frpc 进程，配置变更自动重写并重启
- ngrok：每个启用隧道一个独立进程

二进制缺失时隧道会进入「异常」状态并给出明确提示，不影响面板其余功能。

## 分支模型（GitFlow）

- `main`：发布分支，打 tag（如 v0.1.0）
- `develop`：集成分支
- `feature/*`：功能分支，完成后合并回 `develop`
- `release/*`、`hotfix/*` 按 GitFlow 惯例使用

## API 概览

全部前缀 `/api`，JWT Bearer 认证，错误统一 `{error}`。

| 模块 | 端点 |
|---|---|
| 认证 | `POST /auth/login`、`GET/POST /auth/bootstrap`、`GET /auth/me`、`PUT /auth/password`、`PUT /auth/email` |
| 用户 | `GET/POST /users`、`PUT/DELETE /users/:id`（管理员） |
| 用户组 | `GET/POST /groups`、`PUT/DELETE /groups/:id`（管理员） |
| 渠道 | `GET/POST /channels`、`PUT/DELETE /channels/:id`、`POST /channels/:id/check` |
| 隧道 | `GET/POST /tunnels`、`GET/PUT/DELETE /tunnels/:id`、`POST /tunnels/:id/start|stop`、`GET /tunnels/:id/log`、`POST /tunnels/:id/test/source|public` |
| 设置 | `GET/PUT /settings`、`POST /settings/check`（管理员） |

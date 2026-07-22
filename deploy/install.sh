#!/usr/bin/env bash
# Transout 一键部署脚本：构建前端、安装后端、生成 nginx 配置、注册并启用 systemd 服务
# 用法（在仓库根目录执行）：
#   sudo bash deploy/install.sh                      # 全部默认
#   sudo bash deploy/install.sh --domain example.com --port 7321
#   sudo bash deploy/install.sh --skip-nginx         # 只装后端 + systemd
set -euo pipefail

# ---------- 参数 ----------
APP_DIR=/opt/transout          # 后端安装目录
WEB_ROOT=/var/www/transout     # 前端静态产物目录
PORT=7321                      # 后端监听端口（绑 127.0.0.1，由 nginx 反代）
DOMAIN=_                       # nginx server_name，_ 表示默认站点
RUN_USER=${SUDO_USER:-transout}
SKIP_NGINX=0
SKIP_SYSTEMD=0

while [ $# -gt 0 ]; do
  case "$1" in
    --app-dir)   APP_DIR=$2; shift 2;;
    --web-root)  WEB_ROOT=$2; shift 2;;
    --port)      PORT=$2; shift 2;;
    --domain)    DOMAIN=$2; shift 2;;
    --user)      RUN_USER=$2; shift 2;;
    --skip-nginx)    SKIP_NGINX=1; shift;;
    --skip-systemd)  SKIP_SYSTEMD=1; shift;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//' | head -6; exit 0;;
    *) echo "未知参数: $1" >&2; exit 1;;
  esac
done

log() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m错误:\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- 前置检查 ----------
[ "$(id -u)" -eq 0 ] || die "请用 root 运行：sudo bash deploy/install.sh"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
[ -f "$REPO_DIR/server/package.json" ] || die "未找到 server/，请在仓库根目录外运行本脚本（deploy/install.sh）"
command -v node >/dev/null || die "未安装 node"
command -v npm  >/dev/null || die "未安装 npm"
NODE_BIN=$(command -v node)
id "$RUN_USER" >/dev/null 2>&1 || die "用户 $RUN_USER 不存在，请用 --user 指定"

# ---------- 构建前端 ----------
log "安装依赖并构建前端"
cd "$REPO_DIR/web"
[ -d node_modules ] || npm install
npm run build

# ---------- 安装后端 ----------
log "安装后端到 $APP_DIR"
mkdir -p "$APP_DIR" "$WEB_ROOT"
rsync -a --delete --exclude data "$REPO_DIR/server/src" "$REPO_DIR/server/package.json" "$REPO_DIR/server/package-lock.json" "$APP_DIR/"
cd "$APP_DIR"
[ -d node_modules ] || npm install --omit=dev
mkdir -p "$APP_DIR/data"
chown -R "$RUN_USER:$RUN_USER" "$APP_DIR"

# ---------- 部署前端产物 ----------
log "部署前端产物到 $WEB_ROOT"
rsync -a --delete "$REPO_DIR/web/dist/" "$WEB_ROOT/"

# ---------- systemd ----------
if [ "$SKIP_SYSTEMD" -eq 0 ]; then
  log "写入 systemd 单元 transout.service 并启用"
  cat > /etc/systemd/system/transout.service <<EOF
[Unit]
Description=Transout 内网穿透控制面板后端
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
Environment=PORT=$PORT
Environment=DATA_DIR=$APP_DIR/data
ExecStart=$NODE_BIN src/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now transout
  systemctl --no-pager --full status transout | head -5 || true
fi

# ---------- nginx ----------
if [ "$SKIP_NGINX" -eq 0 ]; then
  command -v nginx >/dev/null || die "未安装 nginx；可先 apt install nginx，或用 --skip-nginx 跳过"
  # Debian/Ubuntu 用 sites-available，其余发行版用 conf.d
  if [ -d /etc/nginx/sites-available ]; then
    CONF=/etc/nginx/sites-available/transout.conf
    LINK=/etc/nginx/sites-enabled/transout.conf
  else
    CONF=/etc/nginx/conf.d/transout.conf
    LINK=
  fi
  log "生成 nginx 配置 $CONF"
  cat > "$CONF" <<EOF
# Transout 前端站点 + API 反代（由 deploy/install.sh 生成）
server {
    listen 80;
    server_name $DOMAIN;

    root $WEB_ROOT;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF
  [ -n "$LINK" ] && ln -sf "$CONF" "$LINK"
  nginx -t
  systemctl reload nginx 2>/dev/null || systemctl restart nginx
fi

log "部署完成"
echo "  后端: 127.0.0.1:$PORT (systemd: transout.service, 用户 $RUN_USER)"
[ "$SKIP_NGINX" -eq 0 ] && echo "  前端: http://$DOMAIN/ ($WEB_ROOT, nginx :80)"
echo "  首次访问请创建管理员账号。日志: journalctl -u transout -f"

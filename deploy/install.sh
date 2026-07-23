#!/usr/bin/env bash
# Transout 一键部署/升级脚本：构建前端、安装后端、生成 nginx 配置、注册并启用 systemd 服务
# 检测到已有安装（$APP_DIR 下存在后端代码）时自动进入升级模式：更新代码与依赖、保留数据、重启服务
# 用法（在仓库根目录执行）：
#   sudo bash deploy/install.sh                      # 全部默认（安装或升级自动判定）
#   sudo bash deploy/install.sh --domain example.com --port 8080
#   sudo bash deploy/install.sh --skip-nginx         # 只装后端 + systemd
# 参数：
#   --app-dir DIR     后端安装目录（默认 /opt/transout）
#   --web-root DIR    前端静态产物目录（默认 /var/www/transout）
#   --port N          nginx 监听端口（默认 80；后端端口固定 7321，由 nginx 反代）
#   --domain NAME     nginx server_name（默认 _ 即默认站点）
#   --user NAME       运行后端的系统用户（默认 sudo 调用者，否则 transout）
#   --skip-nginx      不生成/重载 nginx 配置
#   --skip-systemd    不注册 systemd 服务
set -euo pipefail

# ---------- 参数 ----------
APP_DIR=/opt/transout          # 后端安装目录
WEB_ROOT=/var/www/transout     # 前端静态产物目录
BACKEND_PORT=7321              # 后端监听端口（固定默认，绑 127.0.0.1，由 nginx 反代）
PORT=80                        # nginx 监听端口
DOMAIN=_                       # nginx server_name，_ 表示默认站点
RUN_USER=${SUDO_USER:-transout}
SKIP_NGINX=0
SKIP_SYSTEMD=0
NGINX_EXPLICIT=0               # 用户是否显式指定了 --domain/--port（升级模式下据此决定是否重写 nginx 配置）

while [ $# -gt 0 ]; do
  case "$1" in
    --app-dir)   APP_DIR=$2; shift 2;;
    --web-root)  WEB_ROOT=$2; shift 2;;
    --port)      PORT=$2; NGINX_EXPLICIT=1; shift 2;;
    --domain)    DOMAIN=$2; NGINX_EXPLICIT=1; shift 2;;
    --user)      RUN_USER=$2; shift 2;;
    --skip-nginx)    SKIP_NGINX=1; shift;;
    --skip-systemd)  SKIP_SYSTEMD=1; shift;;
    -h|--help)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
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

# ---------- 安装 / 升级模式判定 ----------
# 已存在后端代码即视为升级：保留 data/ 与已有 nginx、systemd 配置（除非显式要求重写）
UPGRADE=0
[ -f "$APP_DIR/src/index.js" ] && UPGRADE=1
if [ "$UPGRADE" -eq 1 ]; then
  log "检测到已有安装（$APP_DIR），进入升级模式"
else
  log "全新安装到 $APP_DIR"
fi

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
# 依赖随 package-lock.json 变化而更新（npm install 在锁文件一致时很快，直接跑即可）
npm install --omit=dev
mkdir -p "$APP_DIR/data"
chown -R "$RUN_USER:$RUN_USER" "$APP_DIR"

# ---------- 部署前端产物 ----------
log "部署前端产物到 $WEB_ROOT"
rsync -a --delete "$REPO_DIR/web/dist/" "$WEB_ROOT/"

# ---------- systemd ----------
UNIT=/etc/systemd/system/transout.service
if [ "$SKIP_SYSTEMD" -eq 0 ]; then
  # 升级模式且单元已存在：不重写（保留用户可能的本地改动），只重启
  if [ "$UPGRADE" -eq 0 ] || [ ! -f "$UNIT" ]; then
    log "写入 systemd 单元 transout.service 并启用"
    cat > "$UNIT" <<EOF
[Unit]
Description=Transout 内网穿透控制面板后端
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
Environment=HOST=127.0.0.1
Environment=PORT=$BACKEND_PORT
Environment=DATA_DIR=$APP_DIR/data
ExecStart=$NODE_BIN src/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable transout
  fi
  log "重启 transout.service"
  systemctl restart transout
  systemctl --no-pager --full status transout | head -5 || true
fi

# ---------- nginx ----------
NGINX_PRESERVED=0
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
  # 升级模式且配置已存在、用户未显式指定 --domain/--port：保留现有配置
  if [ "$UPGRADE" -eq 1 ] && [ -f "$CONF" ] && [ "$NGINX_EXPLICIT" -eq 0 ]; then
    NGINX_PRESERVED=1
    log "保留已有 nginx 配置 $CONF（如需重写请显式指定 --domain 或 --port）"
  else
    log "生成 nginx 配置 $CONF（监听 :$PORT，反代后端 127.0.0.1:$BACKEND_PORT）"
    cat > "$CONF" <<EOF
# Transout 前端站点 + API 反代（由 deploy/install.sh 生成）
server {
    listen $PORT;
    server_name $DOMAIN;

    root $WEB_ROOT;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
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
fi

log "$([ "$UPGRADE" -eq 1 ] && echo 升级 || echo 部署)完成"
echo "  后端: 127.0.0.1:$BACKEND_PORT (systemd: transout.service, 用户 $RUN_USER)"
if [ "$SKIP_NGINX" -eq 0 ]; then
  if [ "$NGINX_PRESERVED" -eq 1 ]; then
    echo "  站点: 沿用已有 nginx 配置 ($WEB_ROOT)"
  else
    echo "  站点: nginx 监听 :$PORT, server_name $DOMAIN ($WEB_ROOT)"
  fi
fi
echo "  首次访问请创建管理员账号。日志: journalctl -u transout -f"

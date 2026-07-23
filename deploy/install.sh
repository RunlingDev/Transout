#!/usr/bin/env bash
# Transout 一键部署/升级脚本：构建前端、安装后端、生成 nginx 配置、注册并启用 systemd 服务
# 检测到已有安装（--app-dir 下存在后端代码）时自动进入升级模式：更新代码与依赖、保留数据、重启服务
# 一行安装（无需预先克隆仓库，脚本会自动拉取源码；依赖缺失会询问后自动安装）：
#   curl -fsSL https://github.com/RunlingDev/Transout/raw/refs/heads/main/deploy/install.sh | sudo bash
# 常规用法（在仓库根目录执行）：
#   sudo bash deploy/install.sh                      # 安装或升级自动判定
#   sudo bash deploy/install.sh --domain example.com --port 8080
#   sudo bash deploy/install.sh --skip-nginx         # 只装后端 + systemd
# 参数：
#   --app-dir DIR     后端安装目录（默认 /opt/transout）
#   --web-root DIR    前端静态产物目录（默认 /var/www/transout）
#   --repo-dir DIR    一行安装时仓库克隆位置（默认 /opt/transout-repo）
#   --port N          nginx 监听端口（默认 80；后端端口固定 7321，由 nginx 反代）
#   --domain NAME     nginx server_name（默认 _ 即默认站点）
#   --user NAME       运行后端的系统用户（默认 sudo 调用者，否则 transout）
#   -y, --yes         依赖缺失时不再询问，自动安装
#   --skip-nginx      不生成/重载 nginx 配置
#   --skip-systemd    不注册 systemd 服务
set -euo pipefail

# ---------- 参数 ----------
APP_DIR=/opt/transout          # 后端安装目录
WEB_ROOT=/var/www/transout     # 前端静态产物目录
REPO_CLONE_DIR=/opt/transout-repo  # 一行安装模式下仓库克隆位置
BACKEND_PORT=7321              # 后端监听端口（固定默认，绑 127.0.0.1，由 nginx 反代）
PORT=80                        # nginx 监听端口
DOMAIN=_                       # nginx server_name，_ 表示默认站点
RUN_USER=${SUDO_USER:-transout}
SKIP_NGINX=0
SKIP_SYSTEMD=0
ASSUME_YES=0
NGINX_EXPLICIT=0               # 用户是否显式指定了 --domain/--port（升级模式下据此决定是否重写 nginx 配置）
GITHUB_REPO=https://github.com/RunlingDev/Transout
FRP_VERSION=0.61.0             # 自动安装 frpc 时使用的 frp 版本

while [ $# -gt 0 ]; do
  case "$1" in
    --app-dir)   APP_DIR=$2; shift 2;;
    --web-root)  WEB_ROOT=$2; shift 2;;
    --repo-dir)  REPO_CLONE_DIR=$2; shift 2;;
    --port)      PORT=$2; NGINX_EXPLICIT=1; shift 2;;
    --domain)    DOMAIN=$2; NGINX_EXPLICIT=1; shift 2;;
    --user)      RUN_USER=$2; shift 2;;
    -y|--yes)    ASSUME_YES=1; shift;;
    --skip-nginx)    SKIP_NGINX=1; shift;;
    --skip-systemd)  SKIP_SYSTEMD=1; shift;;
    -h|--help)
      sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) echo "未知参数: $1" >&2; exit 1;;
  esac
done

log() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m错误:\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- 交互与依赖安装 ----------
# 询问是否安装某组件（stdin 可能是管道，故从 /dev/tty 读；--yes 或无法交互时自动同意）
ask_install() {
  [ "$ASSUME_YES" -eq 1 ] && return 0
  local ans
  if ! { printf '\033[1;33m ? \033[0m 未安装 %s，是否自动安装？[Y/n] ' "$1" > /dev/tty 2>/dev/null \
      && read -r ans < /dev/tty; }; then
    return 0 # 无终端可交互（如 CI），按同意处理
  fi
  case "$ans" in [Nn]*) return 1;; *) return 0;; esac
}

APT_UPDATED=0
apt_install() {
  command -v apt-get >/dev/null || die "自动安装依赖仅支持 Debian/Ubuntu（apt-get），请手动安装后重试"
  if [ "$APT_UPDATED" -eq 0 ]; then
    log "apt-get update"
    apt-get update -y
    APT_UPDATED=1
  fi
  DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
}

# 确保命令存在：缺失时询问并安装对应的 apt 包；$1 命令名，$2 apt 包名，$3 展示名
ensure_cmd() {
  command -v "$1" >/dev/null && return 0
  ask_install "${3:-$1}" || die "缺少 ${3:-$1}，请手动安装后重试（或用 -y 自动安装）"
  log "安装 ${3:-$1}"
  apt_install "${2:-$1}"
  command -v "$1" >/dev/null || die "${3:-$1} 安装后仍不可用，请检查"
}

# ---------- 前置检查 ----------
[ "$(id -u)" -eq 0 ] || die "请用 root 运行：curl ... | sudo bash 或 sudo bash deploy/install.sh"

# ---------- 项目仓库检测 / 自举 ----------
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd || pwd)
if [ ! -f "$REPO_DIR/server/package.json" ]; then
  REPO_DIR=$REPO_CLONE_DIR
  if [ -d "$REPO_DIR/.git" ]; then
    log "检测到已克隆的仓库 $REPO_DIR，拉取最新代码"
    ensure_cmd git git "git"
    git -C "$REPO_DIR" pull --ff-only
  elif [ -f "$REPO_DIR/server/package.json" ]; then
    log "使用已有源码目录 $REPO_DIR"
  else
    log "未检测到项目仓库，从 GitHub 获取源码到 $REPO_DIR"
    if command -v git >/dev/null; then
      git clone --depth 1 "$GITHUB_REPO.git" "$REPO_DIR"
    else
      # 无 git 时退化为下载 tarball（需要 curl 或 wget）
      if command -v curl >/dev/null; then
        FETCH="curl -fsSL $GITHUB_REPO/archive/refs/heads/main.tar.gz"
      elif command -v wget >/dev/null; then
        FETCH="wget -qO- $GITHUB_REPO/archive/refs/heads/main.tar.gz"
      else
        ensure_cmd curl curl "curl"
        FETCH="curl -fsSL $GITHUB_REPO/archive/refs/heads/main.tar.gz"
      fi
      mkdir -p "$REPO_DIR"
      $FETCH | tar xz --strip-components=1 -C "$REPO_DIR"
    fi
  fi
  [ -f "$REPO_DIR/server/package.json" ] || die "源码获取失败：$REPO_DIR 下未找到 server/package.json"
fi

# ---------- 基础依赖 ----------
ensure_cmd node nodejs "Node.js"
ensure_cmd npm npm "npm"
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/^v//; s/\..*$//')
[ "${NODE_MAJOR:-0}" -ge 18 ] 2>/dev/null || die "Node.js 版本过低（$(node -v)，需要 >= 18），建议通过 NodeSource 安装新版后重试"
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
  ensure_cmd nginx nginx "nginx"
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

# ---------- 穿透客户端二进制（可选，装到 PATH 后面板默认可用） ----------
# frp：GitHub 发布页下载对应架构的 tarball，只装 frpc
if ! command -v frpc >/dev/null; then
  if ask_install "frp（frpc 客户端，v$FRP_VERSION）"; then
    log "安装 frpc v$FRP_VERSION"
    case "$(uname -m)" in
      x86_64)        FRP_ARCH=amd64;;
      aarch64|arm64) FRP_ARCH=arm64;;
      *) die "暂不支持的架构 $(uname -m)，请手动安装 frp 后在设置页配置 frpc 路径";;
    esac
    ensure_cmd curl curl "curl"
    TMP_DIR=$(mktemp -d)
    curl -fsSL "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_linux_${FRP_ARCH}.tar.gz" -o "$TMP_DIR/frp.tar.gz"
    tar xzf "$TMP_DIR/frp.tar.gz" -C "$TMP_DIR"
    install -m 0755 "$TMP_DIR/frp_${FRP_VERSION}_linux_${FRP_ARCH}/frpc" /usr/local/bin/frpc
    rm -rf "$TMP_DIR"
  else
    echo "  跳过 frpc 安装（可稍后在面板「设置」中配置 frpc 路径）"
  fi
fi

# ngrok：官方 apt 源（参考 https://ngrok.com/docs/getting-started/）
if ! command -v ngrok >/dev/null; then
  if ask_install "ngrok（官方 apt 源）"; then
    log "安装 ngrok（官方 apt 源）"
    ensure_cmd curl curl "curl"
    curl -fsSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc | tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
    echo "deb https://ngrok-agent.s3.amazonaws.com buster main" > /etc/apt/sources.list.d/ngrok.list
    apt_install ngrok
  else
    echo "  跳过 ngrok 安装（可稍后在面板「设置」中配置 ngrok 路径）"
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
[ "$REPO_DIR" = "$REPO_CLONE_DIR" ] && echo "  源码: $REPO_DIR（日后升级可 git -C $REPO_CLONE_DIR pull 后重跑本脚本）"
echo "  首次访问请创建管理员账号。日志: journalctl -u transout -f"

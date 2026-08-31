#!/bin/bash
# ==============================================================================
# 🚀 POST4EX GOOGLE CLOUD SHELL 1-STEP PROVISIONER & SETUP
# ==============================================================================

set -e

GREEN="\033[32m"; CYAN="\033[36m"; YELLOW="\033[33m"; RED="\033[31m"; BOLD="\033[1m"; RESET="\033[0m"

echo -e "\n${BOLD}==========================================================================${RESET}"
echo -e "⚡ ${BOLD}POST4EX GOOGLE CLOUD SHELL PROVISIONER${RESET}"
echo -e "${BOLD}==========================================================================${RESET}\n"

# 1. Download & Extract Project
mkdir -p "$HOME/POST4EX"
cd "$HOME"

echo -e "📦 ${BOLD}[1/5] Downloading POST4EX Project Files...${RESET}"
curl -# -L "https://dev.post4ex.in/post4ex-bundle.tar.gz" -o /tmp/post4ex-bundle.tar.gz
echo -e "📂 Extracting files to $HOME/POST4EX..."
tar -xzf /tmp/post4ex-bundle.tar.gz -C "$HOME/POST4EX"
rm -f /tmp/post4ex-bundle.tar.gz

PROJECT_ROOT="$HOME/POST4EX"
cd "$PROJECT_ROOT"

# 2. Setup Persistent Python Virtual Environment
echo -e "\n🐍 ${BOLD}[2/5] Setting up Persistent Python Virtual Environment (.venv)...${RESET}"
python3 -m venv "$PROJECT_ROOT/.venv"
"$PROJECT_ROOT/.venv/bin/pip" install --upgrade pip setuptools wheel --quiet
"$PROJECT_ROOT/.venv/bin/pip" install -r "$PROJECT_ROOT/requirements.txt" --quiet
echo -e "  ✅ Python Virtual Environment & Requirements Installed!"

# 3. Setup Persistent Node Global Directory & Microservices
echo -e "\n📦 ${BOLD}[3/5] Installing Frontend & Microservice Dependencies...${RESET}"
if [ -d "$PROJECT_ROOT/WP" ]; then
    echo -e "  • Installing WP (WhatsApp) dependencies..."
    (cd "$PROJECT_ROOT/WP" && npm install --quiet)
fi

# 4. Setup Cloud Shell Auto-Persistence Hook (.customize_environment)
echo -e "\n⚙️ ${BOLD}[4/5] Configuring Google Cloud Shell Auto-Persistence...${RESET}"
cat << 'HOOK_EOF' > "$HOME/.customize_environment"
#!/bin/sh
# Auto-install packages on Cloud Shell container boot
apt-get update -qq
apt-get install -y -qq nginx lsof jq net-tools curl git
HOOK_EOF
chmod +x "$HOME/.customize_environment"
echo -e "  ✓ Created $HOME/.customize_environment hook"

# 5. Configure Aliases & CLI Orchestrator
echo -e "\n🐚 ${BOLD}[5/5] Configuring System Shortcuts & Aliases...${RESET}"
mkdir -p "$HOME/.local/bin"

cat << 'LAUNCHER_EOF' > "$HOME/.local/bin/post4ex"
#!/bin/bash
PROJECT_ROOT="$HOME/POST4EX"
PYTHON_BIN="$PROJECT_ROOT/.venv/bin/python"
LOG_DIR="/tmp/post4ex_logs"
PID_DIR="/tmp/post4ex_pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

case "$1" in
    start|"")
        echo -e "⚡ Starting POST4EX Backend on Port 8000..."
        pkill -9 -f "app:app.*8000" 2>/dev/null || true
        cd "$PROJECT_ROOT/FASTAPI/core"
        setsid "$PYTHON_BIN" -u -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload </dev/null >> "$LOG_DIR/fastapi.log" 2>&1 &
        echo "$!" > "$PID_DIR/fastapi.pid"
        echo -e "✅ FastAPI running on Port 8000!"
        ;;
    stop)
        echo -e "🛑 Stopping POST4EX services..."
        pkill -9 -f "app:app.*8000" 2>/dev/null || true
        pkill -9 -f "uvicorn" 2>/dev/null || true
        echo -e "✅ Stopped."
        ;;
    status)
        echo -e "📊 Backend Port 8000: $(pgrep -f 'app:app.*8000' >/dev/null && echo 'RUNNING 🟢' || echo 'STOPPED 🔴')"
        ;;
    logs)
        tail -n 50 -f "$LOG_DIR/fastapi.log"
        ;;
    *)
        echo "Usage: post4ex {start|stop|status|logs}"
        ;;
esac
LAUNCHER_EOF
chmod +x "$HOME/.local/bin/post4ex"

grep -q "alias post4ex" "$HOME/.bashrc" 2>/dev/null || cat << 'BASHRC_EOF' >> "$HOME/.bashrc"

# === ⚡ POST4EX Shortcuts ===
export PATH="$HOME/.local/bin:$PATH"
alias post4ex="$HOME/.local/bin/post4ex"
alias logs="tail -n 50 -f /tmp/post4ex_logs/fastapi.log"
BASHRC_EOF

echo -e "\n${GREEN}══════════════════════════════════════════════════════════════════════════${RESET}"
echo -e "   🎉 ${BOLD}POST4EX PROVISIONING COMPLETE ON GOOGLE CLOUD SHELL!${RESET}"
echo -e "${GREEN}══════════════════════════════════════════════════════════════════════════${RESET}"
echo -e "  👉 Start Backend:    ${CYAN}post4ex start${RESET}"
echo -e "  👉 Check Status:     ${CYAN}post4ex status${RESET}"
echo -e "  👉 Stream Logs:      ${CYAN}logs${RESET}"
echo -e "${GREEN}══════════════════════════════════════════════════════════════════════════${RESET}\n"

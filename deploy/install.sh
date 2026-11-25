#!/bin/bash
# Instala BoostKit en el host de Klipper (Raspberry Pi con Moonraker + nginx).
#   ./install.sh                 -> descarga la última release de GitHub
#   ./install.sh ruta/al.zip     -> instala un zip local (p.ej. el de `npm run build` + zip)
# Deja: ~/klipper-boostkit (web), sitio nginx en :82, entrada en el menú de Mainsail
# (.theme/navi.json) y el bloque [update_manager klipper-boostkit] para actualizar
# desde Mainsail/Fluidd.
set -euo pipefail
REPO="aorizondo/Klipper-BoostKit"
DEST="$HOME/klipper-boostkit"
CFG="${PRINTER_CONFIG:-$HOME/printer_data/config}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PORT=82

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
if [ $# -ge 1 ]; then
  cp "$1" "$tmp/bk.zip"
else
  url=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep -o '"browser_download_url": *"[^"]*\.zip"' | head -1 | cut -d'"' -f4)
  [ -n "$url" ] || { echo "ERROR: no release zip found in $REPO"; exit 1; }
  curl -fsSL "$url" -o "$tmp/bk.zip"
fi
rm -rf "$DEST"; mkdir -p "$DEST"
unzip -q "$tmp/bk.zip" -d "$DEST"
echo "web -> $DEST"

sed "s#__ROOT__#$DEST#" "$HERE/nginx-boostkit.conf" | sudo tee /etc/nginx/sites-available/boostkit >/dev/null
sudo ln -sf /etc/nginx/sites-available/boostkit /etc/nginx/sites-enabled/boostkit
sudo nginx -t && sudo systemctl reload nginx
echo "nginx -> http://$(hostname).local:$PORT"

# Menú lateral de Mainsail (Fluidd no admite enlaces propios: marcador del navegador).
mkdir -p "$CFG/.theme"
python3 - "$CFG/.theme/navi.json" "http://$(hostname).local:$PORT" <<'EOF'
import json, os, sys
path, href = sys.argv[1], sys.argv[2]
items = json.load(open(path)) if os.path.exists(path) else []
items = [i for i in items if i.get("title") != "BoostKit"]
items.append({"title": "BoostKit", "href": href, "target": "_blank", "position": 25,
              "icon": "M12 2L2 21h20L12 2zm0 5.5l6.2 11.5H5.8L12 7.5z"})
json.dump(items, open(path, "w"), indent=2)
print("mainsail menu ->", path)
EOF

MOON="$CFG/moonraker.conf"
if ! grep -q '^\[update_manager klipper-boostkit\]' "$MOON" 2>/dev/null; then
  cat >> "$MOON" <<EOF

[update_manager klipper-boostkit]
type: web
channel: stable
repo: $REPO
path: ~/klipper-boostkit
EOF
  echo "moonraker.conf: added [update_manager klipper-boostkit] (restart moonraker)"
fi
echo "OK"

#!/usr/bin/env bash
# Setup .env for local development with the running LSP node
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$DEMO_DIR/../../.." && pwd)"

cd "$REPO_ROOT"

# Get node1 gRPC port
NODE1_PORT=$(docker compose port lightning-node1 4000 2>/dev/null | sed 's/0.0.0.0://')
if [ -z "$NODE1_PORT" ]; then
  echo "Error: lightning-node1 is not running. Start it with: docker compose up -d"
  exit 1
fi

# Get node ID via gRPC using grpcurl
if command -v grpcurl &> /dev/null; then
  NODE_ID=$(grpcurl -plaintext "localhost:$NODE1_PORT" lightning_node.LightningNode/GetNodeInfo 2>/dev/null | grep -o '"nodeId": "[^"]*"' | cut -d'"' -f4)
fi

# Fallback: try to get from admin API
if [ -z "$NODE_ID" ]; then
  ADMIN1_PORT=$(docker compose port admin1 3000 2>/dev/null | sed 's/0.0.0.0://')
  if [ -n "$ADMIN1_PORT" ]; then
    # The admin renders node info in the page, try to extract it
    NODE_ID=$(curl -s "http://localhost:$ADMIN1_PORT" 2>/dev/null | grep -o '02[a-f0-9]\{64\}' | head -1)
  fi
fi

# Fallback: use the default from .env.example
if [ -z "$NODE_ID" ]; then
  echo "Warning: Could not fetch node ID automatically, using default from .env.example"
  NODE_ID="02889c662ac0608014e51146d14e47d510024463d35e502a959d3849ec0d1fbbf7"
fi

# Copy .env.example to .env and update values
cp "$DEMO_DIR/.env.example" "$DEMO_DIR/.env"

# Update node ID
sed -i.bak "s/MDK_LSP_NODE_ID=.*/MDK_LSP_NODE_ID=$NODE_ID/" "$DEMO_DIR/.env"
rm -f "$DEMO_DIR/.env.bak"

echo "Created $DEMO_DIR/.env with:"
echo "  MDK_LSP_NODE_ID=$NODE_ID"
echo ""
echo "You may need to update MDK_ACCESS_TOKEN and MDK_MNEMONIC for your setup."

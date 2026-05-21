#!/bin/bash


# ============================================================================
# Self-healing data directory initialization (migration-proof)
# Ensures persistent data directory exists even after HA migrations/restores
# ============================================================================
ADDON_SLUG="signalk-ha-bridge"  # matches config.yaml slug
DATA_DIR="./data"

# Create data directory if missing (happens after migrations)
if [[ ! -d "$DATA_DIR" ]]; then
  echo "Data directory missing (likely after migration) - creating ${DATA_DIR}"
  mkdir -p "$DATA_DIR"
  chmod 755 "$DATA_DIR"
fi

# Create minimal options.json if completely missing
# This prevents Supervisor errors when trying to write add-on options
if [[ ! -f "$DATA_DIR/options.json" ]]; then
  echo "options.json missing - creating empty file (you may need to reconfigure settings)"
  echo '{}' > "$DATA_DIR/options.json"
  chmod 644 "$DATA_DIR/options.json"
fi

echo "Data directory check complete"

# ============================================================================
# Get config from HA add-on options
# ============================================================================
CONFIG_PATH=$DATA_DIR"/options.json"
export SIGNALK_HOST=$(jq --raw-output '.signalk_host // empty ' $CONFIG_PATH)
export SIGNALK_PORT=$(jq --raw-output '.signalk_port // empty ' $CONFIG_PATH)
export MQTT_BROKER=$(jq --raw-output '.mqtt_broker // empty ' $CONFIG_PATH)
export MQTT_PORT=$(jq --raw-output '.mqtt_port // empty ' $CONFIG_PATH)
export MQTT_USERNAME=$(jq --raw-output '.mqtt_username // empty ' $CONFIG_PATH)
export MQTT_PASSWORD=$(jq --raw-output '.mqtt_password // empty ' $CONFIG_PATH)
export RAW_MODE=$(jq --raw-output '.raw_mode // false ' $CONFIG_PATH)

echo "SignalK Server: ${SIGNALK_HOST}:${SIGNALK_PORT}"
echo "MQTT Broker: ${MQTT_BROKER}:${MQTT_PORT}"
echo "Raw Mode: ${RAW_MODE}"

# Start the Node.js application
# cd /app

exec node src/index.js

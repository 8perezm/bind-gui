#!/bin/bash
# Create the external network if it doesn't exist
echo "Setting up Docker network..."
NETWORK_NAME="bind-dns-network"
if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
    echo "Creating network: $NETWORK_NAME"
    docker network create --driver bridge "$NETWORK_NAME"
else
    echo "✓ Network $NETWORK_NAME already exists"
fi

# Start BIND9 DNS server first
echo ""
echo "Starting BIND9 DNS server..."
cd bind
docker compose up -d

# Wait for BIND9 to be healthy
echo "Waiting for BIND9 to be healthy..."
timeout=60
elapsed=0
while [ $elapsed -lt $timeout ]; do
    health=$(docker inspect --format='{{.State.Health.Status}}' bind9 2>/dev/null)
    if [ "$health" = "healthy" ]; then
        echo "✓ BIND9 is healthy!"
        break
    fi
    echo "  Waiting... ($elapsed/$timeout seconds) [Status: $health]"
    sleep 5
    elapsed=$((elapsed + 5))
done

if [ $elapsed -ge $timeout ]; then
    echo "✗ BIND9 failed to become healthy in time"
    exit 1
fi

# Go back to root and start bind-gui
echo ""
echo "Starting BIND DNS GUI..."
cd ..
docker compose up -d

echo ""
echo "✓ All services started!"
echo ""
echo "Services:"
echo "  - BIND9 DNS running on ports 53/tcp and 53/udp"
echo "  - BIND DNS GUI running"

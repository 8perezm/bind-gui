# Development

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- A running BIND9 container (or use the compose setup)

## Local Setup

```bash
cd bind-gui
npm install
```

Create `bind-gui/.env.local`:

```env
AUTH_SECRET=dev-secret-change-me
ADMIN_USERNAME=admin
ADMIN_PASSWORD=password
CONFIG_DIR=../bind/config
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

> **Note:** The development server runs on port **3001** (not the Next.js default 3000).

## Testing Dynamic Updates

Once the stack is running, you can test the nsupdate + rndc integration manually:

### Manual nsupdate test

```bash
# Create a test script
cat > /tmp/test-update.txt << 'EOF'
server bind9
zone test.example.com
update add test.example.com 3600 IN A 192.168.1.100
send
EOF

# Run it from inside the bind-gui container
docker compose exec bind-gui nsupdate -k /etc/bind/bind-gui.key -v /tmp/test-update.txt
```

### Manual rndc test

```bash
# Check zone status
docker compose exec bind-gui rndc -s bind9 zonestatus test.example.com

# List all zones
docker compose exec bind-gui rndc -s bind9 status

# Add a zone manually
docker compose exec bind-gui rndc -s bind9 addzone test2.example.com \
  '{ type master; file "/etc/bind/db.test2.example.com"; allow-update { key "bind-gui-key"; }; };'
```

### Viewing BIND logs

```bash
docker compose logs bind9 | tail -50
```

Look for `updating zone` messages to confirm nsupdate transactions are being accepted.

## Project Structure

```
bind-dns-gui/
├── bind/                    # BIND DNS server configuration
│   ├── config/              # Zone files and named.conf
│   └── compose.yaml         # BIND-only Docker Compose
├── bind-gui/                # Next.js web application
│   ├── app/                 # Next.js App Router pages & API routes
│   │   ├── (protected)/     # Authenticated pages (zone list, editor, config)
│   │   ├── api/             # API routes (auth, zones, config, version)
│   │   └── login/           # Login page
│   ├── components/          # Reusable React components
│   │   └── ui/              # Base UI primitives (button, dialog, etc.)
│   ├── lib/                 # Core utilities
│   │   ├── dnsParser.ts     # Zone file parser/serializer
│   │   ├── dnsTypes.ts      # TypeScript types for DNS records
│   │   ├── fileSystem.ts    # Config file I/O
│   │   ├── authOptions.ts   # NextAuth configuration
│   │   ├── restartContainer.ts  # Docker container restart via API (optional)
│   │   ├── rndc.ts          # rndc addzone/delzone/zonestatus wrapper
│   │   ├── nsupdate.ts      # nsupdate (RFC 2136) transaction wrapper
│   │   ├── dnsDiff.ts       # Record diff engine for nsupdate operations
│   │   └── utils.ts         # Shared utilities
│   ├── Dockerfile           # Multi-stage production build
│   └── package.json
├── compose.yaml             # Combined BIND9 + GUI deployment
├── docs/                    # Documentation
└── README.md
```

## Building for Production

```bash
cd bind-gui
npm run build
```

This produces a standalone build in `bind-gui/.next/standalone/`.

## Linting

```bash
cd bind-gui
npm run lint
```

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
│   │   ├── restartContainer.ts  # Docker container restart via API
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

# Architecture

## Overview

Bind DNS GUI is a containerized web application that provides a graphical interface for managing BIND9 DNS zone files. It runs alongside a standard BIND9 server and edits zone files directly on the filesystem.

```
┌──────────────┐      ┌──────────────────┐
│   Browser    │─────▶│  bind-gui (Next.js) │
│  :3001       │      │  :3001            │
└──────────────┘      └────────┬─────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Docker Socket       │
                    │  /var/run/docker.sock│
                    └──────────┬──────────┘
                               │ POST /containers/bind9/restart
                    ┌──────────▼──────────┐
                    │  bind9 (ISC BIND)   │
                    │  :53 (UDP/TCP)      │
                    └──────────┬──────────┘
                               │ reads
                    ┌──────────▼──────────┐
                    │  ./bind/config/      │
                    │  named.conf          │
                    │  db.* zone files     │
                    └─────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15 (App Router) + TypeScript |
| **Styling** | Tailwind CSS + shadcn/ui primitives |
| **Authentication** | next-auth v4 (Credentials provider, JWT sessions) |
| **DNS Parsing** | Custom parser in `lib/dnsParser.ts` |
| **Container Management** | Docker Engine API via Unix socket (`lib/restartContainer.ts`) |
| **Runtime** | Node.js 20 (Alpine Linux container) |
| **DNS Server** | ISC BIND 9.18 |

## Key Design Decisions

### Filesystem-Based Management

The GUI reads and writes BIND zone files directly on the filesystem. This means:
- No database required — your zone files **are** the source of truth
- Compatible with existing BIND setups — just point it at your config directory
- Changes are immediately visible to BIND after container restart

### Docker Socket Integration

After saving zone changes, the GUI restarts the BIND9 container via the Docker Engine API. This eliminates the need for `rndc` configuration or SSH access into the BIND container.

### Authentication

Authentication uses next-auth with a credentials provider. Sessions are managed via JWTs stored in encrypted cookies — no database needed.

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/zones` | `GET` | List all zone files |
| `/api/zones/[filename]` | `GET` | Get a zone file's parsed records |
| `/api/zones/[filename]` | `PUT` | Save updated records to a zone file |
| `/api/config/files` | `GET` | List config files (named.conf, etc.) |
| `/api/version` | `GET` | Get application version |
| `/api/auth/[...nextauth]` | `POST` | Authentication endpoints |

## Design System

- **Typography:** Manrope (body), Space Grotesk (headings), Patua One (logo), JetBrains Mono (technical)
- **Colors:** Pure black (`#000000`) and white (`#FFFFFF`) — no accent colors
- **Corners:** Zero border-radius — sharp 90° angles throughout
- **Transitions:** Instant (max 100ms) or none
- **Hover Effects:** Black ↔ White inversions with line-based visual system

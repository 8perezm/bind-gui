# Architecture

## Overview

Bind DNS GUI is a containerized web application that provides a graphical interface for managing BIND9 DNS zones. It runs alongside a standard BIND9 server and communicates with it over the network using standard protocols — not by editing files directly.

```
┌──────────────┐      ┌──────────────────────────┐
│   Browser    │─────▶│  bind-gui (Next.js)       │
│  :3001       │      │  :3001                    │
└──────────────┘      └──────────┬───────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Record edits via        │
                    │  nsupdate (RFC 2136)     │
                    │  TSIG auth (RFC 2845)    │
                    │  Port 53/TCP             │
                    │                           │
                    │  Zone lifecycle via       │
                    │  rndc addzone/delzone     │
                    │  Port 953/TCP             │
                    │                           │
                    │  Statistics via HTTP JSON │
                    │  statistics-channels API  │
                    │  Port 8953/TCP            │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  bind9 (ISC BIND)       │
                    │  :53 (UDP/TCP)          │
                    │  :953 (TCP, controls)   │
                    │  :8953 (TCP, stats)     │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  ./bind/config/          │
                    │  named.conf              │
                    │  db.* zone files (static)│
                    │  bind-gui.key (TSIG)     │
                    │  *.jnl (dynamic journal) │
                    └─────────────────────────┘
```

### How It Works

1. You log into the web GUI and edit your DNS records in a table-based editor.
2. The GUI computes a diff between the current records and your changes.
3. The diff is sent as an **nsupdate (RFC 2136)** transaction — a DNS UPDATE message authenticated with a **TSIG key (RFC 2845)** shared between the containers.
4. BIND9 applies the transaction: it journals the change, auto-bumps the SOA serial, and (with DNSSEC inline-signing enabled) re-signs the zone automatically.
5. For **zone create / delete** operations, the GUI calls `rndc addzone` / `rndc delzone` over port 953 — no files are edited, no container is restarted.
6. Zone files remain on disk as the static source of truth; dynamic journal files (`.jnl`) capture incremental changes.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15 (App Router) + TypeScript |
| **Styling** | Tailwind CSS + shadcn/ui primitives |
| **Authentication** | next-auth v4 (Credentials provider, JWT sessions) |
| **DNS Parsing** | Custom parser in `lib/dnsParser.ts` |
| **Dynamic Updates** | `nsupdate` (RFC 2136) with TSIG (RFC 2845) via Alpine `bind-tools` |
| **Zone Lifecycle** | `rndc addzone / delzone / modzone` over TCP/953 |
| **Statistics** | BIND statistics-channels JSON API (`lib/stats.ts`) over HTTP port 8953 |
| **Container Management** | Docker Engine API via Unix socket (optional fallback, `lib/restartContainer.ts`) |
| **Runtime** | Node.js 20 (Alpine Linux container) |
| **DNS Server** | ISC BIND 9.18 |

## Key Design Decisions

### Dynamic Updates via RFC 2136 (nsupdate)

The GUI does **not** write zone files for record edits. Instead, it sends DNS UPDATE messages (RFC 2136) authenticated with a shared TSIG key (RFC 2845). This means:

- **No container restart needed** — BIND applies the update on the fly
- **Automatic SOA serial bump** — BIND handles serial management
- **DNSSEC-safe** — with `inline-signing yes`, BIND re-signs the zone automatically after each nsupdate
- **Journaled** — each change is written to a `.jnl` journal file before being applied to the in-memory zone

### Zone Lifecycle via rndc

Zone create / delete / option-change operations go through `rndc addzone` / `delzone` / `modzone`:

- No modification of `named.conf.local` — BIND persists the zone config in its own state
- No container restart — changes take effect immediately
- `rndc freeze / thaw` available for bulk-import or manual override scenarios

### Hybrid Storage Model

- **Static zone files** (`db.<domain>`) are the initial source of truth, created when a zone is first defined
- **Record edits** are handled dynamically via nsupdate — the static file is read but never overwritten
- **Journal files** (`db.<domain>.jnl`) capture the incremental change log between the static file and the live zone

### Authentication

Authentication uses next-auth with a credentials provider. Sessions are managed via JWTs stored in encrypted cookies — no database needed.

## API Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/zones` | `GET` | Yes | List all zone files with parsed record counts |
| `/api/zones` | `POST` | Yes | Create a new zone (writes file + `rndc addzone`) |
| `/api/zones/[filename]` | `GET` | Yes | Get a zone's parsed records and metadata |
| `/api/zones/[filename]` | `PUT` | Yes | Diff+nsupdate records (RFC 2136) |
| `/api/zones/[filename]` | `DELETE` | Yes | Delete a zone (`rndc delzone` + remove file) |
| `/api/zones/[filename]/dnssec` | `GET` | Yes | Get zone DNSSEC status + DS/CDS/CDNSKEY records |
| `/api/zones/[filename]/dnssec` | `POST` | Yes | Enable/disable DNSSEC inline-signing (`{ action: "enable" | "disable" }`) |
| `/api/config/files` | `GET` | Yes | List config files (named.conf, etc.) |
| `/api/version` | `GET` | Yes | Get application version |
| `/api/auth/[...nextauth]` | `POST` | No | NextAuth authentication endpoints |
| `/api/stats` | `GET` | Yes | Server statistics bundle: `rndc status` + statistics-channels data |

## Design System

- **Typography:** Manrope (body), Space Grotesk (headings), Patua One (logo), JetBrains Mono (technical)
- **Colors:** Pure black (`#000000`) and white (`#FFFFFF`) — no accent colors
- **Corners:** Zero border-radius — sharp 90° angles throughout
- **Transitions:** Instant (max 100ms) or none
- **Hover Effects:** Black ↔ White inversions with line-based visual system

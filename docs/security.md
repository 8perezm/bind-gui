# Security

## Authentication

Bind DNS GUI uses a simple, credential-based authentication system:

- Username and password are set via environment variables (`ADMIN_USERNAME`, `ADMIN_PASSWORD`)
- Sessions use JWT tokens encrypted with `AUTH_SECRET`
- No user registration — credentials are configured at deployment time
- All routes except `/login` and `/api/auth/*` are protected by NextAuth middleware
- All API write operations (POST, PUT, DELETE) validate the session server-side

## TSIG Authentication (RFC 2845)

Record edits and zone lifecycle operations use **Transaction Signatures (TSIG)** to authenticate DNS UPDATE messages and rndc commands.

### Shared Key

A single HMAC-SHA256 key (`bind-gui-key`) is shared between the bind9 and bind-gui containers:

- **Generated at deploy time** with `tsig-keygen -a hmac-sha256 bind-gui-key`
- **Stored in** `bind/config/bind-gui.key` — mounted read-only into both containers
- **Excluded from version control** (`.gitignore` entry added automatically)
- **Referenced by name** in BIND's `controls` block and each zone's `allow-update` policy

### Key Rotation

To rotate the TSIG key:

```bash
# 1. Generate a new key
docker compose run --rm bind9 tsig-keygen -a hmac-sha256 bind-gui-key > bind/config/bind-gui.key

# 2. Reload BIND so it picks up the new key
docker compose exec bind9 rndc reload

# 3. Restart the GUI container so it picks up the new key
docker compose restart bind-gui
```

> **Note:** This only affects future updates. Existing `.jnl` journal files remain valid because they reference the key name, not the key material.

### Network-Level Protection

The TSIG key provides cryptographic authentication of the DNS UPDATE message itself. Even if an attacker can reach port 53/TCP on the bind9 container, they cannot inject records without the key.

## Best Practices

### 1. Use a Strong AUTH_SECRET

Generate a strong random secret:

```bash
openssl rand -base64 32
```

### 2. Use a Strong Admin Password

Never use the default password in production. Set `ADMIN_PASSWORD` in your `.env` file.

### 3. Run Behind a Reverse Proxy

For production deployments, run behind a reverse proxy with HTTPS:

- **Nginx** — with SSL termination
- **Caddy** — automatic HTTPS
- **Traefik** — automatic HTTPS

Set `NEXTAUTH_URL` to the public HTTPS URL of your instance.

### 4. Network Isolation

In the combined Docker Compose setup, the GUI and BIND9 containers communicate over an isolated Docker network (`dns-net`). Only the necessary ports are exposed to the host.

#### Statistics Channel (Port 8953)

BIND's statistics-channels API is **not published to the host** — the port is only reachable from other containers on the `dns-net` network. This is intentional: the statistics channel has no authentication, so the Docker network boundary is the sole security control.

### 5. Docker Socket Access

The GUI container historically required the Docker socket to restart BIND after zone file changes. With the migration to nsupdate (RFC 2136) and rndc, the Docker socket is **no longer required** for zone writes. It is retained as an optional fallback for the version display endpoint and custom operations. If removed, all zone management continues to work via TSIG-authenticated DNS transactions.

### 6. File Permissions

BIND configuration files are mounted:
- **BIND container:** Read-write (`:rw`) — BIND needs to write `.jnl` journal files for dynamic zone updates
- **GUI container:** Read-write (`:rw`) — the GUI needs to write initial zone files on creation
- **TSIG key** (`bind-gui.key`) — mounted **read-only** (`:ro`) into both containers

### 7. API Authentication

All API routes except `/api/auth/*` (NextAuth's own endpoints) are protected by the NextAuth middleware. Write operations (POST, PUT, DELETE) additionally validate the session server-side via `getServerSession(authOptions)`.

## Known Considerations

- The authentication system is single-user (one admin account)
- No audit logging is currently implemented
- Credentials are validated server-side on each login attempt
- JWT sessions expire according to next-auth defaults

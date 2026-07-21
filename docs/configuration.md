# Configuration

## Environment Variables

The Bind DNS GUI is configured entirely through environment variables. Create a `.env` file alongside your `compose.yaml`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_SECRET` | **Yes** | — | Secret key for session encryption (generate with `openssl rand -base64 32`) |
| `ADMIN_USERNAME` | No | `admin` | Admin login username |
| `ADMIN_PASSWORD` | **Yes** | — | Admin login password |
| `NEXTAUTH_URL` | No | `http://localhost:3001` | Public URL of the GUI (change if behind a reverse proxy) |
| `CONFIG_DIR` | No | `/app/bind/config` | Path to BIND config files (inside the GUI container) |
| `BIND_RNDC_HOST` | No | `bind9` | Hostname of the BIND9 container for rndc connections (port 953) |
| `BIND_DNS_HOST` | No | `bind9` | Hostname of the BIND9 container for nsupdate connections (port 53/TCP) |
| `TSIG_KEY_FILE` | No | `/etc/bind/bind-gui.key` | Path to the TSIG key file for nsupdate and rndc authentication |

### Example `.env`

```env
AUTH_SECRET=your-secret-key-here-change-this
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-strong-password-here
NEXTAUTH_URL=http://localhost:3001
```

### TSIG Key Provisioning

After the first deployment, generate the TSIG key that allows the GUI to authenticate DNS UPDATE messages:

```bash
docker compose run --rm bind9 tsig-keygen -a hmac-sha256 bind-gui-key > bind/config/bind-gui.key
```

This creates `bind/config/bind-gui.key` which is automatically mounted into both containers. The file is excluded from Git via `.gitignore`.

## BIND Configuration Files

Place your BIND zone files and `named.conf` configuration inside `./bind/config/`. The expected structure:

```
bind/
└── config/
    ├── named.conf           # Main BIND configuration
    ├── named.conf.local     # Local zone declarations
    ├── named.conf.options   # BIND options
    ├── bind-gui.key         # TSIG key for nsupdate + rndc auth
    └── ...                  # db.<zone> files appear here as you create zones
```

The repo does **not** ship with any pre-existing zone files. `db.<zone>` files
are created on demand the first time you create a zone in the GUI (or when you
add a zone manually and write a file into this directory).

### Zone File Format

The GUI parses standard BIND zone file format. Each zone file should contain DNS records in the standard format:

```dns
$TTL 86400
@   IN  SOA ns1.example.com. admin.example.com. (
    2024010101   ; Serial
    3600         ; Refresh
    1800         ; Retry
    604800       ; Expire
    86400        ; Minimum TTL
)
@   IN  NS  ns1.example.com.
@   IN  A   192.168.1.10
www IN  A   192.168.1.10
mail IN  MX  10 mail.example.com.
```

## Reverse Proxy Setup

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name dns.example.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Make sure to set `NEXTAUTH_URL=https://dns.example.com` in your `.env`.

### Caddy

```caddy
dns.example.com {
    reverse_proxy bind-gui:3001
}
```

## Dynamic Updates (RFC 2136)

Record edits no longer require a container restart. The GUI sends **DNS UPDATE** messages to BIND9 via `nsupdate`, authenticated with a shared TSIG key:

- The update is applied immediately — no restart, no reload
- BIND auto-bumps the SOA serial
- Changes are journaled in `.jnl` files alongside the zone file
- With DNSSEC inline-signing enabled, BIND re-signs the zone automatically after each update

## Zone Lifecycle via rndc

Creating or deleting a zone uses `rndc addzone` / `delzone` over TCP/953:

- No `named.conf.local` edits — BIND manages its own state
- No container restart — the zone appears or disappears from the running server immediately
- Zone files are still written to disk (as static source of truth), but the running configuration is managed by BIND

### Manual rndc — always pass `-k`

When running `rndc` interactively inside the `bind-gui` container, **always
include `-k /etc/bind/bind-gui.key`** so it authenticates with the
`bind-gui-key` shared with BIND:

```bash
docker compose exec bind-gui rndc -s bind9 -k /etc/bind/bind-gui.key status
docker compose exec bind-gui rndc -s bind9 -k /etc/bind/bind-gui.key zonestatus example.com
```

Without `-k`, `rndc` falls back to its default key file and BIND will reject
the connection with `rndc: connection to remote host closed`. The GUI and
`scripts/migrate-to-dynamic.mjs` already pass `-k` automatically; only manual
commands need it.

## API Response Format

The PUT `/api/zones/[filename]` endpoint returns:

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether the update was accepted |
| `applied` | number | Number of nsupdate operations applied |
| `serial` | number \| null | New SOA serial after the update (if available) |

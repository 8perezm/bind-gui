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

## DNSSEC (inline-signing)

BIND 9 can sign zones automatically with **DNSSEC inline-signing**. When enabled, BIND generates and manages its own key material (ZSK + KSK), signs all records on-the-fly, and re-signs the zone automatically after each nsupdate transaction.

### Per-Zone Toggle

The GUI provides a per-zone toggle for inline-signing:

1. **During zone creation** — check "DNSSEC (inline-signing)" in the create-zone dialog.
2. **After creation** — open the zone, click the `[DNSSEC]` button in the toolbar, then flip the switch.

The toggle calls `rndc modzone` to update the running configuration, then freezes and thaws the zone to force an immediate sign cycle. No container restart is needed.

### Publishing the DS Record

Once inline-signing is enabled, BIND publishes **CDS and CDNSKEY** records in the zone automatically. The DNSSEC page in the GUI shows:

- **CDS** — Child DS record (a digest the parent can use directly)
- **CDNSKEY** — Child DNSKEY record (alternative mechanism)
- **DS Record** — computed by `dnssec-dsfromkey` from the zone's key files

**You must publish the DS record at your registrar** to complete the DNSSEC chain of trust. RFC 8078 (CDS/CDNSKEY → automatic DS update) is supported by some registrars but not all — check with yours.

### Manual Verification

Inside the `bind-gui` container you can verify DNSSEC status at any time:

```bash
rndc -s bind9 -k /etc/bind/bind-gui.key zonestatus example.com
dig @127.0.0.1 example.com SOA +dnssec
dig @127.0.0.1 example.com CDS +short
dnssec-dsfromkey example.com
```

### Further Reading

- [Debian BIND 9 Server Configuration](https://wiki.debian.org/BIND9) — comprehensive guide covering DDNS, DNSSEC, chroot, and more (config snippets apply to any distribution)
- [RFC 6781](https://datatracker.ietf.org/doc/html/rfc6781) — DNSSEC Operational Practices
- [RFC 7344](https://datatracker.ietf.org/doc/html/rfc7344) — CDS/CDNSKEY for automated DS updates
- [RFC 8078](https://datatracker.ietf.org/doc/html/rfc8078) — Managing DS Records via CDS/CDNSKEY

## API Response Format

The PUT `/api/zones/[filename]` endpoint returns:

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether the update was accepted |
| `applied` | number | Number of nsupdate operations applied |
| `serial` | number \| null | New SOA serial after the update (if available) |

# Configuration

## Environment Variables

The Bind DNS GUI is configured entirely through environment variables. Create a `.env` file alongside your `compose.yaml`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_SECRET` | **Yes** | — | Secret key for session encryption (generate with `openssl rand -base64 32`) |
| `ADMIN_USERNAME` | No | `admin` | Admin login username |
| `ADMIN_PASSWORD` | **Yes** | — | Admin login password |
| `NEXTAUTH_URL` | No | `http://localhost:3001` | Public URL of the GUI (change if behind a reverse proxy) |

### Example `.env`

```env
AUTH_SECRET=your-secret-key-here-change-this
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-strong-password-here
NEXTAUTH_URL=http://localhost:3001
```

## BIND Configuration Files

Place your BIND zone files and `named.conf` configuration inside `./bind/config/`. The expected structure:

```
bind/
└── config/
    ├── named.conf           # Main BIND configuration
    ├── named.conf.local     # Local zone declarations
    ├── named.conf.options   # BIND options
    ├── db.example.com       # Zone file for example.com
    ├── db.192.168.5         # Reverse zone file
    └── ...                  # Any other db.* zone files
```

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

## Container Restart Behaviour

After saving changes to a zone file through the GUI, the application automatically restarts the `bind9` container via the Docker socket to apply the changes. This requires the Docker socket to be mounted into the GUI container (`/var/run/docker.sock:ro`).

The API response includes two fields indicating the restart status:
- `containerRestarted` — `true` if the restart was successful
- `containerError` — error message if the restart failed

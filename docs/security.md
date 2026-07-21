# Security

## Authentication

Bind DNS GUI uses a simple, credential-based authentication system:

- Username and password are set via environment variables (`ADMIN_USERNAME`, `ADMIN_PASSWORD`)
- Sessions use JWT tokens encrypted with `AUTH_SECRET`
- No user registration — credentials are configured at deployment time
- All routes except `/login` and `/api/auth/...` are protected by NextAuth middleware

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

### 5. Docker Socket Access

The GUI container requires access to the Docker socket (`/var/run/docker.sock`) to restart the BIND9 container after zone file changes. This is mounted read-only (`:ro`) to limit potential abuse.

### 6. File Permissions

BIND configuration files are mounted:
- **BIND container:** Read-only (`:ro`) — BIND only needs to read zone files
- **GUI container:** Read-write (`:rw`) — the GUI needs to write zone file changes

## Known Considerations

- The authentication system is single-user (one admin account)
- No audit logging is currently implemented
- Credentials are validated server-side on each login attempt
- JWT sessions expire according to next-auth defaults

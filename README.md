<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/BIND9%20DNS%20GUI-000000?style=for-the-badge&logo=dns&logoColor=white">
    <img src="https://img.shields.io/badge/BIND9%20DNS%20GUI-FFFFFF?style=for-the-badge&logo=dns&logoColor=black" alt="Bind DNS GUI">
  </picture>
</p>

<h1 align="center">Bind DNS GUI</h1>

<p align="center">
  A minimalist web interface for your BIND9 DNS server.<br>
  Edit zone files, manage records, and keep your self-hosted infrastructure running smoothly.
</p>

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/-Quick%20Start-000000?style=flat-square" alt="Quick Start"></a>
  <a href="docs/configuration.md"><img src="https://img.shields.io/badge/-Configuration-000000?style=flat-square" alt="Configuration"></a>
  <a href="docs/architecture.md"><img src="https://img.shields.io/badge/-Architecture-000000?style=flat-square" alt="Architecture"></a>
  <a href="https://hub.docker.com/r/migsperez/bind-dns-gui"><img src="https://img.shields.io/badge/-Docker%20Hub-000000?style=flat-square" alt="Docker Hub"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/-MIT-000000?style=flat-square" alt="License"></a>
</p>

<p align="center">
  <img src="screenshot-1.png" alt="Bind DNS GUI Screenshot" width="800">
</p>

---

## ✨ Features

- **📝 Zone File Editor** — Edit `db.*` zone files with a clean, table-based UI. No more `vi` on the command line.
- **🔧 Record Management** — Add, edit, and delete DNS records: A, AAAA, CNAME, MX, TXT, PTR, NS, SOA.
- **📂 Config Viewer** — Browse `named.conf` and other BIND configuration files in read-only mode.
- **🔐 Authentication** — Password-protected access via environment variables. Simple, no database required.
- **♻️ Auto-Restart** — Saves your zone changes and automatically restarts BIND9 via Docker API.
- **🎨 Monochrome Design** — Clean, distraction-free black-and-white interface that means business.
- **🐳 Docker Native** — Ready-to-use Docker image on Docker Hub. Works with your existing BIND9 container.

---

## 🚀 Quick Start

Get up and running in under 2 minutes. You just need Docker.

### 1. Create a project directory

```bash
mkdir bind-dns-gui && cd bind-dns-gui
```

### 2. Create your BIND config directory

```bash
mkdir -p bind/config
```

Place your zone files into `bind/config/`.  
This repo includes sample configuration files (`named.conf`, `named.conf.options`, `named.conf.local`) and editable templates (`db.example.com`, `db.192.168.5`) to get you started — just tweak the domain names and IPs to match your network.

No zone files yet? The GUI will still work — start with the samples and create your zones from the web UI.

### 3. Create `compose.yaml`

```yaml
services:
  bind9:
    image: internetsystemsconsortium/bind9:9.18
    container_name: bind9
    restart: unless-stopped
    ports:
      - "53:53/udp"
      - "53:53/tcp"
    volumes:
      - ./bind/config:/etc/bind:ro
      - bind-cache:/var/cache/bind
    networks:
      - dns-net

  bind-gui:
    image: migsperez/bind-dns-gui:latest
    container_name: bind9-gui
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      - AUTH_SECRET=${AUTH_SECRET}
      - ADMIN_USERNAME=${ADMIN_USERNAME:-admin}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - NEXTAUTH_URL=http://localhost:3001
      - CONFIG_DIR=/app/bind/config
    volumes:
      - ./bind/config:/app/bind/config:rw
      - /var/run/docker.sock:/var/run/docker.sock:ro
    depends_on:
      bind9:
        condition: service_started
    networks:
      - dns-net

networks:
  dns-net:
    driver: bridge

volumes:
  bind-cache:
```

### 4. Configure environment variables

Copy the example file and edit it:

```bash
cp .env.example .env
```

Then fill in your values:

```env
AUTH_SECRET=$(openssl rand -base64 32)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme-to-something-strong
```

### 5. Start everything

```bash
docker compose up -d
```

### 6. Open the GUI

Visit [**http://localhost:3001**](http://localhost:3001) and log in with your credentials.

That's it. You now have a web UI for your DNS server.

### 7. Point your router at it

For your network to actually *use* this DNS server, configure your router's DHCP settings to hand out the IP of the machine running BIND9 as the primary DNS server. Every device on your network will then resolve domains through your own server — giving you full control over DNS records, local hostnames, and ad-blocking if you choose.

> **Tip:** Make sure the machine running BIND9 has a **static IP address** so it doesn't change after a router reboot.

---

## 📖 Documentation

| Topic | Description |
|-------|-------------|
| [Configuration](docs/configuration.md) | Environment variables, zone files, reverse proxy setup |
| [Architecture](docs/architecture.md) | How it works, tech stack, API routes, design system |
| [Security](docs/security.md) | Auth, best practices, network isolation |
| [Development](docs/development.md) | Local setup, project structure, building from source |

---

## 🐳 Docker Images

Pre-built images are available on Docker Hub:

```bash
docker pull migsperez/bind-dns-gui:latest
```

Images are tagged with:
- `latest` — latest stable release
- `v1.2.3` — full semantic version
- `1.2` — major.minor version

---

## 🧩 How It Works

1. You log into the web GUI and edit your DNS records in a spreadsheet-like table.
2. The GUI writes the changes directly to your BIND zone files on disk.
3. The GUI signals BIND9 to reload via the Docker API — no SSH, no `rndc`, no fuss.
4. Your DNS server picks up the changes immediately.

Your zone files remain plain text on disk — readable, backup-able, and portable. No lock-in.

---

## 📸 Screenshots

> *Screenshots coming soon.*

---

## 🤝 Contributing

Contributions are welcome! See [Development](docs/development.md) for local setup instructions.

---

## 📄 License

[MIT](LICENSE)

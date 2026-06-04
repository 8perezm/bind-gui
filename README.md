# Bind DNS GUI

A minimalist, monochrome web interface to edit BIND DNS configuration files with authentication.

## Features

- **Zone File Editor**: Edit `db.*` zone files with a clean table-based UI
- **Record Management**: Add, edit, and delete DNS records (A, AAAA, CNAME, MX, TXT, PTR, NS)
- **Config Viewer**: View named.conf and other config files in read-only mode  
- **Authentication**: Secure login with username/password from `.env`
- **Docker Support**: Full Docker Compose integration with BIND9

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose

### Development Setup

1. Navigate to the bind-gui directory:
   ```bash
   cd bind-gui
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env.local` file:
   ```env
   AUTH_SECRET=your-secret-key-here-change-this
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=password
   CONFIG_DIR=../bind/config
   ```

4. Run development server:
   ```bash
   npm run dev
   ```

5. Open http://localhost:3000

### Docker Deployment

Run both BIND9 and GUI together:

```bash
docker compose -f compose.yaml up --build
```

Access the GUI at http://localhost:3001

Default credentials: `admin` / `password` (change in `.env`)

## Architecture

- **Framework**: Next.js 15 (App Router) + TypeScript
- **Styling**: Tailwind CSS + Shadcn UI components  
- **Auth**: next-auth v4 (Credentials provider)
- **Design**: Minimalist Monochrome system with sharp corners, instant transitions, hover inversions

## File Structure

```
bind-dns-gui/
├── bind/                 # BIND DNS configuration
│   ├── config/           # Zone files and named.conf
│   └── compose.yaml      # Original BIND-only compose
├── bind-gui/             # Web application
│   ├── app/              # Next.js pages & API routes
│   ├── components/       # Reusable React components
│   ├── lib/              # Utilities (parser, auth, filesystem)
│   ├── Dockerfile        # Container build for GUI
│   └── package.json
├── compose.yaml     # Combined BIND + GUI deployment
└── README.md
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | Yes | Secret key for session encryption |
| `ADMIN_USERNAME` | No | Admin username (default: admin) |
| `ADMIN_PASSWORD` | No | Admin password (default: password) |
| `CONFIG_DIR` | No | Path to BIND config dir (default: ../bind/config) |

## Design System

- **Fonts**: Manrope (body), Space Grotesk (headings), Patua One (logo), JetBrains Mono (technical)  
- **Colors**: Pure black (#000000) and white (#FFFFFF) only, no accent colors
- **Corners**: Zero border radius everywhere (sharp 90° angles)
- **Transitions**: Instant (max 100ms) or none
- **Hover Effects**: Black ↔ White inversions with line-based visual system

## License

MIT

# Bind DNS GUI

A minimalist, monochrome web interface to edit BIND DNS configuration files with authentication.

## Features

- **Zone File Editor**: Edit `db.*` zone files with a clean table-based UI
- **Record Management**: Add, edit, and delete DNS records (A, AAAA, CNAME, MX, TXT, PTR, NS)
- **Config Viewer**: View named.conf and other config files in read-only mode  
- **Authentication**: Secure login with username/password from `.env`
- **Docker Support**: Full Docker Compose integration with BIND9

## Versioning

This project follows [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH).

### Version Display

The current version is displayed in the header of the web interface and can be accessed programmatically via the API:

```bash
curl http://localhost:3001/api/version
```

### Releasing a New Version

#### Option 1: Automatic (GitHub Actions - Recommended)

Use the **Version Bump** workflow in GitHub Actions:

1. Go to your repository on GitHub
2. Navigate to **Actions** → **Version Bump**
3. Click **Run workflow**
4. Select the bump type (patch/minor/major)
5. Click **Run workflow**

This will automatically:
- Update the version in `bind-gui/package.json`
- Commit the change to main
- Create and push a git tag (e.g., `v0.1.1`)
- Trigger the Docker image build with proper version tags

#### Option 2: Manual (Local Script)

Use the provided script to bump the version and create a git tag:

```bash
# Patch version bump (0.1.0 -> 0.1.1)
./scripts/version-bump.sh patch

# Minor version bump (0.1.0 -> 0.2.0)
./scripts/version-bump.sh minor

# Major version bump (0.1.0 -> 1.0.0)
./scripts/version-bump.sh major
```

This will:
1. Update the version in `bind-gui/package.json`
2. Create a git commit with the version change
3. Create a git tag (e.g., `v0.1.1`)

After running the script, push the changes and tags:

```bash
git push origin main --tags
```

### Docker Images

Docker images are automatically built and tagged when you push to main or create a version tag. The images are tagged as:
- `latest` (for main branch)
- `v1.2.3` (full semantic version from git tag)
- `1.2` (major.minor from git tag)
- Short SHA (for main branch commits)

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

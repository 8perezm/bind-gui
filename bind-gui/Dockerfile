FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Install bind-tools for nsupdate (RFC 2136) and other DNS client tools.
# Also install the `bind` package because on Alpine, the `rndc` binary is
# shipped in the `bind` server package, not in `bind-tools`. We don't
# actually run `named` here — we only need `rndc` for zone lifecycle
# (addzone/delzone/modzone) over TCP/953.
#
# IMPORTANT: the `bind` package's post-install runs `rndc-confgen -a` and
# drops a default /etc/bind/rndc.key (with a fresh random `rndc-key`) into
# the image. That file silently shadows our mounted
# /etc/bind/bind-gui.key whenever rndc is invoked WITHOUT `-k`, and BIND
# closes the connection with "connection to remote host closed" because
# the auth key doesn't match. We delete it immediately so the only
# key file left in /etc/bind/ is the bind-gui.key we mount at runtime.
# All rndc invocations in this project (lib/rndc.ts and
# scripts/migrate-to-dynamic.mjs) pass `-k ${TSIG_KEY_FILE}` explicitly.
RUN apk add --no-cache bind-tools bind \
    && rm -f /etc/bind/rndc.key

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/scripts ./scripts

EXPOSE 3001
ENV PORT=3001
CMD ["node", "server.js"]

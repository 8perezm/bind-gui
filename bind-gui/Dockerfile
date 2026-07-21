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

# Install bind-tools for nsupdate (RFC 2136) and rndc (zone lifecycle)
RUN apk add --no-cache bind-tools

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 3001
ENV PORT=3001
CMD ["node", "server.js"]

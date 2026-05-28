FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY game-server/ ./game-server/
COPY lib/ ./lib/
COPY shared/ ./shared/

ENV NODE_ENV=production
RUN npx esbuild game-server/index.ts --bundle --platform=node --packages=external --outdir=game-server/dist --tsconfig=tsconfig.json

FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /app/game-server/dist ./game-server/dist
COPY --from=builder /app/shared/data ./shared/data
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "game-server/dist/index.js"]

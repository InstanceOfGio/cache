# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 scarica un binario precompilato; questi servono solo se manca
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# scripts/ prima di npm ci: il postinstall genera htmx, icone e manifest
COPY scripts ./scripts
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev


FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    TZ=Europe/Rome \
    PORT=8080 \
    DATABASE_PATH=/data/cache.sqlite
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist        ./dist
COPY --from=build /app/static      ./static
COPY --from=build /app/package.json ./
RUN mkdir -p /data
EXPOSE 8080
CMD ["node", "dist/server.js"]

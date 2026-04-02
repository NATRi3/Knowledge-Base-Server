FROM node:22-alpine AS builder

# better-sqlite3 native compilation deps
RUN apk add --no-cache python3 make g++

# Corporate proxy SSL workaround
RUN npm config set strict-ssl false

WORKDIR /app

COPY package.json ./
COPY packages/server/package.json packages/server/
COPY packages/ui/package.json packages/ui/
COPY tsconfig.base.json ./

RUN npm install --workspace=packages/server --workspace=packages/ui

COPY packages/server packages/server
COPY packages/ui packages/ui

RUN npm run build -w packages/server
RUN npm run build -w packages/ui

# ---- Runtime ----
FROM node:22-alpine

# Runtime deps for better-sqlite3
RUN apk add --no-cache python3 make g++

# Corporate proxy SSL workaround
RUN npm config set strict-ssl false

WORKDIR /app

COPY package.json ./
COPY packages/server/package.json packages/server/
COPY packages/ui/package.json packages/ui/

RUN npm install --workspace=packages/server --omit=dev

# Remove build tools after install to keep image smaller
RUN apk del python3 make g++

COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/ui/dist packages/ui/dist

RUN mkdir -p /data

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000

EXPOSE 3000

CMD ["node", "packages/server/dist/index.js"]

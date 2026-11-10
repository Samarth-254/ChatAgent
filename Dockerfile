# Stage 1: Build Web App
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/
RUN npm install
RUN npm run build

# Stage 2: Production Server
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
COPY packages/ ./packages/
COPY apps/server/ ./apps/server/
COPY --from=builder /app/apps/web/dist ./apps/web/dist

RUN npm install --omit=dev

EXPOSE 3000
CMD ["npm", "start"]

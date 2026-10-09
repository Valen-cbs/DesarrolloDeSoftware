# ---------- Etapa 1: compilar TypeScript a JavaScript ----------
FROM node:24-alpine AS compilacion
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# ---------- Etapa 2: imagen final, liviana ----------
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=compilacion /app/dist ./dist
COPY api ./api
EXPOSE 3000
CMD ["node", "dist/index.js"]
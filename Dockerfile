# Clínica Fiscal — API + interface num só container (Node 24, Debian slim).
FROM node:24-slim AS build
WORKDIR /app
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY web/package.json web/package-lock.json ./web/
RUN npm --prefix web ci
COPY . .
RUN npx prisma generate && npm --prefix web run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3100 WEB_DIST=/app/web/dist
COPY --from=build /app/package.json /app/package-lock.json /app/prisma.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/web/dist ./web/dist
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Migrações pendentes primeiro; se falharem, o container não sobe com schema velho.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node --no-warnings src/api/main.ts"]

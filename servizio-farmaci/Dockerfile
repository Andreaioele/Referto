# Da costruire dalla radice del repository, perché servono anche i dati in farmaci/:
#   docker build -f servizio-farmaci/Dockerfile -t referto-servizio-farmaci .
FROM node:22-alpine AS build
WORKDIR /app/servizio-farmaci
COPY servizio-farmaci/package.json servizio-farmaci/package-lock.json ./
RUN npm ci
COPY servizio-farmaci/tsconfig.json servizio-farmaci/tsconfig.build.json ./
COPY servizio-farmaci/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app/servizio-farmaci
COPY --from=build /app/servizio-farmaci/node_modules ./node_modules
COPY --from=build /app/servizio-farmaci/dist ./dist
COPY servizio-farmaci/package.json ./
COPY servizio-farmaci/data ./data
# Stessa struttura del repository: config.ts cerca i dati in ../farmaci.
COPY farmaci/aifa_farmaci.json farmaci/normalizzazione.json /app/farmaci/
USER node
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://127.0.0.1:3000/salute || exit 1
CMD ["node", "dist/main.js"]

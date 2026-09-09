# Статика интерфейса и единая точка входа: браузер ходит только сюда, а
# запросы к API уходят внутрь сети compose. Так же устроен и прод — фронтенд
# и API живут на одном домене, поэтому куке сессии не нужен CORS.
FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci

COPY frontend frontend
RUN npm run build --workspace frontend

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80

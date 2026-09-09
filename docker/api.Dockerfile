# Сборка и запуск API. Прод-сервер разворачивается нативно (одна машина,
# SQLite файлом, файлы клиентов на диске) — этот образ существует для того,
# чтобы проект поднимался одной командой у любого, кто его склонировал.
FROM node:20-slim AS build
WORKDIR /app

# better-sqlite3 — нативный модуль: если под текущую платформу нет готовой
# сборки, npm компилирует его на месте, и без этих пакетов установка упадёт.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci

COPY backend backend
RUN npm run build --workspace backend

FROM node:20-slim AS runtime
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY backend/package.json backend/
COPY backend/drizzle backend/drizzle
COPY package.json ./
# Промпты агентов читаются с диска на каждый запуск, а не вшиты в код: их
# правят как обычные документы, не трогая приложение.
COPY prompts prompts

# Пути к базе, загрузкам и сгенерированному медиа считаются относительно
# рабочей директории — она должна быть именно backend/.
WORKDIR /app/backend
EXPOSE 3000

# Схема накатывается при старте: том с базой может быть пустым при первом
# запуске, а миграции идемпотентны.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]

# Система управления дежурством класса

Веб-приложение для класса: расписание дежурных, отметка статусов, замены, статистика,
месячные отчёты с выгрузкой в CSV и полный журнал изменений. Работает на Node.js без
внешних сервисов: SQLite локально, PostgreSQL на хостинге.

## Возможности

| Роль | Возможности |
| --- | --- |
| **Ученик** | Регистрация, личный кабинет «Моё дежурство», история своих статусов, смена пароля |
| **Староста** | Табло «Сегодня», назначение и удаление дежурств, отметка статусов, замены, календарь, ученики, табло показателей, отчёты, история |
| **Куратор** | Всё, что может староста, плюс архивирование учеников, управление ролями и блокировка аккаунтов, настройки класса |

Дополнительно: адаптивная вёрстка (десктоп/планшет/телефон), CSRF-защита, httpOnly-сессии,
scrypt-хеши паролей, журнал аудита каждого изменения, CSV-экспорт, собственный SVG-графики
без внешних библиотек.

## Технологии

- Backend: Node.js `node:sqlite` (встроенный модуль) или PostgreSQL, Express 4, `pg`
- Frontend: React 18, React Router 6, Vite 5, собственный CSS (без Tailwind/CSS-фреймворков)
- Графики: собственные SVG-компоненты (`src/components/Charts.jsx`)

## Быстрый старт

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm run db:migrate        # создать схему
npm run db:seed           # демо-класс, расписание, замены
npm run dev               # API :5000 + Vite :5173
```

Откройте http://localhost:5173 — Vite проксирует `/api` на backend.

### Демо-доступы (после `npm run db:seed`)

| Роль | Логин | Пароль |
| --- | --- | --- |
| Куратор | `kurator@school.uz` | `kurator123` |
| Староста | `starosta@school.uz` | `starosta123` |
| Ученик | `student2@school.uz` | `student123` |

## Команды

```bash
npm run dev          # backend + frontend в dev-режиме
npm run dev:server   # только API (:5000)
npm run dev:client   # только Vite (:5173)
npm run build        # production-сборка в dist/client
npm start            # production: API раздаёт dist/client
npm run preview      # локальный просмотр собранного клиента
npm run db:migrate   # применить миграции
npm run db:seed      # демо-данные
npm run db:reset     # пересоздать БД и заполнить демо-данными
npm run test:api     # 108 проверок API по всем ролям
```

## Переменные окружения

Скопируйте `.env.example` в `.env`.

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `PORT` | `5000` | порт backend |
| `NODE_ENV` | `development` | режим приложения |
| `DATABASE_URL` | — | PostgreSQL; если пусто — используется SQLite |
| `DATABASE_FILE` | `./data/dezhurstvo.db` | файл SQLite |
| `SESSION_SECRET` | — | **обязателен в production** (≥32 символа) |
| `APP_TIMEZONE` | `Asia/Tashkent` | часовой пояс приложения |
| `CODE_STAROSTA` | `STAR-2026` | код для роли староста при регистрации |
| `CODE_KURATOR` | `ADMIN-2026` | код для роли куратора при регистрации |
| `ALLOW_FIRST_KURATOR_BOOTSTRAP` | `true` | первый куратор регистрируется без кода |
| `CORS_ORIGINS` | — | список дополнительных origin через запятую |
| `VITE_API_URL` | — | базовый URL API, если фронтенд на другом домене |

## Развёртывание на Vercel

1. Подключите репозиторий в Vercel (фреймворк определяется автоматически, `vercel.json` уже настроен).
2. Задайте переменные окружения: `DATABASE_URL` (PostgreSQL — Neon/Supabase/Vercel Postgres),
   `SESSION_SECRET`, `NODE_ENV=production`.
3. Команда сборки `npm run build`, вывод `dist/client`, API — serverless-функция `api/index.js`.

Важно: SQLite на Vercel не подходит (файловая система эфемерна) — используйте PostgreSQL.
Миграции выполняются автоматически при первом запросе к serverless-функции.

## Структура

```
api/index.js              serverless entry для Vercel
server/
  app.js                  сборка Express-приложения
  index.js                обычный запуск сервера
  middleware.js           сессии, CSRF, RBAC, ошибки
  config.js               конфигурация из env
  db/                     драйвер БД, schema.sql, миграции, seed
  lib/                    auth, даты, константы, статистика, аудит
  routes/                 auth, students, duties, replacements,
                          statistics, reports, auditLogs, settings, users
src/
  App.jsx                 маршруты и гварды ролей
  components/             Layout, UI-kit, графики, модалки, тосты, иконки
  context/AuthContext.jsx глобальное состояние пользователя
  lib/api.js              HTTP-клиент (cookie-сессии + CSRF)
  pages/                  Landing, Auth, Dashboard, TodayBoard, MyDuties,
                          Schedule, Students, StudentDetail, Board, Reports,
                          Replacements, History, Settings, Profile, NotFound
scripts/test-api.js       автотесты API
```

## API (основное)

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`,
  `POST /api/auth/password`, `GET /api/settings`, `PATCH /api/settings`
- `GET|POST /api/students`, `GET|PATCH|DELETE /api/students/:id`,
  `GET /api/students/:id/history`, `POST /api/students/:id/restore`, `POST /api/students/:id/link`
- `GET /api/duties/today|month|mine`, `GET /api/duties/date/:date`, `POST|PATCH|DELETE /api/duties/:id`,
  `POST /api/duties/:id/status`, `POST /api/duties/bulk`, `POST /api/duties/generate`
- `GET|POST /api/replacements`, `DELETE /api/replacements/:id`
- `GET /api/statistics`, `GET /api/reports/month|months|export`, `GET /api/audit-logs`
- `GET /api/users`, `PATCH /api/users/:id/role`, `PATCH /api/users/:id/status`

## Безопасность

- Пароли: `scrypt` + соль, хеш в БД, сравнение постоянного времени.
- Сессии: случайный ID в httpOnly-cookie (`SameSite=Lax`, `Secure` в production), срок 30 дней,
  очистка истёкших сессий.
- CSRF: токен в сессии, обязателен для POST/PATCH/DELETE.
- Защита от cross-site login: проверка `Origin` для login/register.
- RBAC: ученик / староста / куратор на уровне каждого маршрута.
- Аудит: каждое изменение статуса, дежурства, замены, ученика и роли попадает в `audit_logs`.
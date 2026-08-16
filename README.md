# WORK//ROOM

Рабочий MVP профессиональной сети для IT / design / iGaming / marketing / creators:

- публичный Swiss-style лендинг;
- регистрация по email + пароль;
- подтверждение email шестизначным кодом и ссылкой-кнопкой;
- уникальные `@username`;
- профиль с фото, био, контактами, датой рождения, профессией, локацией и приватностью стены;
- несколько CV на пользователя;
- статусы CV: `draft / published / frozen`;
- уникальный счётчик просмотров каждого CV с live-обновлением через Socket.IO;
- каталог реальных удалённых вакансий через Jobicy Public Jobs API;
- фильтры вакансий, точная ссылка на источник, сохранение и учёт факта нажатия «Откликнуться»;
- личный карьерный органайзер: `want / waiting / interview / offer / rejected / not_fit`;
- поиск людей;
- контакты / запросы в друзья;
- публичная, закрытая для контактов или приватная стена;
- короткие посты с изображениями;
- длинные статьи / блог с черновиками и публикацией;
- личные сообщения с изображениями;
- block / mute;
- группы по интересам;
- жалобы;
- страница для работодателей с переходом в Telegram `@osluarttt`;
- админка: вакансии, импорт, featured, снятие, пользователи, ban/admin, жалобы;
- PostgreSQL, без хранения пользовательских картинок на локальном диске.

## Стек

Node.js 20+, Express 5, PostgreSQL, EJS, Socket.IO, Nodemailer SMTP, Multer memory upload, Helmet, rate-limit.

## Быстрый локальный запуск

1. Установите Node.js 20+ и Docker Desktop.
2. Поднимите PostgreSQL:

```bash
docker compose up -d db
```

3. Создайте env-файл:

```bash
cp .env.example .env
```

4. Установите зависимости:

```bash
npm install
```

5. Запустите:

```bash
npm run dev
```

Откройте `http://localhost:3000`.

Схема БД создаётся автоматически на старте.

## Email-подтверждение

Для настоящих писем заполните SMTP-переменные в `.env`:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM="WORK//ROOM <no-reply@your-domain.com>"
```

Если SMTP не настроен и `NODE_ENV=development`, код и ссылка подтверждения печатаются в терминал. Это специально для локального теста.

## Первый администратор

В `.env` укажите:

```env
ADMIN_EMAIL=your@email.com
```

Затем зарегистрируйте этот email обычным способом и подтвердите почту. Аккаунт получит роль `admin`.

## Реальные вакансии

В MVP автоматически подключён **Jobicy Public Jobs API**. Импорт запускается при старте и затем раз в несколько часов:

```env
ENABLE_JOB_IMPORT=true
JOB_IMPORT_INTERVAL_HOURS=6
```

Каждая импортированная вакансия сохраняет оригинальный `source_url`. Кнопка «Откликнуться» ведёт именно туда.

Telegram/X/другие соцсети в этом MVP добавляются через админку вручную: вставляете текст, метаданные и точную исходную ссылку. Это сознательно сделано без несанкционированного скрейпинга.

## CV views

Счётчик считает **уникальных посетителей** CV:

- автор сам себе просмотр не добавляет;
- авторизованный пользователь считается по своему user id;
- анонимный посетитель получает устойчивый session visitor key;
- повторное открытие тем же посетителем не увеличивает число;
- если владелец CV держит страницу открытой, новое уникальное открытие обновляет цифру в реальном времени через Socket.IO.

## Render

В проекте лежит `render.yaml`.

Нужно задать в Render:

- `BASE_URL=https://ваш-домен.onrender.com`
- `ADMIN_EMAIL`
- SMTP-переменные

PostgreSQL описан в Blueprint.

### Важное перед публичным запуском

Этот репозиторий рассчитан на MVP-тест среди небольшой аудитории. Перед широким запуском стоит добавить:

- отдельную систему email reset password;
- email/внутренние уведомления;
- очередь фоновых задач для импорта и писем;
- полноценную модерацию групп и заявок в закрытые группы;
- антиспам/антибот-защиту и CAPTCHA на регистрацию;
- политику конфиденциальности, пользовательское соглашение и правила сообщества;
- экспорт/удаление персональных данных;
- observability, backup policy и отдельный object storage при росте медиа;
- тесты маршрутов и e2e-тесты;
- отдельный search engine при большой базе.

## Визуальная система

Интерфейс построен на:

- строгой Swiss-grid логике;
- очень крупной типографике;
- чёрном/молочном каркасе;
- ярких функциональных цветовых карточках;
- круглых чипах и кнопках;
- минимуме декоративных иллюстраций;
- высокой контрастности и плотной информационной иерархии.

Основные дизайн-токены находятся в `public/styles.css` в `:root`.

## Update 2 — jobs-first test build

This iteration narrows the MVP around job search, CVs, private messages, people-by-username search and the personal application organizer.

- Feed, Articles and Groups are temporarily hidden/disabled in the UI. Their database tables are intentionally kept for a later iteration.
- People are not suggested automatically. Search results only appear after entering a username.
- Job import now combines Jobicy (remote roles) with the public Arbeitnow job-board API (Europe/Germany, including non-remote roles) and normalizes work mode into Remote / Hybrid / Office where possible.
- Job search now checks title, company, summary, sector, location, experience, work mode and employment type.
- Application statuses are visible on job cards for the logged-in user and use the same color coding as the organizer.

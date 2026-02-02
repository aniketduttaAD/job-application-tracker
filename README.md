# Personal Job Application Tracker

A personal app to track job applications. Store jobs in Postgres (Neon), paste job descriptions and parse them with OpenAI into structured fields, then filter, search, and manage by status, role, location, tech stack, and salary.

---

## Features

- **Postgres storage** — Jobs in Neon Postgres. Set `DATABASE_URL` and run the schema once (see Setup).
- **AI JD parsing** — Paste a job description; OpenAI (`gpt-4o-mini`) extracts title, company, location, salary, tech stack, role, experience. Up to 60k characters per JD.
- **Search & filters** — Search box plus filters: title, location, role, experience, tech stack, status, salary min/max.
- **Status workflow** — applied, screening, interview, offer, rejected, withdrawn.
- **Bulk actions** — Delete one or many jobs. Optional Telegram bot for list/search/add from chat.
- **Responsive UI** — Beige/orange theme (Tailwind), Lucide icons, works on mobile and desktop.

---

## Setup

1. **Install**

   ```bash
   npm install
   ```

2. **Environment**  
   Copy the example env and edit with your values:

   ```bash
   cp .env.example .env
   ```

   In `.env` set:

   | Variable                  | Required             | Description                                                                                                                                              |
   | ------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`            | Yes                  | Neon Postgres connection string (e.g. `postgresql://user:pass@host/db?sslmode=require`). Create a project at [Neon](https://neon.tech).                  |
   | `API_KEY`                 | Optional             | Protects API routes (POST/PATCH/DELETE). When set, requests must send this key or come from the same origin (your UI). Leave empty for same-origin only. |
   | `OPENAI_API_KEY`          | For parse            | OpenAI API key for JD parsing. Get one at [OpenAI API keys](https://platform.openai.com/api-keys).                                                       |
   | `TELEGRAM_BOT_TOKEN`      | For Telegram         | Bot token if you use the Telegram bot.                                                                                                                   |
   | `TELEGRAM_WEBHOOK_SECRET` | For Telegram         | Secret for webhook URL so only Telegram can call it.                                                                                                     |
   | `BASE_URL`                | For Telegram webhook | Your deployed app URL (e.g. `https://your-domain.com`) when running `npm run telegram:set-webhook`.                                                      |

3. **Create the jobs table**  
   In the [Neon SQL Editor](https://console.neon.tech) (or any Postgres client), run the SQL in `scripts/init-db.sql` to create the `jobs` table.

4. **Run**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

   For Vercel: pull env with `vercel env pull .env.development.local` so `DATABASE_URL` is available locally.

---

## Telegram bot when hosted

The bot uses a **webhook**: Telegram sends updates to a URL. After you deploy, you must **re-register** that URL with Telegram, or the bot will not receive any messages.

1. **Set env on the host**  
   Ensure your hosting has `TELEGRAM_BOT_TOKEN` (and optionally `TELEGRAM_WEBHOOK_SECRET`) in its environment.

2. **Register the webhook** (run locally after each deploy; reads from `.env`):
   - In `.env` set `BASE_URL` to your deployed app URL (e.g. `https://your-domain.com`). Also set `TELEGRAM_BOT_TOKEN` (and `TELEGRAM_WEBHOOK_SECRET` if you use it).

   ```bash
   npm run telegram:set-webhook
   ```

   This tells Telegram to send updates to `BASE_URL/api/telegram/webhook`. If you use `TELEGRAM_WEBHOOK_SECRET`, the script appends `?secret=...` to the webhook URL.

3. **Check**  
   Send a message to your bot; it should reply. If it doesn’t, confirm the webhook URL is HTTPS, the host has the env vars, and `BASE_URL` matches your deployed domain.

---

## Tech

Next.js (App Router), React, TypeScript, Neon Postgres (`@neondatabase/serverless`), OpenAI, Tailwind CSS, Lucide React.

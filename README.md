# Personal Job Application Tracker

A personal app to track job applications. Store jobs locally (JSON file), paste job descriptions and parse them with OpenAI into structured fields, then filter, search, and manage by status, role, location, tech stack, and salary.

---

## Features

- **Local storage** — Jobs in `data/jobs.json` (lowdb). No external database.
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

   | Variable | Required | Description |
   |----------|----------|-------------|
   | `API_KEY` | Optional | Protects API routes (POST/PATCH/DELETE). When set, requests must send this key or come from the same origin (your UI). Leave empty for same-origin only. |
   | `OPENAI_API_KEY` | For parse | OpenAI API key for JD parsing. Get one at [OpenAI API keys](https://platform.openai.com/api-keys). |
   | `TELEGRAM_BOT_TOKEN` | For Telegram | Bot token if you use the Telegram bot. |
   | `TELEGRAM_WEBHOOK_SECRET` | For Telegram | Secret for webhook URL so only Telegram can call it. |

3. **Run**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

---

## Tech

Next.js (App Router), React, TypeScript, lowdb, OpenAI, Tailwind CSS, Lucide React.

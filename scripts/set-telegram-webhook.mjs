#!/usr/bin/env node

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  const path = join(root, ".env");
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) {
      const key = m[1];
      const value = m[2].replace(/^["']|["']$/g, "").trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();

const baseUrl = process.env.BASE_URL || process.argv[2];
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!baseUrl) {
  console.error("BASE_URL is not set. Set it in .env or pass as first argument.");
  console.error("Usage: node scripts/set-telegram-webhook.mjs [BASE_URL]");
  process.exit(1);
}

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not set. Set it in .env or the environment.");
  process.exit(1);
}

const webhookPath = "/api/telegram/webhook";
let webhookUrl = baseUrl.replace(/\/$/, "") + webhookPath;
if (secret) {
  webhookUrl += "?secret=" + encodeURIComponent(secret);
}

const apiUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;

console.log("Setting Telegram webhook to:", webhookUrl);

const res = await fetch(apiUrl);
const data = await res.json();

if (!data.ok) {
  console.error("Telegram API error:", data.description || data);
  process.exit(1);
}

console.log("Webhook set successfully.");
if (data.result) console.log("Result:", data.result);

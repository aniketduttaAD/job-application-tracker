import { NextRequest, NextResponse } from "next/server";
import { readJobs, addJob, updateJob, deleteJob, deleteJobs } from "@/lib/storage";
import { parseJobDescription, parseResultToJobRecord } from "@/lib/openai-parse";
import { fuzzySearchJobs } from "@/lib/search";
import {
  sendTelegramMessage,
  sendTelegramMessageWithKeyboard,
  parseCommand,
  getHelpText,
  formatJobFull,
  buildJobListKeyboard,
  parseJobCallbackData,
  answerCallbackQuery,
} from "@/lib/telegram";
import type { JobRecord, JobStatus } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

const PENDING_ADD_TTL_MS = 5 * 60 * 1000;
const VALID_STATUSES: JobStatus[] = [
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
];

const PENDING_SEARCH_TTL_MS = 2 * 60 * 1000;

const pendingAddByChat = new Map<number, number>();
const pendingSearchByChat = new Map<number, number>();

function isPendingAdd(chatId: number): boolean {
  const ts = pendingAddByChat.get(chatId);
  if (ts == null) return false;
  if (Date.now() - ts > PENDING_ADD_TTL_MS) {
    pendingAddByChat.delete(chatId);
    return false;
  }
  return true;
}

function setPendingAdd(chatId: number): void {
  pendingAddByChat.set(chatId, Date.now());
}

function clearPendingAdd(chatId: number): void {
  pendingAddByChat.delete(chatId);
}

function isPendingSearch(chatId: number): boolean {
  const ts = pendingSearchByChat.get(chatId);
  if (ts == null) return false;
  if (Date.now() - ts > PENDING_SEARCH_TTL_MS) {
    pendingSearchByChat.delete(chatId);
    return false;
  }
  return true;
}

function setPendingSearch(chatId: number): void {
  pendingSearchByChat.set(chatId, Date.now());
}

function clearPendingSearch(chatId: number): void {
  pendingSearchByChat.delete(chatId);
}

function getApiOrigin(request: NextRequest): string {
  const host = request.headers.get("host") ?? "";
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto === "https" ? "https" : "http"}://${host}`;
}

function getApiHeaders(): HeadersInit {
  const key = process.env.API_KEY ?? "";
  const h: HeadersInit = { "Content-Type": "application/json" };
  if (key) (h as Record<string, string>)["x-api-key"] = key;
  return h;
}

async function handleMessage(chatId: number, text: string, request: NextRequest): Promise<void> {
  const origin = getApiOrigin(request);
  const headers = getApiHeaders();

  if (isPendingSearch(chatId)) {
    if (text.startsWith("/")) {
      clearPendingSearch(chatId);
    } else {
      clearPendingSearch(chatId);
      const q = text?.trim() ?? "";
      if (!q) {
        await sendTelegramMessage(
          chatId,
          "No search query received. Send /search and then your search text."
        );
        return;
      }
      const data = await readJobs();
      const list = data.jobs ?? [];
      const { jobs: results, total } = fuzzySearchJobs(list, q, { limit: 20, threshold: 0.4 });
      if (results.length === 0) {
        await sendTelegramMessage(chatId, `No jobs found for "${q}".`);
        return;
      }
      const keyboard = buildJobListKeyboard(results);
      await sendTelegramMessageWithKeyboard(
        chatId,
        `Search: "${q}" — ${results.length} result(s). Tap an item for full details.`,
        keyboard,
        { parse_mode: "HTML" }
      );
      return;
    }
  }

  if (isPendingAdd(chatId)) {
    clearPendingAdd(chatId);
    if (!text?.trim()) {
      await sendTelegramMessage(
        chatId,
        "No text received. Use /add again and paste the job description.",
        {
          parse_mode: "HTML",
        }
      );
      return;
    }
    try {
      if (!process.env.OPENAI_API_KEY) {
        await sendTelegramMessage(chatId, "Parse is not configured (OPENAI_API_KEY missing).");
        return;
      }
      const result = await parseJobDescription(text.trim());
      const partial = parseResultToJobRecord(result, text.trim());
      const now = new Date().toISOString();
      const job: JobRecord = {
        id: uuidv4(),
        ...partial,
        status: "applied",
        appliedAt: partial.appliedAt ?? now,
        createdAt: now,
        updatedAt: now,
      };
      await addJob(job);
      await sendTelegramMessage(
        chatId,
        `✅ Added: <b>${job.title || "Untitled"}</b> at ${job.company || "—"}\n<code>id: ${job.id}</code>`,
        { parse_mode: "HTML" }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Parse failed";
      await sendTelegramMessage(chatId, `❌ Parse failed: ${msg}`);
    }
    return;
  }

  const parsed = parseCommand(text);
  if (!parsed) {
    await sendTelegramMessage(chatId, "Send /help for commands.");
    return;
  }

  const { command, args } = parsed;

  switch (command) {
    case "start":
    case "help": {
      await sendTelegramMessage(chatId, getHelpText(), { parse_mode: "HTML" });
      return;
    }

    case "list": {
      const data = await readJobs();
      const jobs = (data.jobs ?? []).slice(0, 20);
      if (jobs.length === 0) {
        await sendTelegramMessage(chatId, "No jobs yet. Use /add to add one.");
        return;
      }
      const keyboard = buildJobListKeyboard(jobs);
      await sendTelegramMessageWithKeyboard(
        chatId,
        `Latest ${jobs.length} job(s). Tap an item for full details.`,
        keyboard,
        { parse_mode: "HTML" }
      );
      return;
    }

    case "search": {
      setPendingSearch(chatId);
      await sendTelegramMessage(
        chatId,
        "Send your search query in the next message (e.g. react frontend, company name, role)."
      );
      return;
    }

    case "job": {
      const id = args[0]?.trim();
      if (!id) {
        await sendTelegramMessage(chatId, "Usage: /job &lt;id&gt;");
        return;
      }
      const data = await readJobs();
      const job = (data.jobs ?? []).find((j) => j.id === id);
      if (!job) {
        await sendTelegramMessage(chatId, "Job not found.");
        return;
      }
      await sendTelegramMessage(chatId, formatJobFull(job), { parse_mode: "HTML" });
      return;
    }

    case "add": {
      setPendingAdd(chatId);
      await sendTelegramMessage(
        chatId,
        "Paste the job description in your next message. I'll parse it and add the job. (Cancel by sending any command.)"
      );
      return;
    }

    case "delete": {
      const id = args[0]?.trim();
      if (!id) {
        await sendTelegramMessage(chatId, "Usage: /delete &lt;id&gt;");
        return;
      }
      const ok = await deleteJob(id);
      await sendTelegramMessage(chatId, ok ? "✅ Deleted." : "Job not found.");
      return;
    }

    case "delete_bulk": {
      const ids = args.map((a) => a.trim()).filter(Boolean);
      if (ids.length === 0) {
        await sendTelegramMessage(chatId, "Usage: /delete_bulk &lt;id1&gt; &lt;id2&gt; …");
        return;
      }
      const removed = await deleteJobs(ids);
      await sendTelegramMessage(chatId, `✅ Deleted ${removed} job(s).`);
      return;
    }

    case "status": {
      const id = args[0]?.trim();
      const status = args[1]?.trim()?.toLowerCase();
      if (!id || !status) {
        await sendTelegramMessage(
          chatId,
          "Usage: /status &lt;id&gt; &lt;status&gt;\nStatus: applied, screening, interview, offer, rejected, withdrawn"
        );
        return;
      }
      if (!VALID_STATUSES.includes(status as JobStatus)) {
        await sendTelegramMessage(
          chatId,
          `Invalid status. Use one of: ${VALID_STATUSES.join(", ")}`
        );
        return;
      }
      const updated = await updateJob(id, { status: status as JobStatus });
      if (!updated) {
        await sendTelegramMessage(chatId, "Job not found.");
        return;
      }
      await sendTelegramMessage(chatId, `✅ Status updated to <b>${status}</b>.`, {
        parse_mode: "HTML",
      });
      return;
    }

    default: {
      await sendTelegramMessage(chatId, "Unknown command. Send /help for usage.");
    }
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  const urlSecret = request.nextUrl.searchParams.get("secret");
  const headerSecret = request.headers.get("x-telegram-webhook-secret");
  if (secret && urlSecret !== secret && headerSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update = body as {
    message?: {
      chat: { id: number };
      text?: string;
    };
    callback_query?: {
      id: string;
      data?: string;
      message?: { chat: { id: number } };
    };
  };

  if (update.callback_query?.id != null) {
    const cq = update.callback_query;
    const jobId = cq.data != null ? parseJobCallbackData(cq.data) : null;
    const chatId = cq.message?.chat?.id;

    try {
      await answerCallbackQuery(cq.id);
      if (jobId != null && chatId != null) {
        const data = await readJobs();
        const job = (data.jobs ?? []).find((j) => j.id === jobId);
        if (job) {
          await sendTelegramMessage(chatId, formatJobFull(job), { parse_mode: "HTML" });
        } else {
          await sendTelegramMessage(chatId, "Job not found.");
        }
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : "Error";
      if (chatId != null) await sendTelegramMessage(chatId, `❌ ${err}`).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  if (!message?.chat?.id) {
    return NextResponse.json({ ok: true });
  }

  const chatId = message.chat.id;
  const text = message.text?.trim();

  if (!text) {
    await sendTelegramMessage(chatId, "Send /help for commands.");
    return NextResponse.json({ ok: true });
  }

  try {
    await handleMessage(chatId, text, request);
  } catch (e) {
    const err = e instanceof Error ? e.message : "Something went wrong";
    await sendTelegramMessage(chatId, `❌ Error: ${err}`).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

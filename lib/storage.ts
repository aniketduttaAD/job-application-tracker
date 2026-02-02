import path from "path";
import fs from "fs";
import { JSONFileSyncPreset } from "lowdb/node";
import type { JobsData, JobRecord } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const JOBS_FILE = path.join(DATA_DIR, "jobs.json");

const defaultData: JobsData = {
  jobs: [],
  updatedAt: new Date().toISOString(),
};

function ensureDataDir(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

let db: ReturnType<typeof JSONFileSyncPreset<JobsData>> | null = null;

function dbInstance(): ReturnType<typeof JSONFileSyncPreset<JobsData>> {
  if (!db) {
    ensureDataDir();
    db = JSONFileSyncPreset<JobsData>(JOBS_FILE, defaultData);
  }
  return db;
}

export async function getJobsPath(): Promise<string> {
  ensureDataDir();
  return JOBS_FILE;
}

export async function readJobs(): Promise<JobsData> {
  const d = dbInstance();
  d.read();
  const data = d.data ?? defaultData;
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  const updatedAt = data.updatedAt ?? new Date().toISOString();
  return { jobs, updatedAt };
}

export async function writeJobs(data: JobsData): Promise<void> {
  const d = dbInstance();
  d.data = { ...data, updatedAt: new Date().toISOString() };
  d.write();
}

export async function addJob(job: JobRecord): Promise<JobRecord> {
  const d = dbInstance();
  d.read();
  const data = d.data ?? defaultData;
  const jobs = Array.isArray(data.jobs) ? [...data.jobs] : [];
  jobs.unshift(job);
  d.data = { jobs, updatedAt: new Date().toISOString() };
  d.write();
  return job;
}

export async function updateJob(
  id: string,
  updates: Partial<JobRecord>
): Promise<JobRecord | null> {
  const d = dbInstance();
  d.read();
  const data = d.data ?? defaultData;
  const jobs = Array.isArray(data.jobs) ? [...data.jobs] : [];
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx === -1) return null;
  const updated = {
    ...jobs[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  jobs[idx] = updated;
  d.data = { jobs, updatedAt: new Date().toISOString() };
  d.write();
  return updated;
}

export async function deleteJob(id: string): Promise<boolean> {
  const d = dbInstance();
  d.read();
  const data = d.data ?? defaultData;
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  const next = jobs.filter((j) => j.id !== id);
  if (next.length === jobs.length) return false;
  d.data = { jobs: next, updatedAt: new Date().toISOString() };
  d.write();
  return true;
}

export async function deleteJobs(ids: string[]): Promise<number> {
  const set = new Set(ids);
  const d = dbInstance();
  d.read();
  const data = d.data ?? defaultData;
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  const next = jobs.filter((j) => !set.has(j.id));
  const removed = jobs.length - next.length;
  if (removed > 0) {
    d.data = { jobs: next, updatedAt: new Date().toISOString() };
    d.write();
  }
  return removed;
}

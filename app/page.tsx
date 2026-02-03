"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  Search,
  Filter,
  Plus,
  Trash2,
  Briefcase,
  Code,
  Loader2,
  FileText,
  X,
  Check,
  Eye,
  Lock,
  Copy,
} from "lucide-react";
import type { JobRecord } from "@/lib/types";

const DEVICE_ID_KEY = "jobtracker_device_id";

/**
 * Get or generate a device ID for this browser session
 * Uses sessionStorage so it persists across page reloads but clears when browser closes
 */
function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let deviceId = sessionStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `browser_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    sessionStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

function getApiHeaders(unlockToken: string | null): HeadersInit {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (unlockToken) (headers as Record<string, string>)["x-unlock-token"] = unlockToken;
  return headers;
}

export default function HomePage() {
  const [unlockRequired, setUnlockRequired] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [unlockToken, setUnlockToken] = useState<string | null>(null);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlockLoading, setUnlockLoading] = useState(false);

  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTitle, setFilterTitle] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterExperience, setFilterExperience] = useState("");
  const [filterTech, setFilterTech] = useState("");
  const [filterSalaryMin, setFilterSalaryMin] = useState("");
  const [filterSalaryMax, setFilterSalaryMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [parseModalOpen, setParseModalOpen] = useState(false);
  const [parsePaste, setParsePaste] = useState("");
  const [parseLoading, setParseLoading] = useState(false);
  const [parseResult, setParseResult] = useState<Record<string, unknown> | null>(null);
  const [editedParseJson, setEditedParseJson] = useState<string>("");
  const [editedFields, setEditedFields] = useState<Partial<JobRecord> | null>(null);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | "bulk" | null>(null);

  const [searchResults, setSearchResults] = useState<JobRecord[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [detailJob, setDetailJob] = useState<JobRecord | null>(null);

  const clearUnlock = useCallback(() => {
    setUnlockToken(null);
    setUnlocked(false);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(DEVICE_ID_KEY + "_token");
    }
  }, []);

  const fetchJobs = useCallback(
    async (token: string | null) => {
      setLoading(true);
      try {
        const res = await fetch("/api/jobs", { headers: getApiHeaders(token) });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          clearUnlock();
          return;
        }
        setJobs(Array.isArray(data.jobs) ? data.jobs : []);
      } finally {
        setLoading(false);
      }
    },
    [clearUnlock]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/auth/status", { headers: getApiHeaders(null) });
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      const required = data.unlockRequired === true;
      setUnlockRequired(required);
      if (!required) {
        setUnlocked(true);
        setUnlockToken(null);
        await fetchJobs(null);
        return;
      }
      const storedToken =
        typeof window !== "undefined" ? sessionStorage.getItem(DEVICE_ID_KEY + "_token") : null;
      if (storedToken) {
        setUnlockToken(storedToken);
        setUnlocked(true);
        await fetchJobs(storedToken);
      } else {
        setUnlocked(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchJobs]);

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    if (!unlocked) return;
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/jobs/search?q=${encodeURIComponent(q)}&limit=100`, {
          headers: getApiHeaders(unlockToken),
        });
        if (res.status === 401) clearUnlock();
        const data = await res.json().catch(() => ({}));
        setSearchResults(Array.isArray(data.jobs) ? data.jobs : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search, unlocked, unlockToken, clearUnlock]);

  const baseJobs = search.trim() && searchResults !== null ? searchResults : jobs;
  const filteredJobs = baseJobs.filter((job) => {
    if (filterTitle && !(job.title || "").toLowerCase().includes(filterTitle.toLowerCase()))
      return false;
    if (
      filterLocation &&
      !(job.location || "").toLowerCase().includes(filterLocation.toLowerCase())
    )
      return false;
    if (filterRole && !(job.role || "").toLowerCase().includes(filterRole.toLowerCase()))
      return false;
    if (
      filterExperience &&
      !(job.experience || "").toLowerCase().includes(filterExperience.toLowerCase())
    )
      return false;
    if (filterTech) {
      const tech = filterTech.toLowerCase();
      if (!job.techStack.some((t) => t.toLowerCase().includes(tech))) return false;
    }
    if (
      filterSalaryMin !== "" &&
      (job.salaryMin == null || job.salaryMin < Number(filterSalaryMin))
    )
      return false;
    if (
      filterSalaryMax !== "" &&
      (job.salaryMax == null || job.salaryMax > Number(filterSalaryMax))
    )
      return false;
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredJobs.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredJobs.map((j) => j.id)));
  };

  const handleDeleteOne = async (id: string) => {
    setDeleteLoading(id);
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "DELETE",
        headers: getApiHeaders(unlockToken),
      });
      if (res.status === 401) clearUnlock();
      if (res.ok) {
        setJobs((prev) => prev.filter((j) => j.id !== id));
        setSearchResults((prev) => (prev === null ? null : prev.filter((j) => j.id !== id)));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        if (detailJob?.id === id) setDetailJob(null);
      }
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleteLoading("bulk");
    try {
      const res = await fetch("/api/jobs/bulk", {
        method: "DELETE",
        headers: getApiHeaders(unlockToken),
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.status === 401) clearUnlock();
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.deleted) {
        setJobs((prev) => prev.filter((j) => !selectedIds.has(j.id)));
        setSearchResults((prev) =>
          prev === null ? null : prev.filter((j) => !selectedIds.has(j.id))
        );
        setSelectedIds(new Set());
        if (detailJob && selectedIds.has(detailJob.id)) setDetailJob(null);
      }
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleParse = async () => {
    if (!parsePaste.trim()) return;

    if (unlockRequired === null) {
      setParseResult({ error: "Please wait..." });
      return;
    }

    setParseLoading(true);
    setParseResult(null);
    try {
      let token: string | null = null;
      if (unlockRequired) {
        if (typeof window !== "undefined") {
          token = sessionStorage.getItem(DEVICE_ID_KEY + "_token");
          if (token && token !== unlockToken) {
            setUnlockToken(token);
            setUnlocked(true);
          }
        }
        if (!token) {
          token = unlockToken;
        }
        if (!token) {
          setParseResult({ error: "Please unlock first by entering the password" });
          setParseLoading(false);
          return;
        }
      }

      const res = await fetch("/api/jobs/parse", {
        method: "POST",
        headers: getApiHeaders(token),
        body: JSON.stringify({ jd: parsePaste.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        if (data.error === "Unlock required" || data.error === "Unauthorized") {
          clearUnlock();
          if (typeof window !== "undefined") {
            sessionStorage.removeItem(DEVICE_ID_KEY + "_token");
          }
          setParseResult({ error: "Session expired. Please unlock again." });
        } else {
          setParseResult({ error: data.error ?? "Authentication failed" });
        }
      } else if (res.ok) {
        setParseResult(data);
        // Initialize edited fields from record
        const record = data.record as Partial<JobRecord>;
        setEditedFields(record || {});
        setEditedParseJson(JSON.stringify(data, null, 2));
        setShowJsonEditor(false);
      } else {
        setParseResult({ error: data.error ?? "Parse failed" });
        setEditedParseJson("");
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Parse error:", error);
      }
      setParseResult({ error: "Request failed. Please try again." });
    } finally {
      setParseLoading(false);
    }
  };

  const handleCopyAll = async () => {
    let jsonToCopy: string;
    if (editedFields) {
      jsonToCopy = JSON.stringify(editedFields, null, 2);
    } else if (editedParseJson) {
      jsonToCopy = editedParseJson;
    } else {
      jsonToCopy = JSON.stringify(parseResult?.parsed ?? parseResult?.record, null, 2);
    }

    try {
      await navigator.clipboard.writeText(jsonToCopy);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = jsonToCopy;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch {
        // Ignore
      }
      document.body.removeChild(textArea);
    }
  };

  const handleCopyJson = async () => {
    await handleCopyAll();
  };

  const updateField = (field: keyof JobRecord, value: unknown) => {
    if (!editedFields) return;
    setEditedFields({ ...editedFields, [field]: value });
  };

  const handleSaveParsed = async () => {
    let record: Partial<JobRecord> | undefined;

    // Prefer edited fields, then edited JSON, then original result
    if (editedFields) {
      record = editedFields;
    } else if (editedParseJson.trim()) {
      try {
        const parsed = JSON.parse(editedParseJson);
        // If it's the full parsed result, extract the record part
        if (parsed.record) {
          record = parsed.record as Partial<JobRecord>;
        } else if (parsed.parsed) {
          // Convert parsed result to record format
          record = parsed.parsed as Partial<JobRecord>;
        } else {
          // Assume it's already in record format
          record = parsed as Partial<JobRecord>;
        }
      } catch (parseError) {
        setParseResult((prev) =>
          prev
            ? { ...prev, error: "Invalid JSON. Please check your edits." }
            : { error: "Invalid JSON. Please check your edits." }
        );
        return;
      }
    } else {
      record = parseResult?.record as Partial<JobRecord> | undefined;
    }

    if (!record) {
      setParseResult((prev) =>
        prev ? { ...prev, error: "No data to save" } : { error: "No data to save" }
      );
      return;
    }
    setSaveLoading(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: getApiHeaders(unlockToken),
        body: JSON.stringify(record),
      });
      if (res.status === 401) clearUnlock();
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setJobs((prev) => [data, ...prev]);
        setParseModalOpen(false);
        setParsePaste("");
        setParseResult(null);
        setEditedParseJson("");
        setEditedFields(null);
        setShowJsonEditor(false);
      } else {
        const msg = [data.error, data.detail].filter(Boolean).join(" — ");
        setParseResult((prev) =>
          prev ? { ...prev, error: msg || "Unable to save" } : { error: msg || "Unable to save" }
        );
      }
    } catch {
      setParseResult((prev) =>
        prev ? { ...prev, error: "Unable to save" } : { error: "Unable to save" }
      );
    } finally {
      setSaveLoading(false);
    }
  };

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError("");
    if (!unlockPassword.trim()) return;
    setUnlockLoading(true);
    try {
      const deviceId = getDeviceId();
      const res = await fetch("/api/auth/unlock", {
        method: "POST",
        headers: getApiHeaders(null),
        body: JSON.stringify({ password: unlockPassword, deviceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) {
        if (typeof window !== "undefined")
          sessionStorage.setItem(DEVICE_ID_KEY + "_token", data.token);
        setUnlockToken(data.token);
        setUnlocked(true);
        setUnlockPassword("");
        await fetchJobs(data.token);
      } else {
        setUnlockError(data.error ?? "Invalid password");
      }
    } catch {
      setUnlockError("Request failed");
    } finally {
      setUnlockLoading(false);
    }
  };

  const handleLock = async () => {
    if (!unlockToken) return;
    try {
      const res = await fetch("/api/auth/lock", {
        method: "POST",
        headers: getApiHeaders(unlockToken),
      });
      if (res.ok) {
        clearUnlock();
      }
    } catch {
      clearUnlock();
    }
  };

  const formatSalary = (job: JobRecord) => {
    const { salaryMin, salaryMax, salaryCurrency, salaryPeriod, salaryEstimated } = job;
    const period = salaryPeriod || "yearly";
    const curr = (salaryCurrency || "").trim();
    const isINRLakhs =
      (curr === "INR" || (!curr && salaryMin != null && salaryMin >= 100_000)) &&
      period === "yearly" &&
      (salaryMin == null || salaryMin >= 100_000) &&
      (salaryMax == null || salaryMax >= 100_000);
    const toLPA = (n: number) => (n / 100_000).toFixed(n % 100_000 === 0 ? 0 : 1);
    let salaryStr = "";
    if (salaryMin != null && salaryMax != null) {
      if (isINRLakhs)
        salaryStr = `${curr ? curr + " " : ""}${toLPA(salaryMin)} - ${toLPA(salaryMax)} LPA`;
      else
        salaryStr = `${curr ? curr + " " : ""}${salaryMin.toLocaleString()} - ${salaryMax.toLocaleString()}/${period}`;
    } else if (salaryMin != null) {
      if (isINRLakhs) salaryStr = `${curr ? curr + " " : ""}${toLPA(salaryMin)}+ LPA`;
      else salaryStr = `${curr ? curr + " " : ""}${salaryMin.toLocaleString()}+/${period}`;
    } else if (salaryMax != null) {
      if (isINRLakhs) salaryStr = `${curr ? curr + " " : ""}up to ${toLPA(salaryMax)} LPA`;
      else salaryStr = `${curr ? curr + " " : ""}up to ${salaryMax.toLocaleString()}/${period}`;
    } else {
      return "—";
    }
    return salaryEstimated ? `${salaryStr} (estimated)` : salaryStr;
  };

  const emptyToDash = (s: string | null | undefined) =>
    s != null && String(s).trim() !== "" ? String(s).trim() : "—";

  const formatPostedAt = (postedAt: string | null | undefined) => {
    if (!postedAt?.trim()) return null;
    const s = postedAt.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      try {
        return new Date(s + "T00:00:00Z").toLocaleDateString();
      } catch {
        return s;
      }
    }
    return s;
  };

  useEffect(() => {
    if (!detailJob) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailJob(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailJob]);

  const showUnlockGate = unlockRequired === true && !unlocked;

  return (
    <>
      {unlockRequired === null && (
        <div className="min-h-screen flex items-center justify-center bg-beige-50">
          <Loader2 className="h-8 w-8 animate-spin text-orange-brand" />
        </div>
      )}

      {showUnlockGate && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-stone-900/80 backdrop-blur-sm md:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unlock-title"
        >
          <div
            className="w-full max-w-md rounded-t-2xl border-t border-beige-300 bg-beige-50 p-6 shadow-xl md:rounded-2xl md:border md:border-beige-300 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-orange-brand/20">
              <Lock className="h-6 w-6 text-orange-brand" />
            </div>
            <h2 id="unlock-title" className="text-center text-lg font-semibold text-stone-800">
              Enter password to continue
            </h2>
            <p className="mt-1 text-center text-sm text-stone-500">
              This app is protected. Enter the password to access.
            </p>
            <form onSubmit={handleUnlockSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="unlock-password" className="sr-only">
                  Password
                </label>
                <input
                  id="unlock-password"
                  type="password"
                  value={unlockPassword}
                  onChange={(e) => {
                    setUnlockPassword(e.target.value);
                    setUnlockError("");
                  }}
                  placeholder="Password"
                  autoComplete="current-password"
                  autoFocus
                  disabled={unlockLoading}
                  className="w-full rounded-lg border border-beige-300 bg-white px-4 py-3 text-stone-800 placeholder-stone-400 focus:border-orange-brand focus:outline-none focus:ring-2 focus:ring-orange-brand/20 disabled:opacity-60"
                />
              </div>
              {unlockError && (
                <p className="text-sm text-red-600" role="alert">
                  {unlockError}
                </p>
              )}
              <button
                type="submit"
                disabled={unlockLoading || !unlockPassword.trim()}
                className="w-full rounded-lg bg-orange-brand py-3 text-sm font-medium text-white hover:bg-orange-dark focus:outline-none focus:ring-2 focus:ring-orange-brand/30 disabled:opacity-60"
              >
                {unlockLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking…
                  </span>
                ) : (
                  "Unlock"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {unlockRequired !== null && !showUnlockGate && (
        <div className="min-h-screen flex flex-col">
          <header className="sticky top-0 z-20 border-b border-beige-300 bg-beige-100/95 backdrop-blur supports-[backdrop-filter]:bg-beige-100/80">
            <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="flex shrink-0 items-center gap-3">
                  <Image
                    src="/icon.png"
                    alt="Job Tracker Icon"
                    width={32}
                    height={32}
                    className="rounded-lg"
                    priority
                  />
                  <h1 className="text-xl font-semibold text-stone-800 sm:text-2xl">Job Tracker</h1>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="relative w-full min-w-0 sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 text-stone-400 pointer-events-none" />
                    <input
                      type="search"
                      placeholder="Fuzzy search: title, company, role, tech…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-lg border border-beige-300 bg-beige-50 py-2.5 pl-9 pr-10 text-sm text-stone-800 placeholder-stone-400 focus:border-orange-brand focus:outline-none focus:ring-2 focus:ring-orange-brand/20"
                    />
                    {searchLoading && (
                      <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-stone-400 pointer-events-none" />
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                    {unlockRequired && unlocked && (
                      <button
                        type="button"
                        onClick={handleLock}
                        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-beige-300 bg-beige-100 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-beige-200 focus:outline-none focus:ring-2 focus:ring-orange-brand/20"
                        title="Lock session"
                      >
                        <Lock className="h-4 w-4 shrink-0" />
                        Lock
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowFilters((v) => !v)}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border border-beige-300 bg-beige-100 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-beige-200 focus:outline-none focus:ring-2 focus:ring-orange-brand/20 sm:flex-initial"
                    >
                      <Filter className="h-4 w-4 shrink-0" />
                      Filters
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (unlockRequired && !unlocked) {
                          return;
                        }
                        setParseModalOpen(true);
                        setParsePaste("");
                        setParseResult(null);
                      }}
                      disabled={unlockRequired === true && !unlocked}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-orange-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-dark focus:outline-none focus:ring-2 focus:ring-orange-brand/30 focus:ring-offset-2 focus:ring-offset-beige-50 disabled:opacity-50 disabled:cursor-not-allowed sm:flex-initial"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      Add from JD
                    </button>
                  </div>
                </div>
              </div>

              {showFilters && (
                <div className="mt-5 grid grid-cols-1 gap-4 rounded-xl border border-beige-300 bg-beige-50/80 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
                  <input
                    type="text"
                    placeholder="Title"
                    value={filterTitle}
                    onChange={(e) => setFilterTitle(e.target.value)}
                    className="rounded-lg border border-beige-300 bg-white px-3 py-2.5 text-sm text-stone-800 placeholder-stone-400 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand/20"
                  />
                  <input
                    type="text"
                    placeholder="Location"
                    value={filterLocation}
                    onChange={(e) => setFilterLocation(e.target.value)}
                    className="rounded-lg border border-beige-300 bg-white px-3 py-2.5 text-sm text-stone-800 placeholder-stone-400 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand/20"
                  />
                  <input
                    type="text"
                    placeholder="Role"
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value)}
                    className="rounded-lg border border-beige-300 bg-white px-3 py-2.5 text-sm text-stone-800 placeholder-stone-400 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand/20"
                  />
                  <input
                    type="text"
                    placeholder="Experience"
                    value={filterExperience}
                    onChange={(e) => setFilterExperience(e.target.value)}
                    className="rounded-lg border border-beige-300 bg-white px-3 py-2.5 text-sm text-stone-800 placeholder-stone-400 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand/20"
                  />
                  <input
                    type="text"
                    placeholder="Tech stack"
                    value={filterTech}
                    onChange={(e) => setFilterTech(e.target.value)}
                    className="rounded-lg border border-beige-300 bg-white px-3 py-2.5 text-sm text-stone-800 placeholder-stone-400 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand/20"
                  />
                  <input
                    type="number"
                    placeholder="Min salary"
                    value={filterSalaryMin}
                    onChange={(e) => setFilterSalaryMin(e.target.value)}
                    className="rounded-lg border border-beige-300 bg-white px-3 py-2.5 text-sm text-stone-800 placeholder-stone-400 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand/20"
                  />
                  <input
                    type="number"
                    placeholder="Max salary"
                    value={filterSalaryMax}
                    onChange={(e) => setFilterSalaryMax(e.target.value)}
                    className="rounded-lg border border-beige-300 bg-white px-3 py-2.5 text-sm text-stone-800 placeholder-stone-400 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand/20"
                  />
                </div>
              )}
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
            <div className="mx-auto max-w-6xl">
              {selectedIds.size > 0 && (
                <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-orange-brand/30 bg-orange-brand/10 px-4 py-3 sm:px-5">
                  <span className="text-sm font-medium text-stone-700">
                    {selectedIds.size} selected
                  </span>
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-sm text-orange-dark underline hover:no-underline"
                  >
                    {selectedIds.size === filteredJobs.length ? "Deselect all" : "Select all"}
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    disabled={deleteLoading === "bulk"}
                    className="ml-2 inline-flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteLoading === "bulk" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Delete selected
                  </button>
                </div>
              )}

              {loading ? (
                <div className="flex min-h-[280px] items-center justify-center py-20">
                  <Loader2 className="h-10 w-10 animate-spin text-orange-brand" aria-hidden />
                </div>
              ) : filteredJobs.length === 0 ? (
                <div className="rounded-xl border border-beige-300 bg-beige-100/50 px-6 py-20 text-center sm:px-10 sm:py-24">
                  <Briefcase className="mx-auto h-14 w-14 text-beige-400" aria-hidden />
                  <p className="mt-4 text-base font-medium text-stone-600 sm:text-lg">
                    No jobs match your filters
                  </p>
                  <p className="mt-2 text-sm text-stone-500">
                    Try adjusting filters or add a job from a JD.
                  </p>
                </div>
              ) : (
                <ul className="space-y-5 sm:space-y-6">
                  {filteredJobs.map((job) => (
                    <li
                      key={job.id}
                      className="rounded-xl border border-beige-300 bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-start gap-3">
                            <label className="flex shrink-0 cursor-pointer items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(job.id)}
                                onChange={() => toggleSelect(job.id)}
                                className="h-4 w-4 rounded border-beige-300 text-orange-brand focus:ring-2 focus:ring-orange-brand/20"
                              />
                              <h2 className="font-semibold text-stone-800 leading-tight">
                                {emptyToDash(job.title)}
                              </h2>
                            </label>
                          </div>
                          <p className="text-sm text-stone-600">
                            {emptyToDash(job.company)}
                            {job.companyPublisher ? ` (${job.companyPublisher})` : ""}
                          </p>
                          <p className="text-sm text-stone-500">{emptyToDash(job.location)}</p>
                          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-600">
                            {job.role && (
                              <span>
                                <span className="font-medium text-stone-500">Role:</span>{" "}
                                {emptyToDash(job.role)}
                              </span>
                            )}
                            {job.seniority && (
                              <span>
                                <span className="font-medium text-stone-500">Seniority:</span>{" "}
                                {emptyToDash(job.seniority)}
                              </span>
                            )}
                            {job.experience && (
                              <span>
                                <span className="font-medium text-stone-500">Experience:</span>{" "}
                                {emptyToDash(job.experience)}
                              </span>
                            )}
                            {job.jobType && (
                              <span>
                                <span className="font-medium text-stone-500">Type:</span>{" "}
                                {emptyToDash(job.jobType)}
                              </span>
                            )}
                            {job.availability && (
                              <span>
                                <span className="font-medium text-stone-500">Availability:</span>{" "}
                                {emptyToDash(job.availability)}
                              </span>
                            )}
                            {job.product && (
                              <span>
                                <span className="font-medium text-stone-500">Product:</span>{" "}
                                {emptyToDash(job.product)}
                              </span>
                            )}
                            {!job.role &&
                              !job.seniority &&
                              !job.experience &&
                              !job.jobType &&
                              !job.availability &&
                              !job.product && <span className="text-stone-400">—</span>}
                          </div>
                          <p className="text-sm font-medium text-stone-700">{formatSalary(job)}</p>
                          {job.techStack.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {job.techStack.slice(0, 8).map((t) => (
                                <span
                                  key={t}
                                  className="inline-flex items-center gap-0.5 rounded-md bg-beige-200 px-2 py-0.5 text-xs text-stone-600"
                                >
                                  <Code className="h-3 w-3 shrink-0" />
                                  {t}
                                </span>
                              ))}
                              {job.techStack.length > 8 && (
                                <span className="text-xs text-stone-400">
                                  +{job.techStack.length - 8}
                                </span>
                              )}
                            </div>
                          )}
                          {(job.postedAt ||
                            job.education ||
                            (job.collaborationTools?.length ?? 0) > 0) && (
                            <p className="text-xs text-stone-500">
                              {[
                                job.postedAt && `Posted ${formatPostedAt(job.postedAt)}`,
                                job.education &&
                                  `Education: ${job.education.slice(0, 50)}${(job.education?.length ?? 0) > 50 ? "…" : ""}`,
                                (job.collaborationTools?.length ?? 0) > 0 &&
                                  `Tools: ${job.collaborationTools!.slice(0, 3).join(", ")}${(job.collaborationTools!.length ?? 0) > 3 ? "…" : ""}`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2 border-t border-beige-200 pt-4 sm:border-t-0 sm:pt-0 sm:pl-4">
                          <button
                            type="button"
                            onClick={() => setDetailJob(job)}
                            className="inline-flex min-h-[44px] min-w-[44px] flex-1 items-center justify-center gap-2 rounded-lg border border-beige-300 bg-beige-100 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-beige-200 focus:outline-none focus:ring-2 focus:ring-orange-brand/20 sm:flex-initial"
                            title="View full details"
                          >
                            <Eye className="h-4 w-4 shrink-0" />
                            View details
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOne(job.id)}
                            disabled={deleteLoading === job.id}
                            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/20 disabled:opacity-50"
                            title="Delete"
                          >
                            {deleteLoading === job.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </main>

          {detailJob && (
            <div
              className="fixed inset-0 z-30 flex items-end justify-center sm:items-center sm:p-4"
              onClick={() => setDetailJob(null)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="detail-modal-title"
            >
              <div
                className="absolute inset-0 bg-stone-900/60 backdrop-blur-[2px] transition-opacity"
                aria-hidden
              />

              <div
                className="relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-beige-300 border-b-0 bg-beige-50 shadow-2xl sm:max-h-[88vh] sm:max-w-2xl sm:rounded-2xl sm:border-b"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-beige-300 bg-beige-50/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
                  <h2
                    id="detail-modal-title"
                    className="text-lg font-semibold text-stone-800 sm:text-xl"
                  >
                    Job details
                  </h2>
                  <button
                    type="button"
                    onClick={() => setDetailJob(null)}
                    className="-mr-1 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-stone-500 hover:bg-beige-200 hover:text-stone-700 focus:outline-none focus:ring-2 focus:ring-orange-brand/20"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
                  <div className="space-y-6">
                    <section>
                      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
                        Overview
                      </h3>
                      <h4 className="text-lg font-semibold text-stone-800 leading-tight">
                        {emptyToDash(detailJob.title)}
                      </h4>
                      <p className="mt-1 text-sm text-stone-600">
                        {emptyToDash(detailJob.company)}
                        {detailJob.companyPublisher ? ` (${detailJob.companyPublisher})` : ""}
                      </p>
                    </section>

                    <section>
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
                        Details
                      </h3>
                      <dl className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-0.5">
                          <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                            Location
                          </dt>
                          <dd className="text-sm font-medium text-stone-800">
                            {emptyToDash(detailJob.location)}
                          </dd>
                        </div>
                        {detailJob.role && (
                          <div className="space-y-0.5">
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                              Role
                            </dt>
                            <dd className="text-sm text-stone-800">{detailJob.role}</dd>
                          </div>
                        )}
                        {detailJob.experience && (
                          <div className="space-y-0.5">
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                              Experience
                            </dt>
                            <dd className="text-sm text-stone-800">{detailJob.experience}</dd>
                          </div>
                        )}
                        {detailJob.jobType && (
                          <div className="space-y-0.5">
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                              Type
                            </dt>
                            <dd className="text-sm text-stone-800">{detailJob.jobType}</dd>
                          </div>
                        )}
                        {detailJob.availability && (
                          <div className="space-y-0.5">
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                              Availability
                            </dt>
                            <dd className="text-sm text-stone-800">{detailJob.availability}</dd>
                          </div>
                        )}
                        <div className="space-y-0.5">
                          <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                            Salary
                          </dt>
                          <dd className="text-sm font-medium text-stone-800">
                            {formatSalary(detailJob)}
                          </dd>
                        </div>
                        {detailJob.product && (
                          <div className="space-y-0.5">
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                              Product
                            </dt>
                            <dd className="text-sm text-stone-800">{detailJob.product}</dd>
                          </div>
                        )}
                        {detailJob.seniority && (
                          <div className="space-y-0.5">
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                              Seniority
                            </dt>
                            <dd className="text-sm text-stone-800">{detailJob.seniority}</dd>
                          </div>
                        )}
                        {detailJob.postedAt && (
                          <div className="space-y-0.5">
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                              Posted
                            </dt>
                            <dd className="text-sm text-stone-800">
                              {formatPostedAt(detailJob.postedAt)}
                            </dd>
                          </div>
                        )}
                        {detailJob.education && (
                          <div className="space-y-0.5 sm:col-span-2">
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                              Education
                            </dt>
                            <dd className="text-sm text-stone-800">{detailJob.education}</dd>
                          </div>
                        )}
                        {detailJob.source && (
                          <div className="space-y-0.5">
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                              Source
                            </dt>
                            <dd className="text-sm text-stone-800">{detailJob.source}</dd>
                          </div>
                        )}
                      </dl>
                    </section>

                    {(detailJob.collaborationTools?.length ?? 0) > 0 && (
                      <section>
                        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
                          Collaboration tools
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {detailJob.collaborationTools!.map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center rounded-lg bg-beige-200/80 px-2.5 py-1 text-xs font-medium text-stone-700"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </section>
                    )}

                    {detailJob.techStack.length > 0 && (
                      <section>
                        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
                          Tech stack
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {detailJob.techStack.map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center gap-1 rounded-lg bg-beige-200 px-2.5 py-1 text-xs font-medium text-stone-700"
                            >
                              <Code className="h-3.5 w-3.5 shrink-0" />
                              {t}
                            </span>
                          ))}
                        </div>
                      </section>
                    )}

                    {detailJob.notes && (
                      <section>
                        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
                          Notes
                        </h3>
                        <p className="rounded-lg bg-beige-100/80 p-3 text-sm text-stone-800 whitespace-pre-wrap">
                          {detailJob.notes}
                        </p>
                      </section>
                    )}

                    {detailJob.jdRaw && (
                      <section>
                        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
                          Full job description
                        </h3>
                        <div className="max-h-64 overflow-y-auto rounded-lg border border-beige-300 bg-beige-100/80 p-4 text-xs leading-relaxed text-stone-700 whitespace-pre-wrap scrollbar-thin">
                          {detailJob.jdRaw}
                        </div>
                      </section>
                    )}
                  </div>
                </div>

                <div className="sticky bottom-0 flex shrink-0 justify-end border-t border-beige-300 bg-beige-50/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
                  <button
                    type="button"
                    onClick={() => setDetailJob(null)}
                    className="inline-flex min-h-[44px] min-w-[120px] items-center justify-center rounded-lg border border-beige-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm hover:bg-beige-100 focus:outline-none focus:ring-2 focus:ring-orange-brand/20"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {parseModalOpen && (
            <div className="fixed inset-0 z-30 flex items-center justify-center bg-stone-900/50 p-4">
              <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-beige-300 bg-beige-50 shadow-xl">
                <div className="flex items-center justify-between border-b border-beige-300 px-4 py-3">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-stone-800">
                    <FileText className="h-5 w-5 text-orange-brand" />
                    Paste Job Description
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setParseModalOpen(false);
                      setParsePaste("");
                      setParseResult(null);
                      setEditedParseJson("");
                      setEditedFields(null);
                      setShowJsonEditor(false);
                      setCopySuccess(false);
                    }}
                    className="rounded-lg p-1.5 text-stone-500 hover:bg-beige-200 hover:text-stone-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                  <textarea
                    placeholder="Paste the full job description here..."
                    value={parsePaste}
                    onChange={(e) => setParsePaste(e.target.value)}
                    rows={6}
                    className="w-full rounded-lg border border-beige-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleParse}
                      disabled={!parsePaste.trim() || parseLoading}
                      className="inline-flex items-center gap-2 rounded-lg bg-orange-brand px-4 py-2 text-sm font-medium text-white hover:bg-orange-dark disabled:opacity-50"
                    >
                      {parseLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Parse with AI
                    </button>
                  </div>
                  {parseResult && (
                    <div className="rounded-lg border border-beige-300 bg-white p-4">
                      {"error" in parseResult ? (
                        <p className="text-sm text-red-600">{String(parseResult.error)}</p>
                      ) : (
                        <>
                          <div className="mb-4 flex items-center justify-between border-b border-beige-200 pb-3">
                            <p className="text-sm font-medium text-stone-700">
                              Parsed data — review, edit, and save
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setShowJsonEditor(!showJsonEditor)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-beige-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-beige-100 focus:outline-none focus:ring-2 focus:ring-orange-brand/20"
                              >
                                {showJsonEditor ? "Form View" : "JSON View"}
                              </button>
                              <button
                                type="button"
                                onClick={handleCopyAll}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-beige-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-beige-100 focus:outline-none focus:ring-2 focus:ring-orange-brand/20"
                                title="Copy all data to clipboard"
                              >
                                <Copy className="h-3.5 w-3.5" />
                                {copySuccess ? "Copied!" : "Copy All"}
                              </button>
                            </div>
                          </div>

                          {showJsonEditor ? (
                            <textarea
                              value={editedParseJson}
                              onChange={(e) => setEditedParseJson(e.target.value)}
                              className="w-full max-h-96 min-h-[200px] overflow-auto rounded border border-beige-300 bg-beige-50 p-3 font-mono text-xs text-stone-700 scrollbar-thin focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand"
                              spellCheck={false}
                              placeholder="Parsed JSON will appear here..."
                            />
                          ) : (
                            <div className="space-y-4 max-h-[60vh] overflow-y-auto scrollbar-thin">
                              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-stone-600">
                                    Title *
                                  </label>
                                  <input
                                    type="text"
                                    value={editedFields?.title || ""}
                                    onChange={(e) => updateField("title", e.target.value)}
                                    className="w-full rounded-lg border border-beige-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-stone-600">
                                    Company *
                                  </label>
                                  <input
                                    type="text"
                                    value={editedFields?.company || ""}
                                    onChange={(e) => updateField("company", e.target.value)}
                                    className="w-full rounded-lg border border-beige-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-stone-600">
                                    Location *
                                  </label>
                                  <input
                                    type="text"
                                    value={editedFields?.location || ""}
                                    onChange={(e) => updateField("location", e.target.value)}
                                    className="w-full rounded-lg border border-beige-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-stone-600">
                                    Role
                                  </label>
                                  <input
                                    type="text"
                                    value={editedFields?.role || ""}
                                    onChange={(e) => updateField("role", e.target.value)}
                                    className="w-full rounded-lg border border-beige-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-stone-600">
                                    Experience
                                  </label>
                                  <input
                                    type="text"
                                    value={editedFields?.experience || ""}
                                    onChange={(e) => updateField("experience", e.target.value)}
                                    className="w-full rounded-lg border border-beige-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-stone-600">
                                    Job Type
                                  </label>
                                  <input
                                    type="text"
                                    value={editedFields?.jobType || ""}
                                    onChange={(e) => updateField("jobType", e.target.value)}
                                    className="w-full rounded-lg border border-beige-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-stone-600">
                                    Salary Min (INR/yearly)
                                  </label>
                                  <input
                                    type="number"
                                    value={editedFields?.salaryMin || ""}
                                    onChange={(e) =>
                                      updateField(
                                        "salaryMin",
                                        e.target.value ? Number(e.target.value) : null
                                      )
                                    }
                                    className="w-full rounded-lg border border-beige-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-stone-600">
                                    Salary Max (INR/yearly)
                                  </label>
                                  <input
                                    type="number"
                                    value={editedFields?.salaryMax || ""}
                                    onChange={(e) =>
                                      updateField(
                                        "salaryMax",
                                        e.target.value ? Number(e.target.value) : null
                                      )
                                    }
                                    className="w-full rounded-lg border border-beige-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-stone-600">
                                    Seniority
                                  </label>
                                  <input
                                    type="text"
                                    value={editedFields?.seniority || ""}
                                    onChange={(e) => updateField("seniority", e.target.value)}
                                    className="w-full rounded-lg border border-beige-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-stone-600">
                                    Availability
                                  </label>
                                  <input
                                    type="text"
                                    value={editedFields?.availability || ""}
                                    onChange={(e) => updateField("availability", e.target.value)}
                                    className="w-full rounded-lg border border-beige-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-stone-600">
                                    Education
                                  </label>
                                  <input
                                    type="text"
                                    value={editedFields?.education || ""}
                                    onChange={(e) => updateField("education", e.target.value)}
                                    className="w-full rounded-lg border border-beige-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-stone-600">
                                    Posted At
                                  </label>
                                  <input
                                    type="text"
                                    value={editedFields?.postedAt || ""}
                                    onChange={(e) => updateField("postedAt", e.target.value)}
                                    className="w-full rounded-lg border border-beige-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-stone-600">
                                  Tech Stack (comma-separated)
                                </label>
                                <input
                                  type="text"
                                  value={editedFields?.techStack?.join(", ") || ""}
                                  onChange={(e) =>
                                    updateField(
                                      "techStack",
                                      e.target.value
                                        .split(",")
                                        .map((t) => t.trim())
                                        .filter(Boolean)
                                    )
                                  }
                                  className="w-full rounded-lg border border-beige-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-stone-600">
                                  Source
                                </label>
                                <input
                                  type="text"
                                  value={editedFields?.source || ""}
                                  onChange={(e) => updateField("source", e.target.value)}
                                  className="w-full rounded-lg border border-beige-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand"
                                />
                              </div>
                            </div>
                          )}

                          <div className="mt-4 flex gap-2">
                            <button
                              type="button"
                              onClick={handleSaveParsed}
                              disabled={saveLoading || (!editedFields && !editedParseJson.trim())}
                              className="inline-flex items-center gap-2 rounded-lg bg-orange-brand px-3 py-2 text-sm font-medium text-white hover:bg-orange-dark disabled:opacity-50"
                            >
                              {saveLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                              Save to tracker
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

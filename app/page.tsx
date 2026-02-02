"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Filter,
  Plus,
  Trash2,
  MapPin,
  Briefcase,
  DollarSign,
  Code,
  Clock,
  Loader2,
  FileText,
  X,
  Check,
  Eye,
} from "lucide-react";
import type { JobRecord } from "@/lib/types";

function getApiHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}

export default function HomePage() {
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
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | "bulk" | null>(null);

  const [searchResults, setSearchResults] = useState<JobRecord[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [detailJob, setDetailJob] = useState<JobRecord | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/jobs", { headers: getApiHeaders() });
      const data = await res.json();
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Fuzzy search API when user types in main search box (elastic-style)
  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/jobs/search?q=${encodeURIComponent(q)}&limit=100`, {
          headers: getApiHeaders(),
        });
        const data = await res.json();
        setSearchResults(Array.isArray(data.jobs) ? data.jobs : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

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
      const res = await fetch(`/api/jobs/${id}`, { method: "DELETE", headers: getApiHeaders() });
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
        headers: getApiHeaders(),
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
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
    setParseLoading(true);
    setParseResult(null);
    try {
      const res = await fetch("/api/jobs/parse", {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify({ jd: parsePaste.trim() }),
      });
      const data = await res.json();
      if (res.ok) setParseResult(data);
      else setParseResult({ error: data.error ?? "Parse failed" });
    } catch {
      setParseResult({ error: "Request failed" });
    } finally {
      setParseLoading(false);
    }
  };

  const handleSaveParsed = async () => {
    const record = parseResult?.record as Partial<JobRecord> | undefined;
    if (!record) return;
    setSaveLoading(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify(record),
      });
      if (res.ok) {
        const job = await res.json();
        setJobs((prev) => [job, ...prev]);
        setParseModalOpen(false);
        setParsePaste("");
        setParseResult(null);
      }
    } finally {
      setSaveLoading(false);
    }
  };

  const formatSalary = (job: JobRecord) => {
    const { salaryMin, salaryMax, salaryCurrency, salaryPeriod } = job;
    const period = salaryPeriod || "yearly";
    const curr = (salaryCurrency || "").trim();
    const isINRLakhs =
      (curr === "INR" || (!curr && salaryMin != null && salaryMin >= 100_000)) &&
      period === "yearly" &&
      (salaryMin == null || salaryMin >= 100_000) &&
      (salaryMax == null || salaryMax >= 100_000);
    const toLPA = (n: number) => (n / 100_000).toFixed(n % 100_000 === 0 ? 0 : 1);
    if (salaryMin != null && salaryMax != null) {
      if (isINRLakhs)
        return `${curr ? curr + " " : ""}${toLPA(salaryMin)} - ${toLPA(salaryMax)} LPA`;
      return `${curr ? curr + " " : ""}${salaryMin.toLocaleString()} - ${salaryMax.toLocaleString()}/${period}`;
    }
    if (salaryMin != null) {
      if (isINRLakhs) return `${curr ? curr + " " : ""}${toLPA(salaryMin)}+ LPA`;
      return `${curr ? curr + " " : ""}${salaryMin.toLocaleString()}+/${period}`;
    }
    if (salaryMax != null) {
      if (isINRLakhs) return `${curr ? curr + " " : ""}up to ${toLPA(salaryMax)} LPA`;
      return `${curr ? curr + " " : ""}up to ${salaryMax.toLocaleString()}/${period}`;
    }
    return "—";
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

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 border-b border-beige-300 bg-beige-100/95 backdrop-blur supports-[backdrop-filter]:bg-beige-100/80">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-5">
          {/* Mobile: stacked rows. Desktop: single row */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <h1 className="shrink-0 text-xl font-semibold text-stone-800 sm:text-2xl">
              Job Tracker
            </h1>
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
                    setParseModalOpen(true);
                    setParsePaste("");
                    setParseResult(null);
                  }}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-orange-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-dark focus:outline-none focus:ring-2 focus:ring-orange-brand/30 focus:ring-offset-2 focus:ring-offset-beige-50 sm:flex-initial"
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
          {/* Backdrop with transition */}
          <div
            className="absolute inset-0 bg-stone-900/60 backdrop-blur-[2px] transition-opacity"
            aria-hidden
          />

          <div
            className="relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-beige-300 border-b-0 bg-beige-50 shadow-2xl sm:max-h-[88vh] sm:max-w-2xl sm:rounded-2xl sm:border-b"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky header */}
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

            {/* Scrollable body with sections */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
              <div className="space-y-6">
                {/* Overview */}
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

                {/* Details grid */}
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

                {/* Collaboration tools */}
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

                {/* Tech stack */}
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

                {/* Notes */}
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

                {/* Raw JD */}
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

            {/* Sticky footer with close (mobile thumb reach) */}
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
                      <p className="mb-2 text-sm font-medium text-stone-700">
                        Parsed data — review and save
                      </p>
                      <pre className="max-h-48 overflow-auto rounded bg-beige-100 p-3 text-xs text-stone-700 scrollbar-thin">
                        {JSON.stringify(parseResult.parsed ?? parseResult.record, null, 2)}
                      </pre>
                      <button
                        type="button"
                        onClick={handleSaveParsed}
                        disabled={saveLoading}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-orange-brand px-3 py-2 text-sm font-medium text-white hover:bg-orange-dark disabled:opacity-50"
                      >
                        {saveLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Save to tracker
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import Fuse from "fuse.js";
import type { JobRecord, TechStackNormalized } from "./types";

function flattenTechStackNormalized(t: TechStackNormalized | null | undefined): string {
  if (!t) return "";
  const parts: string[] = [];
  const keys: (keyof TechStackNormalized)[] = [
    "languages",
    "frameworks",
    "stateManagement",
    "data",
    "apis",
    "buildTools",
    "packageManagers",
    "styling",
    "testing",
    "concepts",
    "versionControl",
    "databases",
    "architecture",
    "devOps",
    "methodologies",
    "designPrinciples",
    "operatingSystems",
    "collaborationTools",
  ];
  for (const key of keys) {
    const arr = t[key];
    if (Array.isArray(arr)) parts.push(...arr);
  }
  return parts.join(" ");
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  status?: JobRecord["status"];
  threshold?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function toSearchDoc(job: JobRecord) {
  const techFlat = Array.isArray(job.techStack) ? job.techStack.join(" ") : "";
  const techNorm = flattenTechStackNormalized(job.techStackNormalized);
  const techCombined = [techFlat, techNorm].filter(Boolean).join(" ");
  const collaborationStr = Array.isArray(job.collaborationTools)
    ? job.collaborationTools.join(" ")
    : "";
  return {
    id: job.id,
    title: job.title ?? "",
    company: job.company ?? "",
    companyPublisher: job.companyPublisher ?? "",
    role: job.role ?? "",
    location: job.location ?? "",
    experience: job.experience ?? "",
    product: job.product ?? "",
    seniority: job.seniority ?? "",
    collaborationTools: collaborationStr,
    techStack: techCombined,
    notes: job.notes ?? "",
    education: job.education ?? "",
    job,
  };
}

export interface FuzzySearchResult {
  jobs: JobRecord[];
  total: number;
}

export function fuzzySearchJobs(
  jobs: JobRecord[],
  query: string,
  options: SearchOptions = {}
): FuzzySearchResult {
  const { limit = DEFAULT_LIMIT, offset = 0, status, threshold = 0.4 } = options;

  let list = jobs;
  if (status) {
    list = list.filter((j) => j.status === status);
  }

  const cappedLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
  const safeOffset = Math.max(0, offset);

  if (!query || !String(query).trim()) {
    return {
      jobs: list.slice(safeOffset, safeOffset + cappedLimit),
      total: list.length,
    };
  }

  const docs = list.map(toSearchDoc);
  const fuse = new Fuse(docs, {
    keys: [
      { name: "title", weight: 0.28 },
      { name: "company", weight: 0.22 },
      { name: "companyPublisher", weight: 0.12 },
      { name: "role", weight: 0.18 },
      { name: "location", weight: 0.08 },
      { name: "experience", weight: 0.08 },
      { name: "product", weight: 0.1 },
      { name: "seniority", weight: 0.05 },
      { name: "collaborationTools", weight: 0.05 },
      { name: "techStack", weight: 0.12 },
      { name: "education", weight: 0.04 },
      { name: "notes", weight: 0.04 },
    ],
    threshold,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 1,
  });

  const results = fuse.search(String(query).trim());
  const total = results.length;
  const sliced = results.slice(safeOffset, safeOffset + cappedLimit);
  const jobsResult = sliced.map((r) => r.item.job);

  return { jobs: jobsResult, total };
}

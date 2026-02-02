export type JobStatus = "applied" | "screening" | "interview" | "offer" | "rejected" | "withdrawn";

/** Normalized tech stack by category for analytics and filtering. */
export interface TechStackNormalized {
  languages?: string[];
  frameworks?: string[];
  stateManagement?: string[];
  apis?: string[];
  buildTools?: string[];
  packageManagers?: string[];
  styling?: string[];
  testing?: string[];
  concepts?: string[];
  versionControl?: string[];
  databases?: string[];
  architecture?: string[];
  devOps?: string[];
  methodologies?: string[];
  designPrinciples?: string[];
  operatingSystems?: string[];
  /** Data-fetching / client data libs (e.g. TanStack Query). */
  data?: string[];
  /** Collaboration tools from JD (e.g. Slack, Notion, Jira). */
  collaborationTools?: string[];
}

export interface JobRecord {
  id: string;
  title: string;
  company: string;
  companyPublisher?: string | null;
  location: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: "hourly" | "monthly" | "yearly";
  techStack: string[];
  techStackNormalized?: TechStackNormalized | null;
  role: string;
  experience: string;
  jobType?: string | null;
  availability?: string | null;
  product?: string | null;
  seniority?: string | null;
  collaborationTools?: string[] | null;
  status: JobStatus;
  appliedAt: string;
  postedAt?: string | null;
  applicantsCount?: number | null;
  education?: string | null;
  source?: string;
  jdRaw?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobsData {
  jobs: JobRecord[];
  updatedAt: string;
}

// || instead of ?? so an empty-string env var falls through to the proxy default.
// In dev: NEXT_PUBLIC_API_URL is unset → BASE = '/api/v1' → goes via Next.js rewrite proxy
// In prod: set NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1 → direct absolute URL
const BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

// ── Token storage ─────────────────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('resumora_token');
}

export function setToken(token: string): void {
  localStorage.setItem('resumora_token', token);
}

export function clearAuth(): void {
  localStorage.removeItem('resumora_token');
  localStorage.removeItem('resumora_user');
}

// ── Safe JSON parser ──────────────────────────────────────────────────────────
// 1. Checks Content-Type FIRST — if the server returns text/html we catch it
//    before attempting JSON.parse, avoiding "Unexpected token '<'" entirely.
// 2. Falls back to attempting JSON.parse anyway in case the server omits the
//    content-type header but still returns a valid JSON body.
async function safeJson(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();

  // Fast path: content-type clearly says JSON
  if (contentType.includes('application/json') || contentType.includes('text/json')) {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new ApiError(
        `Server returned malformed JSON (HTTP ${res.status}).`,
        res.status,
      );
    }
  }

  // Slow path: content-type is wrong/missing — try parsing anyway
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Response is not JSON (HTML error page from a proxy, firewall, or wrong port).
    const hint =
      res.status === 0 || !res.status
        ? 'The backend may not be running.'
        : res.status >= 500
          ? `Backend returned HTTP ${res.status}.`
          : `HTTP ${res.status} from ${res.url || 'unknown URL'}.`;
    throw new ApiError(
      `Expected JSON but received ${contentType || 'unknown content type'}. ${hint}`,
      res.status,
    );
  }
}

// ── API error class ───────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Base fetch wrapper ────────────────────────────────────────────────────────

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();

  const url = `${BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch (networkErr) {
    // fetch() itself threw — connection refused, DNS failure, or CORS preflight blocked.
    console.error('[api-client] Network error fetching', url, networkErr);
    throw new ApiError(
      `Cannot connect to the API (${url}). Make sure the backend is running on port 3000.`,
      0,
    );
  }

  if (res.status === 401) {
    // Only redirect to /login if the user HAD a valid session token.
    // A 401 from a login/register attempt means "wrong credentials" — the user is
    // already on the auth page and we must NOT navigate away, or the error message
    // set by the catch block will disappear when the browser completes the navigation.
    const hadToken = !!token;
    clearAuth();
    if (hadToken) {
      window.location.href = '/login';
    }
    throw new ApiError('Session expired. Please sign in again.', 401);
  }

  const body = await safeJson(res);

  if (!res.ok || !body.success) {
    // Backend returns { success: false, message: "..." }
    const message =
      typeof body.message === 'string'
        ? body.message
        : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return body.data as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuthResult {
  user: AuthUser;
  token: string;
}

export interface Resume {
  id: string;
  title: string;
  originalFileName: string;
  status: 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
  fileSize: number | null;
  mimeType: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadResult {
  resumeId: string;
  jobId?: string;
  async: boolean;
  status?: string;
  statusUrl?: string;
  resultUrl?: string;
}

export interface JobStatus {
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  progress: number;
  message?: string;
  failedReason?: string;
}

// ── ATS Analysis types ────────────────────────────────────────────────────────

export interface AtsComponent {
  component: string;
  name: string;
  weight: number;
  raw_score: number;
}

export interface RedFlag {
  severity: string;
  category: string;
  description: string;
  evidence?: string;
}

export interface AtsStrength {
  level: string;
  category: string;
  description: string;
  evidence?: string;
}

export interface MissingRequirement {
  item: string;
  priority: 'REQUIRED' | 'PREFERRED';
  source: string;
}

export interface AtsAnalysisResult {
  analysisId: string;
  resumeId: string;
  overallScore: number;
  grade: string;
  components: AtsComponent[];
  strengths: string[];
  improvementAreas: string[];
  summary: string;
  recruiter: {
    shortlistProbability: number;
    decision: string;
    topRedFlags: RedFlag[];
    topStrengths: AtsStrength[];
    missingRequirements: MissingRequirement[];
    recruiterNotes: string;
  };
  scoringVersion: string;
  createdAt: string;
}

export interface AtsAnalysisSummary {
  id: string;
  resumeId: string;
  overallScore: number;
  grade: string;
  recruiterDecision: string;
  shortlistProbability: number;
  scoringVersion: string;
  createdAt: string;
}

// ── Comparison types ──────────────────────────────────────────────────────────

export interface ComparisonResult {
  comparisonId: string;
  resumeAId: string;
  resumeBId: string;
  improvementScoreDelta: number;
  atsScoreChange: number;
  addedSkills: string[];
  removedSkills: string[];
  isMeaningfulUpgrade: boolean;
  hasRegressions: boolean;
  explanation: string;
  recruiterSummary: string;
  createdAt: string;
  fullResult?: unknown;
}

export interface ComparisonListItem extends ComparisonResult {
  resumeA?: { title: string } | null;
  resumeB?: { title: string } | null;
}

// ── Job description types ──────────────────────────────────────────────────────

export interface JobDescriptionItem {
  id: string;
  title: string;
  company?: string | null;
  content: string;
  createdAt: string;
}

// ── Job fit (matching) types ──────────────────────────────────────────────────

export interface JobFitResult {
  id: string | null;
  resumeId: string;
  jobId: string;
  atsScore: number;
  skillScore: number;
  experienceScore: number;
  educationScore: number;
  keywordScore: number;
  semanticScore: number;
  matchingSkills: string[];
  missingRequiredSkills: string[];
  missingPreferredSkills: string[];
  keywordCoverage: { covered: string[]; missing: string[]; coverageRate: number };
  scoringVersion: string;
  embeddingsUsed: boolean;
  analyzedAt: string;
}

export interface JobFitHistoryItem {
  id: string;
  resumeId: string;
  jobId: string;
  overallScore: number;
  skillScore: number;
  experienceScore: number;
  educationScore: number;
  matchingSkills: string[];
  missingRequiredSkills: string[];
  embeddingsUsed: boolean;
  scoringVersion: string;
  createdAt: string;
  resume?: { id: string; title: string } | null;
  job?: { id: string; title: string; company: string | null } | null;
}

// ── History types ─────────────────────────────────────────────────────────────
// History now shows uploaded resumes (not ATS analyses / comparisons).
// Each item is a resume enriched with its latest analysis scores so the table
// can display ATS score and job-fit score without extra round-trips.

export interface HistoryItem {
  id:               string;
  title:            string;
  originalFileName: string;
  status:           'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
  fileSize:         number | null;
  mimeType:         string | null;
  createdAt:        string;
  updatedAt:        string;
  // Null until the user runs an ATS analysis for this resume
  atsScore:         number | null;
  atsGrade:         string | null;
  // Null until the user runs a job-fit analysis for this resume
  jobMatchScore:    number | null;
}

export interface HistoryResponse {
  items: HistoryItem[];
  total: number;
}

// ── API surface ───────────────────────────────────────────────────────────────

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<AuthResult>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),

    register: (data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    }) =>
      request<{ requiresVerification: boolean; devPreviewUrl?: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    forgotPassword: (email: string) =>
      request<{ sent: boolean; devPreviewUrl?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),

    resetPassword: (token: string, password: string) =>
      request<{ success: boolean }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      }),

    verifyEmail: (token: string) =>
      request<{ verified: boolean }>('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),

    resendVerification: (email: string) =>
      request<{ sent: boolean; devPreviewUrl?: string }>('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),

    deleteAccount: (password: string) =>
      request<{ deleted: boolean }>('/auth/account', {
        method: 'DELETE',
        body: JSON.stringify({ password }),
      }),

    google: (credential: string) =>
      request<AuthResult>('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential }),
      }),
  },

  resumes: {
    list: () => request<Resume[]>('/resumes'),

    get: (id: string) => request<Resume>(`/resumes/${id}`),

    delete: (id: string) =>
      request<{ deleted: boolean }>(`/resumes/${id}`, { method: 'DELETE' }),

    upload: async (file: File, title?: string): Promise<UploadResult> => {
      const token = getToken();
      const form = new FormData();
      // DO NOT manually set Content-Type — the browser must auto-generate the
      // multipart boundary. Setting it manually corrupts the boundary and the
      // backend cannot parse the body.
      form.append('file', file);
      if (title) form.append('title', title);

      // Bypass the Next.js rewrite proxy for file uploads. The proxy can fail to
      // correctly forward multipart/form-data bodies (binary, boundary-delimited),
      // returning a non-JSON error page that triggers "Expected JSON but received
      // unknown content type". Calling the backend directly is reliable.
      //
      // In development: NEXT_PUBLIC_BACKEND_URL=http://localhost:3000/api/v1
      // In production:  BASE is already an absolute URL (NEXT_PUBLIC_API_URL is set)
      const uploadBase = BASE.startsWith('http')
        ? BASE
        : (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3000/api/v1');

      let res: Response;
      try {
        res = await fetch(`${uploadBase}/resumes/upload`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        });
      } catch {
        throw new ApiError(
          'Cannot connect to the backend. Make sure the server is running on port 3000.',
          0,
        );
      }

      if (res.status === 401) {
        clearAuth();
        window.location.href = '/login';
        throw new ApiError('Session expired. Please sign in again.', 401);
      }

      let body: Record<string, unknown>;
      try {
        body = await safeJson(res);
      } catch {
        // Backend returned non-JSON (proxy error, 502, HTML error page, etc.)
        throw new ApiError(
          res.status === 0
            ? 'Cannot connect to the backend. Make sure the server is running on port 3000.'
            : res.status >= 500
              ? `Server error (HTTP ${res.status}). Please try again.`
              : `Upload failed (HTTP ${res.status}). Please try again.`,
          res.status,
        );
      }

      if (!res.ok || !body.success) {
        const message = typeof body.message === 'string' ? body.message : 'Upload failed. Please try again.';
        throw new ApiError(message, res.status);
      }
      return body.data as UploadResult;
    },
  },

  jobs: {
    status: (id: string) => request<JobStatus>(`/queue-jobs/${id}/status`),

    create: (title: string, content: string, company?: string) =>
      request<JobDescriptionItem>('/jobs', {
        method: 'POST',
        body: JSON.stringify({ title, content, ...(company ? { company } : {}) }),
      }),

    list: () =>
      request<{ data: JobDescriptionItem[]; count: number }>('/jobs'),
  },

  ats: {
    analyze: (resumeId: string, jobDescription?: string) =>
      request<AtsAnalysisResult>(`/resumes/${resumeId}/analyze`, {
        method: 'POST',
        body: JSON.stringify({ jobDescription }),
      }),

    listByResume: (resumeId: string) =>
      request<AtsAnalysisSummary[]>(`/resumes/${resumeId}/analyses`),

    get: (id: string) =>
      request<AtsAnalysisResult>(`/analyses/${id}`),
  },

  comparisons: {
    compare: (resumeAId: string, resumeBId: string, jobDescription?: string) =>
      request<ComparisonResult>('/compare-resumes', {
        method: 'POST',
        body: JSON.stringify({ resumeAId, resumeBId, ...(jobDescription ? { jobDescription } : {}) }),
      }),

    list: () =>
      request<{ rows: ComparisonListItem[]; total: number }>('/comparisons'),

    get: (id: string) =>
      request<ComparisonResult>(`/comparisons/${id}`),
  },

  jobFit: {
    analyze: (resumeId: string, jobId: string) =>
      request<JobFitResult>('/analysis/job-fit', {
        method: 'POST',
        body: JSON.stringify({ resumeId, jobId }),
      }),

    history: (resumeId?: string) =>
      request<{ data: JobFitHistoryItem[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } }>(
        `/analysis/history${resumeId ? `?resumeId=${resumeId}` : ''}`,
      ),
  },

  history: {
    get: (limit = 50, offset = 0) =>
      request<HistoryResponse>(`/history?limit=${limit}&offset=${offset}`),
  },
};

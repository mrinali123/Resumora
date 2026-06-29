// ─── OpenAPI 3.0 Specification ────────────────────────────────────────────────
//
// Single source of truth for the API contract.
// Served at GET /api/docs (Swagger UI) and GET /api/docs/json (raw JSON).
//
// Why a TypeScript object instead of swagger-jsdoc?
//   JSDoc annotations scatter the API contract across 30+ files, making it hard
//   to ensure consistency or find where a schema is defined. A single spec file
//   makes the contract explicit, reviewable, and easy to diff in PRs.
//
// Update policy: update this file BEFORE changing an endpoint's request/response
// shape. The spec is the contract; the implementation should match it.

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Resume + Job Match Analyzer API',
    version: '6.0.0',
    description: `
Production-grade resume analysis and career intelligence API.

**Features:**
- Resume upload and structured parsing
- Semantic search via pgvector embeddings
- ATS compatibility scoring
- Skill gap analysis and job ranking
- AI-powered career coaching (Phase 5)
- Background job processing (Phase 6)

**Authentication:** Bearer JWT token required for all endpoints except \`/auth/*\` and \`/health/*\`.
    `.trim(),
    contact: { name: 'API Support', email: 'api@resume-analyzer.io' },
    license: { name: 'MIT' },
  },
  servers: [
    { url: 'http://localhost:3000/api/v1', description: 'Local development' },
    { url: 'https://api.resume-analyzer.io/v1', description: 'Production' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtained from POST /auth/login',
      },
    },
    schemas: {
      // ── Shared ─────────────────────────────────────────────────────────────
      ErrorResponse: {
        type: 'object',
        required: ['success', 'error'],
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string', example: 'Resource not found' },
          statusCode: { type: 'integer', example: 404 },
        },
      },
      ValidationError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string' },
          details: { type: 'array', items: { type: 'object' } },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
          hasMore: { type: 'boolean' },
        },
      },
      // ── Auth ───────────────────────────────────────────────────────────────
      RegisterInput: {
        type: 'object',
        required: ['email', 'password', 'firstName', 'lastName'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          firstName: { type: 'string', maxLength: 50 },
          lastName: { type: 'string', maxLength: 50 },
        },
      },
      LoginInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              token: { type: 'string' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  email: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                },
              },
            },
          },
        },
      },
      // ── Resume ─────────────────────────────────────────────────────────────
      Resume: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED'] },
          originalFileName: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AsyncJobResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          async: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              resumeId: { type: 'string', format: 'uuid' },
              jobId: { type: 'string' },
              status: { type: 'string', enum: ['waiting', 'active', 'completed', 'failed'] },
              statusUrl: { type: 'string' },
              resultUrl: { type: 'string' },
            },
          },
        },
      },
      // ── Analysis ───────────────────────────────────────────────────────────
      JobFitInput: {
        type: 'object',
        required: ['resumeId', 'jobId'],
        properties: {
          resumeId: { type: 'string', format: 'uuid' },
          jobId: { type: 'string', format: 'uuid' },
          forceRefresh: { type: 'boolean', default: false },
          save: { type: 'boolean', default: true },
          weights: {
            type: 'object',
            description: 'Custom scoring weights. Must sum to 1.0.',
            properties: {
              skills: { type: 'number', minimum: 0, maximum: 1 },
              experience: { type: 'number', minimum: 0, maximum: 1 },
              education: { type: 'number', minimum: 0, maximum: 1 },
              keyword: { type: 'number', minimum: 0, maximum: 1 },
              semantic: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
        },
      },
      MatchAnalysis: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          atsScore: { type: 'number', minimum: 0, maximum: 100 },
          skillScore: { type: 'number' },
          experienceScore: { type: 'number' },
          educationScore: { type: 'number' },
          keywordScore: { type: 'number' },
          semanticScore: { type: 'number' },
          matchingSkills: { type: 'array', items: { type: 'string' } },
          missingRequiredSkills: { type: 'array', items: { type: 'string' } },
          embeddingsUsed: { type: 'boolean' },
          analyzedAt: { type: 'string', format: 'date-time' },
        },
      },
      // ── AI Features ────────────────────────────────────────────────────────
      AIResumeJobInput: {
        type: 'object',
        required: ['resumeId', 'jobId'],
        properties: {
          resumeId: { type: 'string', format: 'uuid' },
          jobId: { type: 'string', format: 'uuid' },
          forceRefresh: { type: 'boolean', default: false },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: 'Missing or invalid JWT token',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      Forbidden: {
        description: 'Resource does not belong to authenticated user',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      NotFound: {
        description: 'Resource not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      TooManyRequests: {
        description: 'Rate limit exceeded',
        headers: {
          'RateLimit-Limit': { schema: { type: 'integer' } },
          'RateLimit-Remaining': { schema: { type: 'integer' } },
          'Retry-After': { schema: { type: 'integer' } },
        },
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    // ── Health ─────────────────────────────────────────────────────────────────
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness probe',
        security: [],
        responses: { 200: { description: 'Service is alive' } },
      },
    },
    '/health/deep': {
      get: {
        tags: ['Health'],
        summary: 'Readiness probe — checks DB and Redis connectivity',
        security: [],
        responses: {
          200: { description: 'All dependencies healthy' },
          200.1: { description: 'Degraded (Redis down, caching disabled)' },
          503: { description: 'Unhealthy (DB unreachable)' },
        },
      },
    },
    // ── Auth ───────────────────────────────────────────────────────────────────
    '/api/v1/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Create a new account',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterInput' } } },
        },
        responses: {
          201: {
            description: 'Account created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } },
          },
          409: { description: 'Email already registered' },
          429: { $ref: '#/components/responses/TooManyRequests' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Sign in and receive a JWT',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginInput' } } },
        },
        responses: {
          200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          401: { description: 'Invalid credentials' },
          429: { $ref: '#/components/responses/TooManyRequests' },
        },
      },
    },
    // ── Resumes ───────────────────────────────────────────────────────────────
    '/api/v1/resumes/upload': {
      post: {
        tags: ['Resumes'],
        summary: 'Upload a resume file (PDF or DOCX)',
        description: 'When Redis is configured, processing is asynchronous. Poll GET /queue-jobs/:jobId/status for progress.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                  title: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Synchronous processing complete', content: { 'application/json': { schema: { $ref: '#/components/schemas/Resume' } } } },
          202: { description: 'Async job queued', content: { 'application/json': { schema: { $ref: '#/components/schemas/AsyncJobResponse' } } } },
          401: { $ref: '#/components/responses/Unauthorized' },
          429: { $ref: '#/components/responses/TooManyRequests' },
        },
      },
    },
    // ── Analysis ──────────────────────────────────────────────────────────────
    '/api/v1/analysis/job-fit': {
      post: {
        tags: ['ATS Analysis'],
        summary: 'Run ATS compatibility analysis for a resume + job pair',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/JobFitInput' } } },
        },
        responses: {
          200: { description: 'Analysis result (may be cached)', content: { 'application/json': { schema: { $ref: '#/components/schemas/MatchAnalysis' } } } },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/analysis/improve-resume': {
      post: {
        tags: ['AI Intelligence'],
        summary: 'Generate specific resume improvement suggestions',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AIResumeJobInput' } } } },
        responses: {
          200: { description: 'Improvement suggestions with priorities and examples' },
          429: { $ref: '#/components/responses/TooManyRequests' },
          503: { description: 'AI provider not configured' },
        },
      },
    },
    '/api/v1/analysis/roadmap': {
      post: {
        tags: ['AI Intelligence'],
        summary: 'Generate a prioritized skill-learning roadmap',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AIResumeJobInput' } } } },
        responses: { 200: { description: 'Roadmap with difficulty, timelines, and learning paths' } },
      },
    },
    '/api/v1/analysis/interview-prep': {
      post: {
        tags: ['AI Intelligence'],
        summary: 'Generate tailored interview questions',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AIResumeJobInput' } } } },
        responses: { 200: { description: 'Technical, behavioral, project, and gap-probe questions' } },
      },
    },
    '/api/v1/analysis/career-coach': {
      post: {
        tags: ['AI Intelligence'],
        summary: 'Holistic AI career coaching session',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AIResumeJobInput' } } } },
        responses: { 200: { description: 'Strengths, weaknesses, immediate actions, short/long-term goals' } },
      },
    },
    // ── Queue Jobs ────────────────────────────────────────────────────────────
    '/api/v1/queue-jobs/{id}/status': {
      get: {
        tags: ['Background Jobs'],
        summary: 'Poll background job progress',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Job completed or failed' },
          202: { description: 'Job still processing — continue polling' },
          404: { description: 'Job ID not found or expired' },
        },
      },
    },
    '/api/v1/queue-jobs/{id}/result': {
      get: {
        tags: ['Background Jobs'],
        summary: 'Fetch completed job result',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Result payload' },
          202: { description: 'Job not yet complete' },
          410: { description: 'Result expired — use main API to retrieve data' },
        },
      },
    },
  },
  tags: [
    { name: 'Health', description: 'Liveness and readiness probes' },
    { name: 'Authentication', description: 'Register and sign in' },
    { name: 'Resumes', description: 'Upload, parse, and manage resumes' },
    { name: 'ATS Analysis', description: 'Resume ↔ job compatibility scoring' },
    { name: 'AI Intelligence', description: 'LLM-powered career guidance' },
    { name: 'Background Jobs', description: 'Async job status and results' },
  ],
};

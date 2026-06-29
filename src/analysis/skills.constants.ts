// ─── Skills Dictionary & Scoring Configuration ────────────────────────────────
//
// Centralised constants for the Phase 4 analysis engine.
//
// TECH_SKILLS: canonical list used for:
//   1. Extracting required skills from raw job description text
//   2. Computing keyword coverage scores
//   3. Providing a normalised baseline for skill-gap detection
//
// SKILL_ALIASES: maps common variations (lowercase, no-punctuation) to the
//   canonical form so "nodejs", "node.js", and "Node" all resolve to "Node.js".
//
// DEFAULT_SCORING_WEIGHTS: the relative importance of each ATS component.
//   These are the numbers a Phase 5 UI should expose as sliders so users can
//   tune the engine for their specific domain (e.g. weight education higher
//   for medical/research roles, lower for early-career startup hires).
//
//   Weights must sum to exactly 1.0; ScoringService validates this at startup.

// ─── Scoring weights ──────────────────────────────────────────────────────────

export interface ScoringWeights {
  skills: number;      // direct skill match
  experience: number;  // semantic relevance of past roles
  education: number;   // formal education level met
  keyword: number;     // raw keyword coverage (surface signal)
  semantic: number;    // holistic resume ↔ job document similarity
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  skills: 0.35,      // Most signal: an exact skill list match is highly predictive
  experience: 0.35,  // Equal weight: relevant work experience matters as much as skills
  education: 0.15,   // Moderate: formal education rarely rules out tech candidates
  keyword: 0.10,     // Lower: surface coverage, not semantic relevance
  semantic: 0.05,    // Sanity check more than a primary signal
};

export const SCORING_VERSION = '4.0.0';

// ─── Semantic match threshold ─────────────────────────────────────────────────
// Cosine similarity above which a required skill is considered "semantically met"
// by a resume skill (e.g. "Containerisation" ↔ "Docker" ≈ 0.86)
export const SEMANTIC_MATCH_THRESHOLD = 0.82;

// Similarity above which required skill is considered a "partial" match
// (gets 0.75× credit in skill score calculation)
export const SEMANTIC_PARTIAL_THRESHOLD = 0.65;

// ─── Education level hierarchy ────────────────────────────────────────────────

export type EducationLevel = 'none' | 'associate' | 'bachelors' | 'masters' | 'phd';

export const EDU_LEVEL_RANK: Record<EducationLevel, number> = {
  none: 0,
  associate: 1,
  bachelors: 2,
  masters: 3,
  phd: 4,
};

// Scores when candidate is N levels below the requirement
export const EDU_SHORTFALL_SCORES: Record<number, number> = {
  0: 100, // meets or exceeds
  1: 70,  // one level below (e.g. BS when MS required)
  2: 50,  // two levels below
  3: 30,  // three levels below
};

// ─── Tech skills dictionary ───────────────────────────────────────────────────

export const TECH_SKILLS: readonly string[] = [
  // Languages
  'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C', 'C++', 'C#',
  'PHP', 'Ruby', 'Swift', 'Kotlin', 'Scala', 'Haskell', 'Elixir', 'R', 'MATLAB',
  'Perl', 'Dart', 'Julia', 'Clojure', 'F#',
  // Frontend
  'React', 'Vue', 'Angular', 'Next.js', 'Nuxt', 'Svelte', 'SvelteKit', 'Remix',
  'HTML', 'CSS', 'Sass', 'SCSS', 'Tailwind', 'Bootstrap', 'MUI',
  'Redux', 'Zustand', 'MobX', 'Webpack', 'Vite', 'Rollup', 'Parcel',
  'WebAssembly',
  // Backend / Runtime
  'Node.js', 'Deno', 'Bun', 'Express', 'Fastify', 'NestJS', 'Koa', 'Hapi',
  'Django', 'Flask', 'FastAPI', 'Celery',
  'Spring', 'Spring Boot', 'Hibernate', 'Micronaut', 'Quarkus',
  'Rails', 'Laravel', 'Symfony',
  'ASP.NET', '.NET', 'Entity Framework',
  'GraphQL', 'REST', 'gRPC', 'WebSockets', 'Socket.io',
  // Databases
  'PostgreSQL', 'MySQL', 'MariaDB', 'SQLite', 'Oracle',
  'MongoDB', 'CouchDB', 'Firestore',
  'Redis', 'Memcached',
  'Elasticsearch', 'OpenSearch', 'Solr',
  'Cassandra', 'DynamoDB', 'CosmosDB',
  'Neo4j', 'InfluxDB', 'TimescaleDB', 'ClickHouse',
  'Snowflake', 'BigQuery', 'Redshift',
  'Prisma', 'TypeORM', 'Sequelize', 'SQLAlchemy', 'Drizzle',
  'pgvector',
  // Cloud
  'AWS', 'GCP', 'Azure', 'DigitalOcean', 'Vercel', 'Netlify',
  'Lambda', 'EC2', 'S3', 'ECS', 'EKS', 'RDS', 'CloudFront', 'SQS', 'SNS',
  'Cloud Run', 'Cloud Functions', 'GKE', 'BigQuery',
  'Azure Functions', 'Azure DevOps', 'AKS',
  // DevOps & Infrastructure
  'Docker', 'Kubernetes', 'Helm', 'ArgoCD', 'Flux',
  'Terraform', 'Pulumi', 'CDK', 'CloudFormation', 'Ansible',
  'Jenkins', 'GitHub Actions', 'GitLab CI', 'CircleCI', 'Bitbucket Pipelines',
  'Prometheus', 'Grafana', 'Datadog', 'New Relic', 'OpenTelemetry',
  'Nginx', 'Apache', 'Traefik', 'Istio', 'Consul',
  'Vault', 'OAuth', 'JWT', 'SAML', 'OIDC',
  // Messaging / Queues
  'Kafka', 'RabbitMQ', 'NATS', 'Pulsar', 'ActiveMQ',
  // Testing
  'Jest', 'Vitest', 'Mocha', 'Chai', 'Sinon',
  'Pytest', 'JUnit', 'RSpec',
  'Cypress', 'Playwright', 'Selenium', 'Puppeteer',
  'k6', 'Gatling', 'JMeter',
  // AI / ML
  'TensorFlow', 'PyTorch', 'Keras', 'scikit-learn', 'XGBoost', 'LightGBM',
  'OpenAI', 'LangChain', 'LlamaIndex', 'Hugging Face', 'CUDA',
  'MLflow', 'Airflow', 'Prefect', 'Dagster',
  // Architecture / Practices
  'Microservices', 'CQRS', 'DDD', 'TDD', 'BDD', 'CI/CD', 'GitOps', 'Agile', 'Scrum',
  // Tooling
  'Git', 'GitHub', 'GitLab', 'Bitbucket', 'Linux', 'Bash', 'PowerShell',
] as const;

// Maps lowercase-no-punctuation form → canonical skill name in TECH_SKILLS
// Used by normaliseSkill() to resolve aliases before dictionary matching.
export const SKILL_ALIASES: Readonly<Record<string, string>> = {
  js: 'JavaScript',
  ts: 'TypeScript',
  py: 'Python',
  golang: 'Go',
  nodejs: 'Node.js',
  node: 'Node.js',
  reactjs: 'React',
  vuejs: 'Vue',
  angularjs: 'Angular',
  nextjs: 'Next.js',
  nuxtjs: 'Nuxt',
  nestjs: 'NestJS',
  postgres: 'PostgreSQL',
  psql: 'PostgreSQL',
  pg: 'PostgreSQL',
  mongo: 'MongoDB',
  k8s: 'Kubernetes',
  k8: 'Kubernetes',
  tf: 'TensorFlow',
  pytorch: 'PyTorch',
  dotnet: '.NET',
  csharp: 'C#',
  cpp: 'C++',
  springboot: 'Spring Boot',
  elasticsearch: 'Elasticsearch',
  es: 'Elasticsearch',
  graphql: 'GraphQL',
  gql: 'GraphQL',
  grpc: 'gRPC',
  websocket: 'WebSockets',
  cicd: 'CI/CD',
  tailwindcss: 'Tailwind',
  hf: 'Hugging Face',
};

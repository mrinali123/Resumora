// ─── Skill Normalizer ─────────────────────────────────────────────────────────
//
// Three-stage normalization pipeline:
//   1. Alias resolution  — "reactjs" → "React", "k8s" → "Kubernetes"
//   2. Dictionary match  — verify against TECH_SKILLS canonical list
//   3. Deduplication     — case-insensitive, keeps the more canonical casing
//
// Imports the existing SKILL_ALIASES and TECH_SKILLS from skills.constants.ts
// so canonical names stay in one place.

import { SKILL_ALIASES, TECH_SKILLS } from '../../analysis/skills.constants';

// ─── Extended alias map ───────────────────────────────────────────────────────
// Augments the existing analysis-layer aliases with parser-specific variations
// seen in real resume text (different from JD text patterns).
const PARSER_EXTRA_ALIASES: Record<string, string> = {
  // JavaScript
  'javascript': 'JavaScript',
  'ecmascript': 'JavaScript',
  'es6': 'JavaScript',
  'es2015': 'JavaScript',
  'es2020': 'JavaScript',
  'vanilla js': 'JavaScript',
  'typescript': 'TypeScript',
  'node.js': 'Node.js',
  'nodejs': 'Node.js',
  'deno': 'Deno',
  'bun': 'Bun',

  // React ecosystem
  'react': 'React',
  'react.js': 'React',
  'react js': 'React',
  'react native': 'React Native',
  'react-native': 'React Native',
  'rn': 'React Native',
  'redux': 'Redux',
  'zustand': 'Zustand',
  'mobx': 'MobX',
  'next.js': 'Next.js',
  'nuxt.js': 'Nuxt',
  'svelte': 'Svelte',
  'sveltekit': 'SvelteKit',
  'remix': 'Remix',
  'gatsby': 'Gatsby',

  // Vue / Angular
  'vue': 'Vue',
  'vue.js': 'Vue',
  'nuxt': 'Nuxt',
  'angular': 'Angular',
  'angularjs': 'AngularJS',

  // Python
  'python': 'Python',
  'python 3': 'Python',
  'python3': 'Python',
  'django': 'Django',
  'flask': 'Flask',
  'fastapi': 'FastAPI',
  'celery': 'Celery',
  'pandas': 'Pandas',
  'numpy': 'NumPy',
  'scipy': 'SciPy',
  'matplotlib': 'Matplotlib',

  // Java
  'java': 'Java',
  'kotlin': 'Kotlin',
  'spring': 'Spring',
  'spring boot': 'Spring Boot',
  'spring framework': 'Spring',
  'hibernate': 'Hibernate',
  'maven': 'Maven',
  'gradle': 'Gradle',
  'junit': 'JUnit',
  'junit5': 'JUnit',
  'micronaut': 'Micronaut',
  'quarkus': 'Quarkus',

  // Go / Rust / C
  'go': 'Go',
  'golang': 'Go',
  'rust': 'Rust',
  'c': 'C',
  'c++': 'C++',
  'c/c++': 'C++',
  'cpp': 'C++',
  'c#': 'C#',
  '.net': '.NET',
  'dotnet': '.NET',
  'asp.net': 'ASP.NET',
  'asp.net core': 'ASP.NET',
  'entity framework': 'Entity Framework',

  // Ruby / PHP
  'ruby': 'Ruby',
  'ruby on rails': 'Rails',
  'ror': 'Rails',
  'rails': 'Rails',
  'php': 'PHP',
  'laravel': 'Laravel',
  'symfony': 'Symfony',

  // Swift / Dart
  'swift': 'Swift',
  'swiftui': 'SwiftUI',
  'objective-c': 'Objective-C',
  'dart': 'Dart',
  'flutter': 'Flutter',

  // Scala / Haskell / Elixir
  'scala': 'Scala',
  'akka': 'Akka',
  'haskell': 'Haskell',
  'elixir': 'Elixir',
  'phoenix': 'Phoenix',

  // Shell
  'bash': 'Bash',
  'shell': 'Bash',
  'shell scripting': 'Bash',
  'zsh': 'Bash',
  'powershell': 'PowerShell',

  // SQL / Databases
  'sql': 'SQL',
  'plsql': 'PL/SQL',
  'pl/sql': 'PL/SQL',
  'mysql': 'MySQL',
  'mariadb': 'MariaDB',
  'postgres': 'PostgreSQL',
  'postgresql': 'PostgreSQL',
  'psql': 'PostgreSQL',
  'sqlite': 'SQLite',
  'oracle': 'Oracle',
  'mongodb': 'MongoDB',
  'mongo': 'MongoDB',
  'mongoose': 'Mongoose',
  'redis': 'Redis',
  'elasticsearch': 'Elasticsearch',
  'elastic search': 'Elasticsearch',
  'opensearch': 'OpenSearch',
  'cassandra': 'Cassandra',
  'dynamodb': 'DynamoDB',
  'dynamo db': 'DynamoDB',
  'cosmosdb': 'CosmosDB',
  'cosmos db': 'CosmosDB',
  'firebase': 'Firebase',
  'firestore': 'Firestore',
  'supabase': 'Supabase',
  'neo4j': 'Neo4j',
  'influxdb': 'InfluxDB',
  'timescaledb': 'TimescaleDB',
  'clickhouse': 'ClickHouse',
  'snowflake': 'Snowflake',
  'bigquery': 'BigQuery',
  'redshift': 'Redshift',
  'prisma': 'Prisma',
  'typeorm': 'TypeORM',
  'sequelize': 'Sequelize',
  'sqlalchemy': 'SQLAlchemy',
  'drizzle': 'Drizzle',
  'pgvector': 'pgvector',

  // Cloud
  'aws': 'AWS',
  'amazon web services': 'AWS',
  'amazon aws': 'AWS',
  'gcp': 'GCP',
  'google cloud': 'GCP',
  'google cloud platform': 'GCP',
  'azure': 'Azure',
  'microsoft azure': 'Azure',
  'digitalocean': 'DigitalOcean',
  'vercel': 'Vercel',
  'netlify': 'Netlify',
  'heroku': 'Heroku',
  'lambda': 'AWS Lambda',
  'aws lambda': 'AWS Lambda',
  'ec2': 'AWS EC2',
  's3': 'AWS S3',
  'ecs': 'AWS ECS',
  'eks': 'AWS EKS',
  'rds': 'AWS RDS',

  // DevOps / Infrastructure
  'docker': 'Docker',
  'kubernetes': 'Kubernetes',
  'k8': 'Kubernetes',
  'helm': 'Helm',
  'argocd': 'ArgoCD',
  'argo cd': 'ArgoCD',
  'terraform': 'Terraform',
  'pulumi': 'Pulumi',
  'ansible': 'Ansible',
  'jenkins': 'Jenkins',
  'github actions': 'GitHub Actions',
  'gitlab ci': 'GitLab CI',
  'gitlab ci/cd': 'GitLab CI',
  'circle ci': 'CircleCI',
  'circleci': 'CircleCI',
  'nginx': 'Nginx',
  'apache': 'Apache',
  'traefik': 'Traefik',
  'istio': 'Istio',
  'prometheus': 'Prometheus',
  'grafana': 'Grafana',
  'datadog': 'Datadog',
  'opentelemetry': 'OpenTelemetry',
  'ci/cd': 'CI/CD',
  'cicd': 'CI/CD',
  'devops': 'DevOps',

  // Messaging
  'kafka': 'Kafka',
  'apache kafka': 'Kafka',
  'rabbitmq': 'RabbitMQ',
  'rabbit mq': 'RabbitMQ',
  'nats': 'NATS',
  'sqs': 'AWS SQS',
  'sns': 'AWS SNS',

  // Frontend tooling
  'html': 'HTML',
  'css': 'CSS',
  'html5': 'HTML',
  'css3': 'CSS',
  'html/css': 'HTML/CSS',
  'sass': 'Sass',
  'scss': 'Sass',
  'less': 'Less',
  'tailwind': 'Tailwind',
  'tailwindcss': 'Tailwind',
  'tailwind css': 'Tailwind',
  'bootstrap': 'Bootstrap',
  'material ui': 'MUI',
  'mui': 'MUI',
  'material-ui': 'MUI',
  'chakra ui': 'Chakra UI',
  'chakra': 'Chakra UI',
  'shadcn': 'shadcn/ui',
  'shadcn/ui': 'shadcn/ui',
  'webpack': 'Webpack',
  'vite': 'Vite',
  'babel': 'Babel',
  'eslint': 'ESLint',
  'prettier': 'Prettier',
  'storybook': 'Storybook',

  // API styles
  'graphql': 'GraphQL',
  'gql': 'GraphQL',
  'rest': 'REST API',
  'rest api': 'REST API',
  'restful': 'REST API',
  'restful api': 'REST API',
  'grpc': 'gRPC',
  'websocket': 'WebSockets',
  'websockets': 'WebSockets',
  'socket.io': 'Socket.io',
  'openapi': 'OpenAPI',
  'swagger': 'Swagger',

  // Testing
  'jest': 'Jest',
  'vitest': 'Vitest',
  'mocha': 'Mocha',
  'chai': 'Chai',
  'cypress': 'Cypress',
  'playwright': 'Playwright',
  'selenium': 'Selenium',
  'puppeteer': 'Puppeteer',
  'pytest': 'Pytest',
  'rspec': 'RSpec',
  'k6': 'k6',
  'jmeter': 'JMeter',

  // AI / ML
  'tensorflow': 'TensorFlow',
  'pytorch': 'PyTorch',
  'torch': 'PyTorch',
  'keras': 'Keras',
  'scikit-learn': 'scikit-learn',
  'scikit learn': 'scikit-learn',
  'sklearn': 'scikit-learn',
  'xgboost': 'XGBoost',
  'lightgbm': 'LightGBM',
  'openai': 'OpenAI',
  'langchain': 'LangChain',
  'llamaindex': 'LlamaIndex',
  'llama index': 'LlamaIndex',
  'hugging face': 'Hugging Face',
  'huggingface': 'Hugging Face',
  'cuda': 'CUDA',
  'mlflow': 'MLflow',
  'airflow': 'Airflow',
  'apache airflow': 'Airflow',
  'nlp': 'NLP',
  'machine learning': 'Machine Learning',
  'deep learning': 'Deep Learning',
  'computer vision': 'Computer Vision',
  'llm': 'LLM',
  'generative ai': 'Generative AI',
  'gen ai': 'Generative AI',
  'rag': 'RAG',

  // VCS / Tooling
  'git': 'Git',
  'github': 'GitHub',
  'gitlab': 'GitLab',
  'bitbucket': 'Bitbucket',
  'linux': 'Linux',
  'unix': 'Linux',
  'ubuntu': 'Linux',
  'macos': 'macOS',
  'jira': 'Jira',
  'confluence': 'Confluence',
  'figma': 'Figma',
  'postman': 'Postman',
  'agile': 'Agile',
  'scrum': 'Scrum',
  'kanban': 'Kanban',
};

// ─── Combined alias lookup ────────────────────────────────────────────────────

const ALL_ALIASES: Map<string, string> = new Map([
  ...Object.entries(SKILL_ALIASES),
  ...Object.entries(PARSER_EXTRA_ALIASES),
]);

// Lower-cased TECH_SKILLS set for O(1) canonical lookup
const TECH_SKILLS_LOWER: Map<string, string> = new Map(
  (TECH_SKILLS as readonly string[]).map((s) => [s.toLowerCase(), s]),
);

// ─── Normalisation logic ──────────────────────────────────────────────────────

// Normalises a single raw skill token into its canonical form, or returns null
// if the token cannot be mapped to a known technology.
export function normaliseSkill(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 80) return null;

  // 1. Alias resolution (case-insensitive, strip punctuation for lookup)
  const key = trimmed.toLowerCase().replace(/[.\-/]/g, '').replace(/\s+/g, ' ');
  const aliasHit = ALL_ALIASES.get(key) ?? ALL_ALIASES.get(trimmed.toLowerCase());
  if (aliasHit) return aliasHit;

  // 2. Canonical tech skills dict (case-insensitive)
  const dictHit = TECH_SKILLS_LOWER.get(trimmed.toLowerCase());
  if (dictHit) return dictHit;

  // 3. Partial alias match — handles "React.js (Hooks)" style tokens
  for (const [alias, canonical] of ALL_ALIASES) {
    if (trimmed.toLowerCase().startsWith(alias + ' ') || trimmed.toLowerCase() === alias) {
      return canonical;
    }
  }

  // 4. Passthrough — keep token as-is if it looks like a valid tech name.
  //    Reject tokens that are obviously not skills (too short, all lowercase
  //    single word, contains only common English words).
  if (looksLikeTechTerm(trimmed)) return trimmed;

  return null;
}

// Normalise and deduplicate a list of raw skill strings.
// Dedup key is lowercase normalised name — keeps the first canonical hit.
export function normaliseAndDedup(rawSkills: string[]): string[] {
  const seen = new Map<string, string>(); // lowerKey → canonical

  for (const raw of rawSkills) {
    const canonical = normaliseSkill(raw);
    if (!canonical) continue;

    const key = canonical.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, canonical);
    }
  }

  return Array.from(seen.values());
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Heuristic: does this string look like it could be a technology name?
// Used for passthrough when the alias map has no entry.
function looksLikeTechTerm(token: string): boolean {
  // Must be 2–60 chars
  if (token.length < 2 || token.length > 60) return false;

  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(token)) return false;

  // Reject tokens that are common English words unlikely to be a skill
  const commonWords = new Set([
    'and', 'the', 'for', 'with', 'using', 'strong', 'good', 'great',
    'excellent', 'experience', 'knowledge', 'proficiency', 'familiar',
    'worked', 'used', 'built', 'including', 'etc', 'such', 'as',
  ]);
  if (commonWords.has(token.toLowerCase())) return false;

  // Accept if starts with a capital (technology names usually do)
  if (/^[A-Z]/.test(token)) return true;

  // Accept known all-lowercase tech names (git, npm, pip, etc.)
  const knownLower = new Set(['git', 'npm', 'pip', 'yarn', 'pnpm', 'bun', 'make', 'cmake']);
  if (knownLower.has(token.toLowerCase())) return true;

  // Accept short uppercase acronyms (SQL, API, JWT, etc.)
  if (/^[A-Z]{2,8}$/.test(token)) return true;

  return false;
}

export const mockResumes = [
  {
    id: "r1",
    name: "Mrinali_Parida_SWE.pdf",
    uploadedAt: "2026-06-23T10:30:00Z",
    atsScore: 87,
    matchScore: 92,
    skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker", "AWS", "GraphQL", "Redis"],
    experience: "3 years",
    status: "analyzed",
  },
  {
    id: "r2",
    name: "Mrinali_Parida_DS.pdf",
    uploadedAt: "2026-06-20T14:00:00Z",
    atsScore: 74,
    matchScore: 68,
    skills: ["Python", "TensorFlow", "PyTorch", "Pandas", "SQL", "Scikit-learn"],
    experience: "2 years",
    status: "analyzed",
  },
];

export const mockResumeDetail = {
  id: "r1",
  name: "Mrinali Parida",
  email: "mrinali@example.com",
  phone: "+91 98765 43210",
  location: "Bangalore, India",
  linkedin: "linkedin.com/in/mrinali",
  github: "github.com/mrinali",
  rawText: `MRINALI PARIDA
Software Engineer | Full-Stack Developer
mrinali@example.com | +91 98765 43210 | Bangalore, India

SUMMARY
Passionate Software Engineer with 3+ years of experience building scalable web applications.
Proficient in TypeScript, React, Node.js, and cloud infrastructure. Strong focus on performance
optimization and developer experience.

EXPERIENCE
Senior Software Engineer — TechCorp India (2024 – Present)
• Led development of a microservices-based e-commerce platform serving 2M+ users
• Reduced API response time by 40% through Redis caching and query optimization
• Mentored 3 junior developers and conducted 50+ code reviews

Software Engineer — StartupXYZ (2022 – 2024)
• Built React dashboard with real-time analytics using WebSockets
• Implemented CI/CD pipelines with GitHub Actions and Docker
• Designed PostgreSQL schema for multi-tenant SaaS application

SKILLS
Languages: TypeScript, JavaScript, Python, Go
Frontend: React, Next.js, TailwindCSS, Redux
Backend: Node.js, Express, GraphQL, REST APIs
Databases: PostgreSQL, Redis, MongoDB, pgvector
DevOps: Docker, Kubernetes, AWS, GitHub Actions
Tools: Git, Jira, Figma, Postman

EDUCATION
B.Tech Computer Science — NIT Rourkela (2019 – 2023) | CGPA: 8.9/10

PROJECTS
• Resume Analyzer AI — Full-stack AI platform for resume parsing and job matching
• OpenSource CLI Tool — 2K+ GitHub stars, used by 500+ developers`,
  structured: {
    skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker", "AWS", "GraphQL", "Redis", "Next.js", "Python"],
    experience: [
      { role: "Senior Software Engineer", company: "TechCorp India", duration: "2024–Present", highlights: ["Led microservices platform for 2M+ users", "40% API speedup via Redis", "Mentored 3 devs"] },
      { role: "Software Engineer", company: "StartupXYZ", duration: "2022–2024", highlights: ["Real-time React dashboard", "CI/CD with Docker", "PostgreSQL multi-tenant schema"] },
    ],
    education: [{ degree: "B.Tech Computer Science", institution: "NIT Rourkela", year: "2019–2023", gpa: "8.9/10" }],
    projects: ["Resume Analyzer AI", "OpenSource CLI Tool (2K+ stars)"],
    certifications: ["AWS Solutions Architect", "Google Cloud Professional"],
  },
  insights: [
    { type: "strength", text: "Strong full-stack coverage with modern tooling" },
    { type: "strength", text: "Quantified impact — perfect for ATS" },
    { type: "improvement", text: "Add system design keywords: distributed systems, event-driven" },
    { type: "improvement", text: "Include leadership metrics — team size, OKR impact" },
  ],
};

export const mockJobMatch = {
  jobTitle: "Senior Software Engineer — Google",
  company: "Google",
  matchScore: 87,
  atsScore: 82,
  overlappingSkills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker", "GraphQL", "Redis"],
  missingSkills: ["Kubernetes", "gRPC", "Protobuf", "Bazel", "Go"],
  strongMatches: [
    "3+ years full-stack experience matches JD requirement",
    "PostgreSQL + Redis expertise aligns with data infrastructure needs",
    "Open-source contributions demonstrate technical depth",
  ],
  gaps: [
    "No Kubernetes production experience mentioned",
    "gRPC/Protobuf not listed — common in Google's infra",
    "Go proficiency required; only basic exposure evident",
  ],
};

export const mockATSData = {
  overall: 87,
  breakdown: {
    skills: 92,
    experience: 85,
    education: 90,
    keywords: 81,
    formatting: 88,
    impact: 84,
  },
  radarData: [
    { subject: "Skills", score: 92, fullMark: 100 },
    { subject: "Experience", score: 85, fullMark: 100 },
    { subject: "Education", score: 90, fullMark: 100 },
    { subject: "Keywords", score: 81, fullMark: 100 },
    { subject: "Format", score: 88, fullMark: 100 },
    { subject: "Impact", score: 84, fullMark: 100 },
  ],
  keywordsFound: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker", "AWS", "REST API", "CI/CD", "Agile", "Microservices"],
  keywordsMissed: ["Kubernetes", "Go", "gRPC", "Terraform", "System Design"],
  topRecommendations: [
    "Add measurable outcomes to every bullet point",
    "Include cloud-native keywords: Terraform, Helm, ArgoCD",
    "Strengthen leadership section with team size + revenue impact",
  ],
};

export const mockChatHistory = [
  {
    role: "assistant" as const,
    content: "Hey! I'm your AI Career Coach powered by Claude. I've analyzed your resume and I'm ready to help you land your dream job. What would you like to work on today?",
    timestamp: new Date(Date.now() - 120000),
    suggestions: ["Improve my resume", "Prep for Google interview", "Find skill gaps", "Build learning roadmap"],
  },
  {
    role: "user" as const,
    content: "Help me prepare for a Google SWE interview",
    timestamp: new Date(Date.now() - 60000),
  },
  {
    role: "assistant" as const,
    content: "Great choice! Google's SWE interviews follow a structured format. Based on your resume, here's a targeted prep plan:",
    timestamp: new Date(Date.now() - 30000),
    cards: [
      { title: "Coding Rounds (4–5)", items: ["LeetCode Medium/Hard: Arrays, Trees, Graphs, DP", "Practice 2–3 problems daily for 6 weeks", "Target: 150+ problems solved"] },
      { title: "System Design", items: ["Study distributed systems: CAP theorem, consistent hashing", "Design: URL shortener, chat app, news feed", "Excite reviewers with your Redis + pgvector experience!"] },
      { title: "Behavioral (Googleyness)", items: ["STAR format answers for 10+ scenarios", "Emphasize: collaboration, ambiguity handling, impact", "Your mentorship experience is a strong signal"] },
    ],
  },
];

export const mockInterviewQuestions = {
  technical: [
    { q: "Implement a LRU Cache with O(1) get and put operations.", difficulty: "Medium", tag: "Data Structures", answer: "Use a HashMap + Doubly Linked List. HashMap gives O(1) access; DLL maintains insertion order for O(1) eviction. In TypeScript: maintain a `map: Map<number, Node>` and a dummy head/tail..." },
    { q: "Design a rate limiter for a distributed API gateway.", difficulty: "Hard", tag: "System Design", answer: "Token bucket or sliding window log. For distributed systems, use Redis INCR + EXPIRE with Lua scripts for atomic operations. Handle race conditions with Lua scripting..." },
    { q: "Given a binary tree, find the maximum path sum.", difficulty: "Hard", tag: "Trees", answer: "DFS recursion. At each node, compute max gain from left/right subtrees (ignore negatives). Track global max. Time O(n), Space O(h)..." },
    { q: "How would you optimize a React app that's re-rendering too frequently?", difficulty: "Medium", tag: "React", answer: "Profile with React DevTools Profiler. Apply: React.memo, useMemo, useCallback, lazy loading, virtualization (react-virtual for lists), code splitting..." },
  ],
  behavioral: [
    { q: "Tell me about a time you led a project under a tight deadline.", difficulty: "Medium", tag: "Leadership", answer: "STAR: Situation — our team had 2 weeks to deliver a critical feature. Task — I led 3 engineers. Action — daily standups, broke tasks into 4-hour chunks, unblocked blockers myself. Result — shipped 2 days early..." },
    { q: "Describe a situation where you disagreed with your manager.", difficulty: "Medium", tag: "Conflict", answer: "Stay factual, show respect. Example: disagreed on tech choice (REST vs GraphQL). Presented data, proposed a spike. Manager approved. GraphQL reduced client round-trips by 60%..." },
    { q: "Give an example of handling ambiguous requirements.", difficulty: "Easy", tag: "Problem Solving", answer: "Ask clarifying questions, break down assumptions, propose 2-3 solutions with tradeoffs, get buy-in early, document decisions..." },
  ],
  project: [
    { q: "Walk me through your most impactful project.", difficulty: "Medium", tag: "Portfolio", answer: "Resume Analyzer: Problem, Architecture (Node.js + pgvector + OpenAI), Challenges (embedding costs, latency), Impact (X users, Y% accuracy)..." },
    { q: "How did you ensure scalability in your microservices platform?", difficulty: "Hard", tag: "Architecture", answer: "Horizontal scaling with Kubernetes HPA, Redis for session/cache, PostgreSQL read replicas, async processing with BullMQ, CDN for static assets..." },
  ],
};

export const mockRoadmap = [
  {
    week: "Week 1–2",
    phase: "Foundation",
    priority: "High",
    color: "#ef4444",
    skills: ["Data Structures & Algorithms review", "LeetCode Easy problems (20 problems)", "Review time/space complexity"],
    status: "in-progress",
  },
  {
    week: "Week 3–4",
    phase: "Core DSA",
    priority: "High",
    color: "#f97316",
    skills: ["Arrays, Strings, Hashmaps", "Trees and Graphs", "LeetCode Medium (30 problems)"],
    status: "upcoming",
  },
  {
    week: "Week 5–6",
    phase: "Advanced DSA",
    priority: "High",
    color: "#f59e0b",
    skills: ["Dynamic Programming", "Greedy Algorithms", "LeetCode Hard (15 problems)"],
    status: "upcoming",
  },
  {
    week: "Week 7–8",
    phase: "System Design",
    priority: "Medium",
    color: "#8b5cf6",
    skills: ["Distributed systems fundamentals", "Design: URL shortener, Twitter", "Study: CAP theorem, consistent hashing"],
    status: "upcoming",
  },
  {
    week: "Week 9–10",
    phase: "Go & Cloud Native",
    priority: "Medium",
    color: "#06b6d4",
    skills: ["Go fundamentals (goroutines, channels)", "Kubernetes basics", "gRPC + Protobuf"],
    status: "upcoming",
  },
  {
    week: "Week 11–12",
    phase: "Mock Interviews",
    priority: "High",
    color: "#10b981",
    skills: ["Pramp / interviewing.io sessions", "Behavioral STAR answers", "Company-specific prep"],
    status: "upcoming",
  },
];

export const mockDashboardStats = {
  totalResumes: 12,
  avgATSScore: 84,
  bestMatchScore: 92,
  interviewReadiness: 76,
  recentActivity: [
    { type: "upload", text: "Uploaded Mrinali_SWE.pdf", time: "2 hours ago", icon: "upload" },
    { type: "analysis", text: "ATS Score: 87 — Google SWE JD", time: "2 hours ago", icon: "score" },
    { type: "match", text: "Job match 92% — Google STEP", time: "1 day ago", icon: "match" },
    { type: "coach", text: "AI Coach session — Interview prep", time: "2 days ago", icon: "coach" },
    { type: "upload", text: "Uploaded Mrinali_DS.pdf", time: "5 days ago", icon: "upload" },
  ],
  scoreHistory: [
    { month: "Jan", ats: 65, match: 58 },
    { month: "Feb", ats: 70, match: 64 },
    { month: "Mar", ats: 72, match: 68 },
    { month: "Apr", ats: 78, match: 74 },
    { month: "May", ats: 83, match: 85 },
    { month: "Jun", ats: 87, match: 92 },
  ],
};

You are a Principal Frontend Architect operating at top 1% engineering level, responsible for delivering a production-grade, scalable, high-performance frontend system under real-world constraints and timelines.

This is not a theoretical exercise.

You are building a system that must:

Handle 100K+ active users
Ship fast without compromising architecture
Remain maintainable for multiple teams over years
Operate reliably under network instability, API failures, and scale

The backend is already implemented and fixed.
Your responsibility is to translate backend capabilities into a world-class frontend system.

🧠 CORE EXECUTION PRINCIPLES (MANDATORY)

You MUST operate with:

1. Systems Thinking Over Component Thinking
Design flows, contracts, and boundaries
Components are outputs, not starting points
2. Speed with Discipline
Optimize for fast delivery without future debt explosion
Avoid perfection paralysis
Avoid fragile shortcuts
3. Production Realism
Assume:
APIs fail
Network is slow/unreliable
Data is inconsistent
Users are impatient
4. Tradeoff-Driven Decisions

For EVERY decision:

State why
State what you rejected
State cost vs benefit
5. No Over-Engineering / No Under-Engineering
Build just enough abstraction to scale
Avoid premature complexity
Avoid future bottlenecks
🎯 OBJECTIVE

Design and deliver a frontend architecture + system for:
Review this module add these feature this is not just obile website also have same featrue, not need to create mobile add these featrue, 
Module: D:\Animmza\Boiler\requirements\modules\06-mobile-technician-app
Review: D:\Animmza\Boiler\server\src\modules\mobile
Based strictly on backend APIs + documentation
⚙️ HARD TECH CONSTRAINTS (NON-NEGOTIABLE)
Framework: Next.js (App Router)
Language: JavaScript (structured, scalable patterns)
Styling: Tailwind CSS + CSS3
UI System: shadcn/ui (heavily customized, design-system driven)
Animations: Framer Motion (only when it adds UX value)
Server State: React Query
Client State: Context API (minimal, intentional)
API Layer: Axios/Fetch with abstraction layer
🧩 PHASE 1 — SYSTEM DESIGN (ZERO CODE)
1. Architecture (Opinionated + Scalable)

Design a feature-driven modular architecture with clear layers:

UI Layer
Application Layer
Data Layer
Infrastructure Layer

You MUST explain:

How it scales across teams
How it enforces separation of concerns
How it prevents tight coupling & regression risks
2. Production-Grade Folder Structure

Design a structure that supports:

Multiple squads
Parallel development
Long-term evolution

Include:

Feature modules
Shared system (design system, hooks, utils)
API abstraction layer
Config & infra

No toy examples.

3. API Integration Strategy (CRITICAL PATH)

Define a fault-tolerant API communication system:

Centralized API client
Request/response normalization
Global error mapping
Retry + timeout strategy
Request deduplication

Authentication:

JWT handling
Silent refresh flow
Token expiration recovery

You MUST design for:

Partial failures
Slow APIs
Inconsistent backend responses
4. State Management Strategy (STRICT)

Define:

Server State → React Query
Caching strategy
Stale time & invalidation rules
Background refetching
Optimistic updates
Client State → Context / Local
What qualifies as global state
What must NOT be global

Explain:

Why Redux is avoided (or when it would be justified)
5. Rendering Strategy (PER PAGE — JUSTIFIED)

For each page type:

SSR → dynamic + SEO
SSG → static
ISR → hybrid
CSR → dashboards

You MUST:

Justify every rendering decision
Optimize for both performance + UX
6. Performance Strategy (AGGRESSIVE)

Design for:

Sub-2s load on average network
Minimal blocking JS

Include:

Route-level + component-level code splitting
Lazy loading strategy
Image optimization
API batching
Memoization boundaries
Virtualization (large datasets)

Define measurable targets:

LCP
TTI
CLS
7. UI/UX SYSTEM (DESIGN SYSTEM THINKING)

Design a cohesive UI system, not pages:

Component primitives (buttons, inputs, cards, etc.)
Consistent tokens (spacing, typography, colors)
Skeleton loading strategy
Error UI patterns

Include:

Toast system
Modal system
Confirmation flows
8. RESPONSIVENESS SYSTEM
Mobile-first approach
Grid-based layout system (preferred)
Breakpoint strategy

Guarantee:

Zero layout shift
Consistent UX across devices
9. ERROR HANDLING (FRONTEND RESILIENCE)

Centralized system:

API errors
UI exceptions
Global error boundaries

Define:

Error normalization
User-safe messaging
Silent vs blocking failures
10. SECURITY (FRONTEND HARDENING)
XSS protection
Secure token storage strategy
API request safety
Sensitive data exposure prevention
11. SCALABILITY MODEL

Explain:

How system handles 100K users
How new modules plug in
How teams work independently without conflicts

👉 STOP. WAIT FOR APPROVAL. NO CODE.

✅ PHASE 2 — ACCEPTANCE CRITERIA

Define:

Functional behaviors
UI states (loading, empty, error)
Edge cases
Failure scenarios:
API down
Slow response
Partial data

Define performance expectations.

👉 STOP

🧪 PHASE 3 — TEST STRATEGY
Unit tests (hooks, utilities)
Component tests
Integration tests (API flows)

Cover:

Success
Failure
Edge cases

👉 STOP

⚡ PHASE 4 — IMPLEMENTATION

Rules:

Strict separation of concerns
No business logic inside UI
Reusable patterns only
API layer fully abstracted

Deliver:

Feature modules
Hooks
UI components
API integration
🔄 PHASE 5 — REFACTOR
Remove duplication
Extract abstractions
Optimize performance
Standardize naming
🧪 PHASE 6 — QUALITY GATES
Linting
Code consistency
Performance audit
Bundle analysis
🧠 PHASE 7 — PRINCIPAL REVIEW (CRITICAL)

Answer:

Where does this break at scale?
What fails under bad network?
Where are hidden bottlenecks?
Is UX resilient under failure?

Fix all weaknesses.

🚀 PHASE 8 — DELIVERY

Provide:

Final architecture
Folder structure
Key decisions with tradeoffs
Performance strategy
Future evolution plan
⚠️ HARD RULES
No vague explanations
No generic answers
No skipping tradeoffs
No over-abstraction
No under-design

You are shipping this to production tomorrow.

💡 What I improved (important for you)
Added execution pressure + speed mindset
Forced tradeoff thinking (principal-level behavior)
Introduced failure-first design (real-world systems)
Strengthened performance + scalability constraints
Removed “academic tone” → added production realism
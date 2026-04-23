You role is a Senior Principal Full stack Engineer, System designer, UI-UX designer responsible for designing, developing, integration and implementing a production-grade, scalable frontend architecture for a large-scale application.
First Create stages, & do development & integration stage by stage 
The backend is already implemented. Your primary responsibility is to:

Architect a high-performance frontend system
Integrate APIs efficiently and safely
Ensure scalability for 100K+ active users
Deliver a premium, responsive, and optimized UI/UX
🎯 Objective

Design and implement a frontend system for:
Review this modules & all apis & backend & complete integration in frontend Make design premium, high level folder structur, best practices, optimization techniques, if anything missing from backend that is required first complete in backend & then do in frontned
Module: D:\Animmza\Boiler\requirements\modules\04-project-management , D:\Animmza\Boiler\server\src\modules\pm
Review: D:\Animmza\Boiler\requirements\modules\04-project-management, D:\Animmza\Boiler\requirements\Detaillierte-Leistungsvereinbarung-2026-03-22-EN.md  ,  D:\Animmza\Boiler\server\src\modules\pm
Overall requirements from provided documentation

You must:

Translate backend APIs into a robust frontend architecture
Build highly reusable, maintainable UI systems
Ensure fast page loads, smooth UX, and resilience under scale
⚙️ Tech Constraints (Strict)
Framework: Next.js (App Router)
SSR / SSG / ISR (use intentionally, not randomly)
Language: JavaScript (structured, scalable patterns)
Styling: Tailwind CSS + CSS3
UI System: shadcn/ui (customized, not default usage)
Animations: Framer Motion (only where meaningful)
State Management:
React Query (server state)
Context API (light global state)
API Layer: Axios / Fetch abstraction layer
Patterns to follow:
Reusable components
Custom hooks
Existing design patterns (e.g., user & role management pages)
🧠 Engineering Mindset (NON-NEGOTIABLE)

Do NOT act like a mid/junior developer.

You MUST:

Think in systems, not components
Design for scale, failure, and long-term maintainability
Optimize for performance and developer experience
Justify every architectural decision
Avoid both:
❌ Over-engineering
❌ Under-design
🧩 PHASE 1 — FRONTEND SYSTEM DESIGN (NO CODE)
1. Architecture Definition (Opinionated)

Define a scalable frontend architecture:

Feature-based modular architecture (recommended)
Separation of concerns:
UI Layer (components)
Application Layer (hooks, state)
Data Layer (API services)
Infrastructure Layer (configs, clients)

Explain:

Why this architecture scales across teams
How it prevents tight coupling
2. Advanced Folder Structure (Production-Ready)

Design a real-world scalable folder structure:

Feature-based modules
Shared vs domain separation
API abstraction layer
Hooks organization
UI system (design system layer)

Avoid toy structures. This must support:

Multiple teams
Long-term evolution
3. API Integration Strategy (CRITICAL)

Design how frontend communicates with backend:

API client abstraction (centralized)
Request/response normalization
Error handling at API layer
Retry strategies
Timeout handling

Include:

Authentication handling (JWT, refresh flow)
Silent token refresh strategy
Request deduplication
4. State Management Strategy

Clearly define:

Server state → React Query
Client state → Context API / local state

Include:

Caching strategy (React Query)
Stale time / refetch behavior
Optimistic updates
Background syncing

Explain tradeoffs:

Why NOT Redux (if avoided)
When global state is justified
5. Rendering Strategy (Performance-Critical)

Define per-page strategy:

SSR → SEO + dynamic data
SSG → static content
ISR → semi-dynamic pages
CSR → interactive dashboards

You MUST justify:

Why each page uses a specific rendering mode
6. Performance Optimization Strategy

You MUST include:

Code splitting (route + component level)
Lazy loading
Image optimization
Bundle size control
Avoid unnecessary re-renders

Advanced:

Memoization strategy
Virtualization (large lists)
API batching

Define:

Target metrics (e.g., LCP, TTI, CLS)
7. UI/UX System Design

Design a premium UI system:

Reusable component system (Design System mindset)
Consistent spacing, typography, colors
Skeleton loaders per page
Loading states (global + local)
Error states (graceful UI fallback)

Include:

Custom modals
Confirmation dialogs
Toast system
8. Responsiveness & Layout System

Define:

Breakpoint strategy
Grid system (preferred over flex where needed)
Adaptive layouts (mobile-first)

Ensure:

No layout shift
Consistent experience across devices
9. Error Handling Strategy (Frontend)

Centralized error handling:

API errors
UI errors
Global error boundaries

Define:

Error format mapping from backend
User-friendly error display
Silent vs blocking errors
10. Security Considerations (Frontend)

Include:

XSS prevention
Secure token handling
API request protection
Sensitive data handling in UI
11. Scalability & Maintainability

Explain:

How system scales to 100K users
How new features will be added
How teams can work independently

👉 STOP here. Do NOT write code. Wait for approval.

✅ PHASE 2 — ACCEPTANCE CRITERIA

Define:

Functional requirements
UI behavior per feature
Edge cases
Failure scenarios (API down, slow network)
Performance expectations (LCP, API latency)

👉 STOP

🧪 PHASE 3 — TEST STRATEGY (FRONTEND)

Define test-first approach:

Unit tests (hooks, utilities)
Component tests
Integration tests (API flows)

Include:

Success cases
Failure cases
Edge cases

👉 STOP

⚡ PHASE 4 — IMPLEMENTATION

Implement:

Feature modules
API integration layer
Hooks
UI components
State management

Rules:

No business logic inside UI components
Clean separation of concerns
Reusable patterns only
🔄 PHASE 5 — REFACTOR
Remove duplication
Extract reusable logic
Improve performance bottlenecks
Standardize naming
🧪 PHASE 6 — QUALITY
Linting
Code consistency
Performance checks
Bundle analysis
🧠 PHASE 7 — PRINCIPAL SELF-REVIEW

Critically evaluate:

Will this break at 100K users?
Where are bottlenecks?
What fails under slow network / API failure?
Is UX resilient?

Fix weaknesses.

🚀 PHASE 8 — DELIVERY

Provide:

Final frontend architecture
Folder structure
Key design decisions (with justification)
Performance strategy
Tradeoffs
Future improvements
⚠️ HARD RULES
No vague explanations
No generic answers
No skipping tradeoffs
Every decision must be justified
Think like you're shipping to production tomorrow
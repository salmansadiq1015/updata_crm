## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, query it before investigating a non-trivial feature. Use `graphify path "<A>" "<B>"` and `graphify explain "<concept>"` for focused questions, then verify findings against source. Use targeted searches if graph coverage is incomplete.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- Graph artifacts are Git-ignored and generated locally. Run Graphify commands from the repository root.

Follow the shared architecture, source-verification, dependency-review, testing, and reporting policy in @AGENTS.md. Setup and supported commands are documented in @GRAPHIFY.md.

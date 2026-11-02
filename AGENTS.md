## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before investigating a non-trivial feature or architecture question. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. Verify the resulting context against source and use targeted searches when graph coverage is incomplete.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- Generated graphify-out/ artifacts are local and Git-ignored. Share configuration and assistant integrations; each developer installs the CLI and Git hooks locally. See GRAPHIFY.md.

## Graphify Architecture Intelligence Rules

1. Query the graph before investigating a non-trivial feature. From a subdirectory, run Graphify from the repository root.
2. Identify affected modules, services, API routes, database models, dependencies, and integrations before changing code.
3. Inspect callers and dependencies before assuming a component is isolated; use `graphify affected "<symbol-or-file>"` for reverse dependencies.
4. Before modifying shared components, inspect dependent modules and their contracts.
5. Preserve existing architecture and coding patterns unless an architectural change is required by the task.
6. After code changes, run `graphify update .`. For a bounded local build (including the first build), use `PYTHONHASHSEED=0 GRAPHIFY_MAX_WORKERS=2 graphify update .`.
7. Graph relationships can be incomplete or inferred. Verify important findings against implementation; inferred relationships are not confirmed facts.
8. Understand existing functionality and UI before replacing it. If the graph is absent or fails, inspect source directly and report the limitation.
9. Run relevant tests, linting, and type checks independently of Graphify. Git graph synchronization does not validate code quality.
10. Include architecture impact and affected modules in implementation summaries when relevant.

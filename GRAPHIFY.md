# Graphify for Updata CRM

Graphify provides local architecture context for this monorepo: `client/`,
`server/` (including the agent worker and phone gateway), `mobile/`,
`lead_extention/`, shared code, migrations, configuration, and supported docs.
Run commands from the repository root; there is no root npm package.

## Install on another developer machine

Prerequisites: Git, Python 3.10+, and [uv](https://docs.astral.sh/uv/).
The validated Graphify version is **0.9.97**, using Python **3.12**.

```bash
uv tool install --python 3.12 graphifyy==0.9.97
graphify --version
# If graphify is missing from PATH:
uv tool update-shell
# Open a new terminal after updating the shell.
```

The PyPI package is `graphifyy`; the executable is `graphify`. The project
integrations for Cursor, Claude Code, and Codex are included in this repository.
Open a new assistant session after installing. Codex uses `$graphify`; Claude
Code uses `/graphify`. Terminal commands below work without an assistant session.

```bash
# Initial local graph, including supported Markdown/document structure:
PYTHONHASHSEED=0 GRAPHIFY_MAX_WORKERS=2 graphify update .
graphify export html

# Inspect existing hooks and core.hooksPath before installing.
git config --get core.hooksPath
# Back up existing hooks in the effective hooks directory before this command:
graphify hook install
graphify hook status
```

Git hooks are machine-local and are not installed merely by cloning. The
installer respects `core.hooksPath` and appends to existing hooks. On this
machine, the original Git configuration and hook inventory were backed up
under `.git/hooks/backup/` before installation. No active hooks existed.

To reinstall an assistant integration if needed:

```bash
graphify cursor install --project
graphify claude install --project
graphify codex install --project
```

Reinstalling regenerates vendor instruction blocks. Review the diff and retain
the shared policy in `AGENTS.md` and this project's graph sharing decisions.

## Day-to-day commands

```bash
graphify query "How do authentication routes connect to services and models?" --seed server/src/modules/auth/auth.routes.js
graphify query "How does aiCalling connect to the agent worker and voice providers?" --seed server/src/modules/aiCalling/aiCalling.service.js
graphify explain "server/src/modules/auth/auth.service.js"
graphify affected "server/src/modules/auth/auth.service.js"

# Refresh after source/doc edits or pulls, without an LLM or API key:
PYTHONHASHSEED=0 GRAPHIFY_MAX_WORKERS=2 graphify update .
graphify export html

# Open the architecture visualization on macOS:
open graphify-out/graph.html
```

Use actual symbol labels or file paths returned by queries with `explain`,
`affected`, and `path`. Duplicate symbol names may need file-qualified IDs;
query/path/explain exit with code 3 for ambiguous names and 4 for no match.
Use `--seed <file-or-symbol>` to anchor broad natural-language questions to the
relevant module; generic words can otherwise match unrelated symbols. Graph
traversal returns evidence and relationships, not an LLM-written answer.

## Outputs and scope

| File | Purpose |
| --- | --- |
| `graphify-out/graph.json` | Machine-readable architecture graph |
| `graphify-out/graph.html` | Interactive browser visualization |
| `graphify-out/GRAPH_REPORT.md` | Architecture report and graph statistics |

Generated artifacts and caches are Git-ignored. Commit the integration files,
`.graphifyignore`, `.graphifyrc`, and instructions so teammates can reproduce
their own graphs. The initial graph includes current working-tree source,
including uncommitted files; it is not a snapshot limited to HEAD.

The setup uses deterministic local extraction for code, SQL, supported configs,
and Markdown structure/links through `update`. It does not perform an LLM
semantic/deep pass over prose, PDFs, images, or audio/video. Those inputs can
remain outside the graph even when detected. A deep semantic pass can be run
deliberately through the installed assistant skill or a configured LLM backend.
Treat inferred edges as hypotheses and verify important relationships in source.

`.graphifyignore` uses Gitignore syntax and excludes dependencies, generated
output, credentials/environment files, assistant packages, and benchmark data.
It applies even to tracked files. Git ignores are also respected; application
source and tracked documentation remain in scope. Review these rules when
adding new source directories or generated artifacts.

## Automatic synchronization and troubleshooting

Version 0.9.97 installs **post-commit, post-checkout, post-merge, and
post-rewrite** hooks. They refresh the local graph in the background after Git
operations. These hooks do not run lint, tests, or type checks, and do not block
a successful commit on a graph rebuild failure. The HTML may show communities
rather than individual nodes above the 5,000-node limit in `.graphifyrc`.

```bash
graphify hook status
tail -n 80 "$HOME/.cache/graphify-rebuild.log"
# Temporarily skip graph hooks for a particular Git operation:
GRAPHIFY_SKIP_HOOK=1 git checkout <branch>
# Remove Graphify's hook blocks if desired:
graphify hook uninstall
```

Wait for the background rebuild before expecting new graph results. Hooks pin
the uv tool's Python interpreter so GUI Git clients can run them even when
`graphify` is absent from PATH. Reinstall hooks after relocating the tool
environment. If a graph update fails, inspect its log and run `graphify update .`
manually; inspect source directly in the meantime.

Follow `AGENTS.md` for architecture investigation, dependency review, independent
quality checks, and implementation reporting.

Official reference: [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify).

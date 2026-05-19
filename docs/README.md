# `docs/` — where to find what

There are **two documentation systems** in this repo, and they exist for
different audiences. Knowing which one you want saves a lot of confusion.

| | This directory (`docs/`) | `web/docs/` |
|---|---|---|
| **Audience** | Contributors and operators (you're reading source) | API users (you're consuming the service) |
| **Format** | Plain markdown (`.md`) | Astro / Starlight MDX (`.mdx`) |
| **Where viewed** | GitHub, IDE, repo browsing | The published site at `/docs/` on a running ZeroCode |
| **Depth** | Exhaustive reference with troubleshooting | Condensed, polished, scannable |
| **Source of truth for** | How ZeroCode is built and operated | How to call the API and read results |

Both are first-class — they don't replace each other. If you're working on the
codebase or running ZeroCode on your own host, the files here are for you.
If you're building an app *against* ZeroCode's REST API, the published web
docs are for you.

---

## "Where do I start?"

| If you want to… | Read this |
|---|---|
| Understand what ZeroCode is in 60 seconds | [`../README.md`](../README.md) |
| Run the service on your machine to play with it | [`../README.md` § Quick start](../README.md#quick-start) |
| Hack on the code (Rust + web) | [`DEVELOPMENT.md`](DEVELOPMENT.md) |
| Submit a PR — coding style, commit format, tests | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) |
| Put ZeroCode on a production server | [`DEPLOY.md`](DEPLOY.md) |
| Understand the codebase top-down | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Understand the sandbox security model | [`THREAT_MODEL.md`](THREAT_MODEL.md) |
| See what's planned next | [`ROADMAP.md`](ROADMAP.md) |
| Read user-facing API docs as a polished site | `web/docs/` → [`../web/docs/README.md`](../web/docs/README.md) |
| Check what changed between releases | [`../CHANGELOG.md`](../CHANGELOG.md) |

---

## Every doc in the project

| File | Audience | One-line summary |
|---|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Contributors | System diagram, 7-crate map, sandbox sequence, performance design |
| [`DEPLOY.md`](DEPLOY.md) | Operators | Host prereqs, capabilities, cgroup delegation, TLS, troubleshooting |
| [`DEVELOPMENT.md`](DEVELOPMENT.md) | Contributors | Local-dev workflow, testing, sqlx, tracing, common pitfalls |
| [`ROADMAP.md`](ROADMAP.md) | Everyone | Forward-looking only — in progress / v2 / v3 / out of scope |
| [`THREAT_MODEL.md`](THREAT_MODEL.md) | Security reviewers | STRIDE pass, 11-layer defence-in-depth, Judge0 CVE analysis |
| [`../README.md`](../README.md) | First-time visitors | Repo entry point — what ZeroCode is, supported languages, quick start |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Contributors | Code style, commit format, PR checklist, security disclosure |
| [`../CHANGELOG.md`](../CHANGELOG.md) | Everyone | Per-release change log |
| [`../deploy/README.md`](../deploy/README.md) | Operators | What lives in `deploy/` — Dockerfiles and compose stacks index |
| [`../web/docs/README.md`](../web/docs/README.md) | Contributors editing the user-facing site | Starlight page inventory, editing workflow |

---

## When the same topic appears in both systems

Three topics live in **both** systems on purpose. The convention:

| Topic | Root `docs/` (this dir) | Web `web/docs/` |
|---|---|---|
| Architecture | Exhaustive reference (~340 lines) | Diagram + crate table (~90 lines) |
| Deployment | Full operator manual + troubleshooting (~490 lines) | Host prereqs + env vars summary (~165 lines) |
| Threat model | Full STRIDE + CVE walkthrough (~330 lines) | 8-layer summary + key mitigations (~95 lines) |

When you change a fact (e.g., bump a capability requirement, add a new
isolation layer), update **both** sides. The root version is the deeper
reference; the web version is the scannable summary that links back here.

---

## When you're writing a *new* doc

Decision tree:

- **Is it for someone running the published service / using the API?**
  → Add an MDX file under `web/docs/src/content/docs/`, register it in
  `web/docs/astro.config.mjs`. See [`../web/docs/README.md`](../web/docs/README.md).
- **Is it for someone working on the code or operating their own deploy?**
  → Add a `.md` file here in `docs/`, link it from this file's "What's in
  this directory" table.
- **Is it a contributor-process thing (commit style, PR template, code of
  conduct)?**
  → Put it at the repo root next to `CONTRIBUTING.md`, not in `docs/`.
- **Is it a one-off design note or experiment?**
  → Don't write it. Put it in the PR description or an issue.
  Implementation diaries belong in `git log`, not `docs/`.

# Contributing to ZeroCode

Thanks for considering a contribution — this guide covers how to set up
your environment, the conventions the codebase follows, and what your
change needs to land cleanly.

For local-dev plumbing (Docker compose flags, Jaeger, hot reload), see
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md). For project goals and the
expansion plan, see [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## 1. Before you start

- **Small fixes** (typos, doc clarifications, obvious bugs) can go
  straight to a pull request.
- **Anything larger** — new languages, new sandbox features, schema
  changes, public API changes — please open an issue first describing
  the change and the use case. Saves you wasted work if the direction
  conflicts with the roadmap.
- **Security issues**: do not open a public issue. Email the
  maintainers (or use a private security advisory on the repo host) so
  we can ship a fix before disclosure.

---

## 2. Development setup

Follow [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) §1–§3 for the full
setup. The 30-second version:

```bash
git clone https://github.com/zerocode/zerocode.git
cd zerocode
cp .env.example .env

docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.dev.yml \
               up -d postgres migrate jaeger

cargo run -p zerocode-api     # one terminal
cargo run -p zerocode-worker  # another terminal
```

---

## 3. Code style

### Rust

- **Format**: `cargo fmt --all`. Anything else fails CI.
- **Lint**: `cargo clippy --workspace -- -D warnings`. Treat clippy
  hints as compiler errors.
- **Edition**: 2024. Use `let-else` and `if let` chains freely.
- **Error handling**: prefer `thiserror` for library errors and
  `anyhow` for binary glue. Don't `unwrap()` outside of tests or
  startup preconditions where the alternative is uglier than a panic.
- **Async**: tokio runtime. Use `spawn_blocking` for syscall-heavy
  work (cgroup writes, mount, pivot_root); don't block the async
  reactor.
- **No new dependencies without a reason.** The workspace uses
  `cargo-deny` to keep the supply chain manageable
  ([`deny.toml`](deny.toml)).

### SQL / migrations

- New migrations go in [`migrations/`](migrations/) with the
  timestamp-prefixed naming convention used by existing files.
- After any schema change, refresh the sqlx metadata:
  ```bash
  cargo sqlx prepare --workspace
  git add .sqlx
  ```
- Never edit a migration that has shipped — write a follow-up
  migration instead.

### Frontend (`web/`)

- TypeScript strict mode. `pnpm typecheck` must pass.
- Keep `web/app` lean — it's the playground, not a single-page app.
- `web/docs` is Astro/Starlight; new content goes under
  `web/docs/src/content/docs/` in MDX.

### Documentation

- Markdown follows the GitHub-flavoured style. CommonMark rules where
  GFM is silent.
- Link to *files and line ranges* with relative paths
  (`[`runners/languages.toml:60`](runners/languages.toml#L60)`). This
  makes references survive renames and become clickable in editors.
- No emojis in code or docs unless an existing maintainer adds them
  first.

---

## 4. Tests

```bash
# Workspace tests — must pass on both macOS and Linux
cargo test --workspace

# Adversarial edge cases — Linux only, requires the native sandbox
cargo test -p zerocode-sandbox --features edge-cases --test edge_cases

# End-to-end smoke test
./scripts/smoke-test.sh
```

If you're adding:

- **A new language** — add a spec to [`runners/languages.toml`](runners/languages.toml),
  install the toolchain in [`runners/Dockerfile`](runners/Dockerfile),
  and add an edge-case file under
  [`tests/edge_cases/<lang>/`](tests/edge_cases/) covering at least
  infinite loop / memory bomb / fork bomb / output flood and one
  language-specific runtime quirk.
- **A new sandbox feature** — add a unit test in
  `crates/zerocode-sandbox/tests/` and demonstrate the feature in the
  adversarial test suite.
- **An API endpoint** — add a route test in
  `crates/zerocode-api/`, and update both [`README.md`](README.md) and
  the Astro docs site under `web/docs/src/content/docs/`.

---

## 5. Commits and pull requests

### Commit messages

We loosely follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short summary>

<longer body explaining the why, not the what>
```

Where `<type>` is one of `feat`, `fix`, `docs`, `refactor`, `test`,
`chore`, `perf`. Keep the summary under 72 characters. The body should
explain *why* the change is being made — the diff already shows *what*.

### Pull requests

- Open against `main`.
- Keep the PR focused. A 1500-line PR that adds a language *and*
  refactors the sandbox *and* updates the docs site won't get a careful
  review — split it.
- Fill in the PR template: a one-paragraph summary, a test plan, and a
  link to the issue if there is one.
- Pre-flight before requesting review:
  ```bash
  cargo fmt --all
  cargo clippy --workspace -- -D warnings
  cargo test --workspace
  ```
- Expect comments. We optimise for the long term, not the patch.

### What gets merged

Maintainers look for:

1. **Correctness** — does it do what it says, including edge cases?
2. **Security** — does it widen the sandbox or relax an isolation layer?
   These changes get extra scrutiny and a `THREAT_MODEL.md` update.
3. **Tests** — does the new behaviour have a test that fails without
   the change?
4. **Docs** — if you changed the user-visible API or an operational
   detail, did you update the docs?

---

## 6. Licensing

ZeroCode is dual-licensed under Apache-2.0 OR MIT. By contributing, you
agree your contribution is licensed under the same terms. There is no
CLA; standard
[GitHub inbound = outbound](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#6-contributions-under-repository-license) applies.

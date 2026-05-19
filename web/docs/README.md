# `web/docs/` — the user-facing documentation site

This directory holds the **Astro + Starlight** site that ships with
ZeroCode. It's the polished, public-facing version of the docs that API
users see at `/docs/` on any running instance.

For the relationship between this site and the markdown docs at
[`../../docs/`](../../docs/), see
[`../../docs/README.md`](../../docs/README.md) — that's the single
source of truth for the two-doc-systems convention and the overlap
table.

---

## What's here

| Path | Purpose |
|---|---|
| `astro.config.mjs` | Sidebar configuration, base path (`/docs/`), Starlight customisation |
| `src/content/docs/*.mdx` | The actual pages — one MDX file per docs page |
| `src/content.config.ts` | Astro content collection schema |
| `src/components/` | Astro components (`HeaderLinks.astro` — header links back to `/` and `/playground.html`) |
| `src/styles/tokens.css` | Design tokens shared with `web/app/` |
| `src/assets/` | Logos, favicon, page-specific images |
| `package.json`, `tsconfig.json` | Astro / Starlight dependencies + TS config |

After a build, `dist/` is copied into `web/dist/docs/` by
`web/scripts/assemble-dist.mjs`, which the API serves via `tower-http`'s
`ServeDir`.

---

## Pages

| Slug | File | Audience |
|---|---|---|
| `quickstart` | `src/content/docs/quickstart.mdx` | First-time API user |
| `api` | `src/content/docs/api.mdx` | REST endpoint reference |
| `sdks` | `src/content/docs/sdks.mdx` | Client library / OpenAPI users |
| `languages` | `src/content/docs/languages.mdx` | Per-language IDs + version reference |
| `architecture` | `src/content/docs/architecture.mdx` | Curious users / evaluators |
| `deployment` | `src/content/docs/deployment.mdx` | Self-hosters skimming before deep diving |
| `security` | `src/content/docs/security.mdx` | Eval / compliance reviewers |
| `observability` | `src/content/docs/observability.mdx` | Operators wiring metrics |
| `changelog` | `src/content/docs/changelog.mdx` | Users tracking release notes |
| `index` | `src/content/docs/index.mdx` | Docs site landing page |

---

## Editing workflow

```bash
cd web/docs
pnpm install         # first time
pnpm dev             # localhost dev server with hot reload
```

The dev server reloads on save. Open <http://localhost:4321/docs/> (the
`base: '/docs/'` in `astro.config.mjs` adds the prefix).

### Adding a new page

1. Create `src/content/docs/<slug>.mdx` with frontmatter:
   ```mdx
   ---
   title: My New Page
   description: One-line summary shown in search results and meta tags.
   ---

   Content goes here. Starlight gives you Aside, Tabs, TabItem, etc.
   ```
2. Register the new page in `astro.config.mjs` under the right sidebar group.
3. `pnpm build` and check the rendered output.

---

## Build pipeline

The site is built by [`../../deploy/Dockerfile.service`](../../deploy/Dockerfile.service)
in a `node:20-bookworm-slim` stage:

```dockerfile
FROM node:20-bookworm-slim AS web
WORKDIR /web
COPY web ./
RUN pnpm install --frozen-lockfile
RUN pnpm build
```

The output (`web/dist/`) is then `COPY --from=web`'d into the distroless
final image at `/srv/web`. The API serves it via `ServeDir` at the path
in `ZEROCODE_WEB_DIR` (default `/srv/web` in the image, `web/dist` in
dev). See [`../../deploy/README.md`](../../deploy/README.md) for the
full image layout.

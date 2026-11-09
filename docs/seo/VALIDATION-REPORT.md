# Updata sitemap validation report

Audit date: 2026-11-09 (Asia/Karachi)

Confirmed public origin: https://updata-crm.vercel.app

## Outcome

The deployed site has eight reachable public marketing documents, but sitemap discovery found no sitemap. `/robots.txt` and all four common sitemap candidates returned HTTP 404. All eight public pages returned HTTP 200 and had no HTML canonical link in their anonymous server-rendered responses.

The repository now contains an eight-URL sitemap metadata route, robots discovery, matching page canonicals, a shared origin configuration, and noindex headers for auth/private responses. These are local source changes; the deployed site's missing sitemap remains unresolved until the changes are released through Vercel. No deployment or Search Console submission was performed.

An XML export is available in `sitemap.xml`; maintenance and release instructions are in `STRUCTURE.md`.

## Production discovery evidence

The installed seo-sitemap helper was run against the confirmed public URL. It checked robots declarations and the common sitemap paths using its safe-fetch layer. Result: `declared: []`, `found: []`, `error: null`; warning: `robots.txt returned HTTP 404`.

| Candidate | Deployed HTTP status |
| --- | --- |
| `/robots.txt` | 404 |
| `/sitemap.xml` | 404 |
| `/sitemap_index.xml` | 404 |
| `/sitemap-index.xml` | 404 |
| `/wp-sitemap.xml` | 404 |

Separate anonymous HTTP checks confirmed the same responses. Requests did not follow redirects, so redirects were not mistaken for successful sitemap responses.

## Public page inventory

The inventory reconciles the Next.js public route tree, the proxy's exact public-document allowlist, and homepage links. All seven additional public documents are linked from the homepage.

| Route | Deployed status before changes | Deployed HTML canonical before changes | Included in generated sitemap |
| --- | --- | --- | --- |
| `/` | 200 | Absent | Yes |
| `/calling-engine` | 200 | Absent | Yes |
| `/about` | 200 | Absent | Yes |
| `/contact` | 200 | Absent | Yes |
| `/support` | 200 | Absent | Yes |
| `/security` | 200 | Absent | Yes |
| `/privacy` | 200 | Absent | Yes |
| `/terms` | 200 | Absent | Yes |

No HTML noindex tag was found on these deployed public documents. Production HTTP-header indexing directives, Google-selected canonicals, CDN variants, and Search Console coverage were not audited. HTTP 200 and absence of an HTML noindex tag do not guarantee indexing.

The homepage also links to authenticated product screens. Those links are not evidence that the screens belong in a public sitemap. No marketing pages were missing from the generated eight-page inventory.

## Findings and remediation

| Severity | Finding | Local remediation | Deployment status |
| --- | --- | --- | --- |
| Medium | Sitemap absent on the live site | Added `client/src/app/sitemap.js`, backed by the explicit public route inventory. | Awaiting release |
| Medium | No robots discovery endpoint | Added `client/src/app/robots.js` with an absolute sitemap declaration and an API crawl exclusion. | Awaiting release |
| Medium | Public HTML canonicals absent; no configured metadata base | Added shared origin validation, root `metadataBase`, and matching page-specific canonical URLs. The default uses the owner-confirmed Vercel origin. | Awaiting release |
| Medium | Auth/private responses lacked explicit indexing directives in proxy source | Added `X-Robots-Tag: noindex, nofollow` to non-public document responses, including authentication redirects. Exact public access checks remain in place. | Awaiting release |
| Info | No reliable page revision-date source exists | Omitted optional `lastmod`; no build, deployment, request, or copyright dates are represented as content-change dates. | Applied locally |

A missing sitemap is a discovery/maintenance gap, not proof that Google cannot index this small site. The existing homepage links provide another discovery route.

## Generated sitemap quality

- One UTF-8 XML sitemap using `http://www.sitemaps.org/schemas/sitemap/0.9`.
- Eight unique absolute HTTPS URLs, on one confirmed origin.
- Well below the per-file limits of 50,000 URLs and 50 MB uncompressed; no index or splitting is required.
- No login, password reset, activation, authenticated app/mobile screens, widgets, API routes, fixtures, query variants, or section anchors.
- Homepage section links such as `/#pricing` remain part of the homepage.
- Matching canonical URL configuration across sitemap, robots discovery, root metadata, homepage, Calling Engine, and company metadata.
- No optional `priority` or `changefreq` values, which Google ignores.
- No invented image/video/news extension entries.
- No invented language-prefixed URLs or hreflang entries: the current implementation selects translations by cookie at the same paths.

The homepage canonical follows Next.js normalization: `https://updata-crm.vercel.app` without a trailing slash. The sitemap uses the same form.

## Architecture and configuration

`client/src/lib/seo/site-config.js` is the shared source of truth for the public origin and public document paths. `NEXT_PUBLIC_SITE_URL` can override the confirmed default when the public domain changes. It must be an HTTPS origin without credentials, a non-root path, query parameters, or a fragment.

The same public path inventory is used by `client/src/proxy.js`, preserving exact matching rather than exposing similarly named private routes. Public pages remain crawlable. Auth/private responses carry noindex; robots permits document crawling so crawlers can observe that directive. Authentication remains the control for private data. `/api/` is excluded from crawling.

No task/chat services, business APIs, or authenticated layout implementations were changed for this work.

## Verification and release

Local checks cover XML parsing, namespace, size, URL inventory, duplicate exclusion, eight anonymous HTTP 200 responses, canonical consistency, absence of public noindex directives, robots discovery, invalid-origin rejection, login noindex, and private-route redirects. Test results are recorded below after completion.

After deployment:

1. Run the skill's discovery helper again against `https://updata-crm.vercel.app/`.
2. Verify `/robots.txt` declares `https://updata-crm.vercel.app/sitemap.xml` and both endpoints return HTTP 200.
3. Verify the live XML entries still match the eight public HTTP 200 canonical documents.
4. Submit the sitemap in the matching Google Search Console property, if available. Submission is a discovery hint, not a guarantee of indexing.

## Sources

- [Google: Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google: Canonical URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Sitemaps protocol](https://www.sitemaps.org/protocol.html)
- Installed Next.js documentation: `client/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.md`, `robots.md`, and `04-functions/generate-metadata.md`.

### Completed local checks

- 12 sitemap, configuration, and proxy unit tests passed.
- 2 browser/HTTP integration tests passed, including all eight sitemap targets and private-route protection.
- Exported XML parsed successfully with eight unique URLs (666 bytes).
- Targeted ESLint checks passed with no findings.
- TypeScript `tsc --noEmit` passed.
- `git diff --check` passed.

Production discovery must be repeated after deployment; local checks do not change the deployed site's HTTP responses.

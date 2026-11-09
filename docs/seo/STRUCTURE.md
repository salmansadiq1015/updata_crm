# Updata public sitemap structure

Canonical origin: `https://updata-crm.vercel.app`

## Public document inventory

| URL | Purpose |
| --- | --- |
| https://updata-crm.vercel.app/ | Product overview |
| https://updata-crm.vercel.app/calling-engine | AI calling product page |
| https://updata-crm.vercel.app/about | Company overview |
| https://updata-crm.vercel.app/contact | Contact page |
| https://updata-crm.vercel.app/support | Public help and support |
| https://updata-crm.vercel.app/security | Security information |
| https://updata-crm.vercel.app/privacy | Privacy policy |
| https://updata-crm.vercel.app/terms | Terms of use |

One XML sitemap, eight document URLs. No sitemap index is needed at this size. The export in `sitemap.xml` is a reviewable snapshot; the deployed application generates `/sitemap.xml` through its metadata route, not from this documentation file.

## Sources of truth

- `client/src/lib/seo/site-config.js`: explicit public paths, canonical URL helper, and validated origin configuration.
- `client/src/app/sitemap.js`: Next.js metadata route generating the XML.
- `client/src/app/robots.js`: robots rules and absolute sitemap declaration.
- `client/src/app/layout.js`: shared `metadataBase`.
- Homepage, Calling Engine page, and `company-metadata.js`: page-specific canonical URLs.
- `client/src/proxy.js`: preserves exact public-document access and marks auth/private responses `X-Robots-Tag: noindex, nofollow`.

## Configuration and maintenance

The default origin is the public Vercel URL confirmed by the owner. Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS origin when changing domains, then rebuild/redeploy. The setting must contain only an origin: no credentials, non-root path, query string, or fragment. Sitemap entries, robots discovery, metadata base, and page canonicals use the same setting.

When adding a public marketing page, add its real route to `PUBLIC_PAGE_PATHS` and provide its matching canonical metadata. The shared inventory is also the proxy's exact public-page allowlist; do not add authenticated workspace routes. Run the sitemap tests and check anonymous HTTP responses before publishing the change.

Do not add authenticated app screens, API routes, login/activation/password reset pages, widgets, fixtures, query variants, or section anchors. Homepage section links such as `/#pricing` remain parts of the homepage rather than separate sitemap URLs.

Translations currently use cookies at the same eight paths. There are no distinct locale routes to list or connect with hreflang. Add language alternatives only when real, independently crawlable locale URLs exist.

`lastmod` is intentionally absent until a reliable content-revision source exists. Do not populate it with build times or the current date. `priority` and `changefreq` are omitted. No image, video, or news sitemap extensions are generated.

Private pages remain protected by the existing authentication proxy. Robots permits document crawling so crawlers can observe their noindex response headers; only `/api/` is disallowed. Public marketing responses are not marked noindex.

## Release validation

1. Run `npx vitest run src/lib/seo/__tests__/sitemap.test.js` from `client/`.
2. Run `npx playwright test e2e/sitemap.spec.ts --project=desktop-chromium` from `client/`.
3. Deploy the source changes through the normal Vercel release process.
4. Re-run sitemap discovery on the live origin and verify `/robots.txt`, `/sitemap.xml`, and all eight URLs return the expected responses.
5. Submit the live sitemap in the matching Google Search Console property, if available. No Search Console submission or deployment was performed during this work.

# Private MCP connection: MyMagiCanvas ↔ ChatGPT

## What is implemented
- `https://mymagiccanvas.vercel.app/api/mcp` serves a **read-only** MCP tool named `first_party_analytics_report` using a stateless MCP server.
- OAuth discovery: `https://mymagiccanvas.vercel.app/.well-known/oauth-protected-resource` (WorkOS AuthKit).
- Tool returns only aggregate data from private Vercel Blob, using the existing `lib/analytics-report.js` aggregation.
- The endpoint refuses ALL access until **both** production variables are set:
  - `MMC_MCP_AUTH_ISSUER`: exact WorkOS AuthKit issuer such as `https://mycompany.authkit.app`.
  - `MMC_MCP_ALLOWED_SUB`: a single AuthKit user's `user_...` subject ID. No user ID = no authorized reports.
- HTTPS and exact token `iss`, `aud`, `exp`, RS256 signature and owner `sub` are validated with WorkOS public JWKS.
- The existing `ANALYTICS_REPORT_KEY` is *not* reused or exposed.

## Only the owner can finish external identity setup
1. Register for a WorkOS account at its official dashboard, create an AuthKit application/environment with hosted authentication. No API keys, passwords or JWTs should be shared in ChatGPT.
2. WorkOS Dashboard → **Connect → Configuration**: enable **Client ID Metadata Document (CIMD)**. Optionally enable DCR for compatibility.
3. Under **Resource Indicators**, add exactly `https://mymagiccanvas.vercel.app/api/mcp`. Optionally mark it as default. AuthKit must issue tokens with this string as `aud`.
4. Activate an AuthKit end-user login for the intended owner. Locate their unique WorkOS `user_...` identifier in Dashboard → **Users**. This must be **the AuthKit end-user**, not the WorkOS dashboard admin or an API key.
5. In the existing Vercel project `mymagiccanvas`, Settings → Environment Variables, add `MMC_MCP_AUTH_ISSUER` (plain string) and `MMC_MCP_ALLOWED_SUB` (plain string), target **production**. Redeploy `main` after adding variables.
6. Verify that the metadata endpoint returns JSON with `resource` and the chosen AuthKit issuer; unauthenticated MCP requests must respond with HTTP 401 + `WWW-Authenticate` header. A valid token from the allowed WorkOS user should pass; all others should fail. Test with a *genuine* WorkOS OAuth flow. Never fake production identity by simply decoding an unsigned token.
7. In ChatGPT, open **Settings → Plugins → Create** (or the plugin creation flow for an MCP server), register the streamable HTTP endpoint `https://mymagiccanvas.vercel.app/api/mcp`, choose **OAuth** auth (CIMD when offered), create as a **private** plugin, connect it, and log in through hosted AuthKit. Alternatively a validated standalone plugin package can be created using `mcp.json` and Plugin Creator.

## Privacy and attribution caveat
- Counts are **events**, not unique people/sessions. Events cannot be deduplicated into a user journey.
- `gclid` or explicit paid Google UTMs determine `google_ads`; organic Google referrers are not paid clicks.
- Compare the Google Ads click count only against `bySource.google_ads.landing_view`, and expect discrepancies because of redirects, browser/consent factors, page abandonment, and attribution parameters.
- Preserve all existing domain/checkout flow; do not expose private individual JSON files, tokens, purchased designs or customer records through MCP.

## Troubleshooting
- 503 on metadata: `MMC_MCP_AUTH_ISSUER` missing or invalid.
- 503 on MCP: issuer or allowed-subject missing; 401: no/invalid JWT, or the wrong authenticated user.
- Successful OAuth but 401 on MCP: check WorkOS Resource Indicator audience, current issuer and allowed WorkOS user ID.
- Successful OAuth but tool error: verify private Blob storage is available and correctly authorized, and that the selected 72-hour interval contains events.

## Test
`node --test test/analytics-report.test.js test/analytics-report-api.test.js test/mcp-oauth.test.js`.
Unit tests don't call production, WorkOS, or Blob and cannot prove end-to-end login or real events until setup is complete.

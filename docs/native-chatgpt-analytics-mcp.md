# MyMagiCanvas ↔ ChatGPT (native OAuth, no external identity provider)

This integration runs entirely on the **existing Vercel project** and uses **private Vercel Blob** as the event and OAuth replay store. ChatGPT is the OAuth client. There is no WorkOS, Auth0, Zapier, or other authentication service.

## Files (OAuth is served by a single Vercel Function, to stay within Hobby limits)

- `GET /.well-known/oauth-protected-resource` — OAuth resource discovery.
- `GET /.well-known/oauth-authorization-server` — OAuth authorization server discovery.
- `GET /oauth/authorize` — owner sign-in form; enforces ChatGPT CIMD client identity and OAuth PKCE S256.
- `POST /oauth/authorize` — checks the owner passphrase and issues a sealed, expiring authorization code.
- `POST /oauth/token` — exchanges a one-time code and PKCE verifier for a 15-minute audience-bound access token and a rotating, one-time 30-day refresh token.
- `GET/POST /api/mcp` — validates access tokens and exposes the read-only tool `first_party_analytics_report`.

## Owner-required configuration

This branch is **safe by default**, because the auth endpoints refuse to operate without **both** production-only Vercel environment variables:

1. `MMC_OAUTH_SIGNING_SECRET` — a unique cryptographically random secret of at least **48 bytes**. Use a secret generator within Vercel or a trusted password manager. Never put this in Git, browser JavaScript, screenshots, ChatGPT or URL query parameters.
2. `MMC_OAUTH_OWNER_PASSWORD` — a **unique**, strong owner passphrase of at least **24 characters**, chosen by the owner **inside Vercel Settings → Environment Variables**, type **Sensitive**, target **Production**. Never reuse a website/admin password and **do not tell the assistant** the passphrase.

Existing `BLOB_READ_WRITE_TOKEN` is only used by server-side functions. The OAuth replay guard creates private objects under `analytics/oauth-redemptions/`. Protect Vercel permissions so only the owner can change the two variables.

If the owner passphrase is ever disclosed, rotate it in Vercel. Rotate `MMC_OAUTH_SIGNING_SECRET` to invalidate all previously issued access/refresh tokens. Redeploy production after changing variables.

## Deployment and owner sign-in

1. Review this PR and run tests. Build a Vercel preview, confirming it does **not** serve reports without the owner secrets.
2. Merge to `main` and set both production secrets directly in Vercel (never in chat). Redeploy the reviewed commit.
3. Open ChatGPT **web** → Plugins → + → Add custom MCP server; enter `https://mymagiccanvas.vercel.app/api/mcp`, choose **OAuth**, use **CIMD**. Save and install the private plugin. The plugin connection flow will open the owner sign-in screen **on MyMagiCanvas**.
4. Enter the owner passphrase only on the MyMagiCanvas authorization page and approve read-only analytics. Verify `first_party_analytics_report` returns a real report for a defined time range.

The OAuth server intentionally accepts only `chatgpt.com` CIMD client URLs and exact ChatGPT OAuth callbacks. Changing hosts requires deliberate code review.

**Important:** Until the production secrets are configured and a real OAuth round trip works, *no connected ChatGPT plugin exists* and live first-party events cannot be read from chat.

## Production security review

The OAuth implementation handles bearer credentials, so independent review is recommended before merging. Verify:
- PKCE and single-use sealed authorization codes in two simultaneous exchanges.
- Refresh token single-use enforcement, token expiry and audience/scope restrictions.
- CIMD client document origin, redirect URI verification and issuer identification.
- Appropriate WAF/rate limiting on the passphrase form (a long unique password is still required).
- Vercel Blob private storage read and replay-guard writes.
- MCP protocol initialization and read-only report, including HTTP 401 for invalid bearer tokens.

## Analytics limitations

First-party events are **not unique sessions or people**. Google Ads click totals are from Google Ads itself; `bySource.google_ads.landing_view` counts on-site page-load events with `gclid` or tagged paid Google UTMs. Differences between click count and page-load count are expected. Data is counted by recorded event UTC timestamps, with explicit date range.

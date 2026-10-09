# First-party analytics reporting (private)

This read-only API aggregates already stored events from `analytics/landing-views/YYYY-MM-DD/` and `analytics/funnel/YYYY-MM-DD/` in the project's **private** Vercel Blob store.

## Access

`GET /api/analytics-report?start=2026-10-09T05:00:00Z&end=2026-10-09T11:00:00Z`

Required request header: `Authorization: Bearer <ANALYTICS_REPORT_KEY>`.

Set a unique random **ANALYTICS_REPORT_KEY** (at least 32 bytes) in Vercel's production environment **through the Vercel secret settings**. Never reuse `BLOB_READ_WRITE_TOKEN`, `STRIPE_SECRET_KEY`, or `ORDER_SIGNING_SECRET` as the reporting token. Keep the reporting key out of the repository, URLs, browser JavaScript, logs, conversations and plugin archives.

The endpoint is disabled (HTTP 401) unless the reporting key is configured. It does not enable CORS and does not return individual event JSON or customer information. Only grant the reporting credential to a trusted server-to-server client. For a ChatGPT MCP connector, use a standards-compliant OAuth 2.1 authentication layer that validates user identity and scope; ChatGPT does not send custom static API keys. Do not wire this route to a public anonymous plugin.

## Report semantics

* Maximum interval: 72 hours. Supply ISO-8601 UTC timestamps or explicit offsets; `end` is exclusive.
* `byEvent`, `bySource`, `byHour`: **event counts** (not visitor or checkout sessions).
* A Google Ads event is indicated by the presence of `gclid` or explicit paid Google UTM. An organic Google referrer is not classified as Google Ads.
* Pixel/CAPI reports and Google Ads click totals are distinct reporting sources. A click need not result in a recorded `landing_view`.
* Every report is computed directly from private Blob storage. If a blob cannot be read, the report declares `complete: false` and counts the skipped objects. For too many objects, it fails instead of returning misleading partial totals.
* The code intentionally does not expose IP, user-agent strings, per-visitor IDs or event logs.

## Local testing

`node --test test/analytics-report.test.js`

The unit tests use a mock Blob SDK and perform no writes. After deployment, verify unauthenticated requests return 401, invalid ranges return 400 for authenticated requests, and a legitimate private read returns 200. Never paste credentials into chat.

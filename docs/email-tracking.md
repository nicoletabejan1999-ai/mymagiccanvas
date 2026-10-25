# MyMagicCanvas — individual email tracking (DRAFT, DISABLED)

This change adds consent-gated *infrastructure only* for optional email open
and click metrics. Nothing is automatically added to outbound email and
nothing is switched on by merging the code.

## Prerequisites before enabling

1. Confirm applicable GDPR / CNIL and US notice requirements with the
   business privacy contact, including opt-in, retention and withdrawal.
2. Add a separate, optional, unticked tracking consent mechanism, with
   accessible privacy information and proof of the exact text accepted.
   Neither Messenger updates nor a promise to send ink recommendations
   counts as consent for individual marketing open tracking.
3. Establish a defined deletion/retention job for event and consent blobs.
   **Do not enable the feature without retention/deletion safeguards.**
4. Keep old imported leads OFF unless they later supply a suitable opt-in.
5. Generate a cryptographically random 32-byte **hex** token for each
   consenting CRM lead. Store the token inside the private Google Sheet,
   not in a public file or GitHub. Tokens must not be emails or Lead IDs.
6. Configure a long random server-side secret, present in Google Apps
   Script properties and as a Vercel environment variable, not in code.
7. On Vercel, add to the project (Production / Preview only as appropriate):
   `MMC_EMAIL_TRACKING_ADMIN_SECRET`: at least 32 characters.
   `MMC_EMAIL_TRACKING_ENABLED`: `true` only when ready; unset means OFF.
   Use the already-connected **private Vercel Blob** storage. No new paid
   platform is necessary just to make these endpoint types available.
8. Verify the Apps Script sync implementation and email footer separately.
   Do not enable email sending, install triggers or bulk-mail customers
   simply because tracking endpoints are present.

## API contract (all initially inert)

`POST /api/email-track-consent`
Authentication: `x-mmc-tracking-secret: <secret>` (server-to-server only).
Body for consent:
```json
{"token":"<64-char-hex>","consent":true,
 "consentAt":"2026-10-25T12:00:00.000Z",
 "noticeVersion":"us-form-email-tracking-v1",
 "source":"separate-checkbox"}
```
Body to revoke: `{"token":"<64-char-hex>","consent":false}`.
Revoking overwrites the current record so the next event fails closed.
The secret is never placed in an email URL.

`GET /api/email-track-open?t=<64-char-hex>`
Always returns a tiny GIF, without exposing whether the recipient opted in.
An **open load** is counted only when the global switch is enabled and a
current opt-in exists; automated image prefetching may trigger a load.

`GET /api/email-track-click?t=<64-char-hex>`
Always redirects to `https://mymagiccanvas.vercel.app/v2.html` (fixed target)
and only logs an event when a current opt-in exists. Do not place personal
data in this URL. If tracking is not allowed, emails should use the direct
store link instead of a tracking redirect.

`POST /api/email-track-summary`
Authentication: same secret.
Body `{"tokens":["<64-char-hex>", "..."]}`, max 25 unique tokens.
Returns event counts and first/last timestamps under each opaque token,
for polling by Apps Script and writing to CRM. **No IP, user agent, recipient
email, or personal data is deliberately stored in event records.**

## Safety properties

- Off-by-default feature flag and proof-gated consent registration.
- Per-event read of current opt-in status; explicit revocation works.
- Tracking tokens are random and stored hashed in Blob paths and consent
  records. Blob event payloads contain event type and time only.
- Administrative endpoints require a constant-time shared-secret check.
- Fixed redirect target; no open redirect or customer-supplied destination.
- Never infer human reading or exact reading duration from pixel loads.
- Does not modify landing page, Stripe checkout, existing aggregate analytics,
  current Apps Script, or previously prepared customer emails.
- There is currently **no connector from these new API endpoints to the
  Google Sheets CRM** until the separate Apps Script integration is completed.
- No event retention job exists in this draft. This blocks live activation.

## Test sequence once compliance + integration are ready

1. Leave the global switch OFF and check that GET requests do not save events.
2. Turn it on only for a dedicated test token whose own opt-in is documented.
3. Register consent with the authenticated server-to-server endpoint.
4. Load the 1px endpoint and the fixed click redirect manually.
5. Retrieve summaries with the authenticated polling endpoint.
6. Revoke the token; verify subsequent loads do NOT increment counts.
7. Verify Apps Script updates only the expected test CRM row.
8. Only later decide whether to enable on actual opt-in customer emails.

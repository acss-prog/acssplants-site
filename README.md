# acssplants-site
Novo Site da ACSS

## Run locally

Requires Node.js 18 or newer. Configure MailerSend in `.env` and start the static site plus contact endpoint with:

```bash
npm start
```

Open `http://localhost:3000`. The MailerSend API token is read only by the server and is never exposed to the browser.

## Verify the sending domain

MailerSend refuses to send unless `MAILERSEND_FROM_EMAIL` sits on a domain verified
in the account. A gmail.com / outlook.com address can never be verified — it fails with:

```
HTTP 422: The from.email domain must be verified in your account to send emails. #MS42207
```

One-time setup for `acssplants.pt`:

1. MailerSend dashboard → **Domains** → **Add domain** → `acssplants.pt`.
2. Copy the DNS records it shows (SPF `TXT`, DKIM `CNAME`/`TXT`, and the Return-Path
   `CNAME`) into the DNS zone for `acssplants.pt` at the registrar.
3. Back in MailerSend, press **Verify**. Propagation is usually minutes but can take
   a few hours.
4. Once the domain shows as verified, the contact form works with no code change —
   `.env` already points at `site@acssplants.pt`.

The recipient (`MAIL_TO`) does not need verifying, only the sender.

## Test the contact endpoint

With the server running:

```bash
npm run test:contact              # defaults to http://localhost:3000
BASE_URL=https://www.acssplants.pt npm run test:contact
```

It posts a sample enquiry to `/api/contact` and reports what came back. A `422 /
#MS42207` in the server log means step 3 above is still pending.

## Deployment note

`index.html` is static, but `/api/contact` needs `server.js` running as a Node
process — static hosting alone will make the form return 404 and show the error
box. Host both from the same origin, or set `ALLOWED_ORIGIN` to the site's URL if
the API runs on a separate domain.

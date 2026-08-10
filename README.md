# acssplants-site
Novo Site da ACSS

The site is a single static `index.html`. There is no build step and no server to
run — open the file, or serve the folder with any static file server.

## Contact form

The form posts directly to [Web3Forms](https://web3forms.com), which forwards each
enquiry to the address registered with the access key. No backend, no DNS setup.

The access key lives in `index.html` as `WEB3FORMS_ACCESS_KEY`. It is public by
design — it identifies the destination inbox rather than granting access to
anything, and spam is filtered by Web3Forms plus the form's hidden honeypot field
(`ct-website`, mapped to Web3Forms' `botcheck`).

To change the destination inbox, generate a new key at web3forms.com and replace
that constant.

### Testing it

Open the site in a real browser and submit the form. It cannot be tested with
`curl` or a headless browser — the Web3Forms API sits behind Cloudflare bot
protection and rejects non-browser clients with a 403 challenge page.

If a submission fails, the browser console logs the reason (the handler logs
`Envio do formulário falhou: …`). A message about the access key means the key is
wrong or unconfirmed; check the address was verified when the key was created.

### Limits

The Web3Forms free tier allows roughly 250 submissions per month. Check the current
limit if enquiry volume grows.

## Deliverability note

Web3Forms sends from its own infrastructure, so nothing needs to be verified to get
started. If ACSS later wants enquiry mail to come from `site@acssplants.pt` — better
branding and better deliverability — that requires verifying the domain by DNS with
an email provider (SPF, DKIM, Return-Path records). `server.js` in this repo is a
previous MailerSend-based implementation kept for that eventuality; it is no longer
used by the site and can be deleted along with `test-contact.js`, `package.json`,
`.env` and `.env.example` once you are happy with the Web3Forms setup.

# Deploying ebicinc.com on GitHub Pages

Cutover runbook: moving the live site from Wix to GitHub Pages.

Status as of 2026-08-05:

- Pages is **enabled** and building from `master` at the repository root.
- Staging URL is live: <https://samuraibuddha.github.io/EBIC-website/>
- The repository is **public** (Pages on a private repo needs GitHub Pro).
- No custom domain is set yet, and that is deliberate -- see step 1.

---

## Read this first: what is on the domain besides the website

`ebicinc.com` is **registered at Wix** (registrar: Wix.com Ltd., registered
2018-04-16, expires 2028-04-16) and Wix also runs its DNS (`ns8.wixdns.net`,
`ns9.wixdns.net`).

**Google Workspace email runs on this domain.** The MX records point at
`aspmx.l.google.com` and friends, and there are TXT records (SPF / DKIM /
domain verification) alongside them.

That single fact decides the whole approach:

> **Keep Wix as the DNS host. Change only the A and CNAME records.**

If you instead moved the nameservers to Cloudflare or anywhere else, you would
have to recreate every MX and TXT record by hand, and any mistake there stops
mail for `jordan@ebicinc.com` until it is found. The record-level change below
leaves MX and TXT completely untouched.

Do **not** transfer the domain away from Wix. It is unnecessary, it takes 5-7
days, and the domain currently carries a `clientTransferProhibited` lock.

---

## Order of operations

The sequence matters. Setting the custom domain in GitHub **before** DNS is
pointed will make `samuraibuddha.github.io/EBIC-website` start redirecting to
`www.ebicinc.com` -- which is still Wix -- and you lose the ability to preview
the new site. So: verify staging, then DNS, then custom domain.

### 1. Verify staging (do this now, before touching anything)

Open <https://samuraibuddha.github.io/EBIC-website/> and walk the site:

- Homepage hero renders the particle field over the dark background.
- Nav "Showcase" reaches the full-screen stage; hover materializes a scan;
  clicking advances to the next dataset.
- Services, Portfolio, About, Contact, Quote all load.

All internal navigation is relative, so every link works correctly from the
`github.io` sub-path. Only the `canonical` / `og:url` / schema tags carry the
absolute `https://www.ebicinc.com/` form, which is what you want -- they should
keep pointing at the real domain even while you are previewing.

### 2. Change the DNS records at Wix

Wix locks DNS editing while a domain is actively connected to a Wix **site**,
so the connection comes off first.

1. Go to <https://www.wix.com/my-account/domains>.
2. Click `ebicinc.com`.
3. If it shows as connected to a Wix site, open the site connection and
   **disconnect** it. The Wix site itself is not deleted -- this only releases
   the domain, which is what makes rollback easy.
4. Open **Advanced -> Edit / Manage DNS records**.

Then make exactly these changes, and **leave every MX and TXT record alone**:

**A records on the root / apex (`@`)** -- delete the existing Wix addresses
(`185.230.63.x`) and add all four GitHub Pages addresses:

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

**AAAA records on the root / apex (`@`)** -- optional but recommended, for IPv6
visitors:

```
2606:50c0:8000::153
2606:50c0:8001::153
2606:50c0:8002::153
2606:50c0:8003::153
```

**CNAME for `www`** -- change the value from `cdn1.wixdns.net` to:

```
samuraibuddha.github.io
```

Note there is no repository name and no trailing path in that CNAME value --
just the account's `github.io` host. Save.

#### 2a. Observed state of the zone, 2026-09-29

Read directly from Manage DNS Records in the Wix Studio dashboard.

**Apex A records currently pointing at Wix -- THREE, not four:**

```
ebicinc.com   185.230.63.171   TTL 1 Hour
ebicinc.com   185.230.63.186   TTL 1 Hour
ebicinc.com   185.230.63.107   TTL 1 Hour
```

These are the ones step 2 deletes. All three go; the four GitHub addresses
replace them.

**CNAMEs present include DKIM records** -- `s1._domainkey`, `s2._domainkey`,
`sel1._domainkey`. These are email authentication, not website records. Leave
them exactly alone. Adding the `www` CNAME does not disturb them.

**MX records ARE on the Manage DNS Records page.** The domain's `...` menu
offers "Manage DNS records" and "Manage MX records" as separate entries, which
reads as though MX lives only on the second one. It does not. A, CNAME, TXT,
SRV and MX are all sections of the one page, with MX below the fold under an
SRV block that is usually empty.

So the "leave MX alone" warning in this document is doing real work and the UI
does not enforce it for you. Scroll far enough on the page where you edit the
A records and you are looking at the Google Workspace mail records. Note also
that the TXT section holds SPF, DMARC and a Google DKIM record, and the CNAME
section holds four more DKIM records plus a SendGrid alias -- the `www` record
you edit sits in the middle of that list.

Not captured: the full CNAME and TXT values, which the dashboard truncates in
the table and which could not be read programmatically (the records table is
an iframe). If you want a complete pre-change snapshot, `dig ebicinc.com ANY`
or expanding each row by hand will get it. The A records above are what step 2
actually needs.

#### 2b. Alternative: do step 2 through the Wix API instead of the UI

Added 2026-09-29. Optional, and **safer than the UI for this particular job**,
for one specific reason given below. Either path is fine; do not do both.

> **BLOCKED as of 2026-09-29 -- read this before spending time on it.**
> The Domains API scopes are not grantable through the API key UI on this
> account. The full permissions list was read directly from
> `manage.wix.com/account/api-keys`: 24 account-level permissions, and the
> only one mentioning domains is "Manage Premium Subscriptions" (*"Read and
> manage your account's Wix premium subscriptions, including domains,
> business email, and digital goods"*) -- that is billing, not DNS zones.
> There is no Domains permission and no DNS permission anywhere in the list.
>
> Confirmed two ways: the API returns `403 DOMAINS_PERMISSION_DENIED` naming
> `DOMAINS.READ_DNS_ZONES` and `DOMAINS.READ_CONNECTED_DOMAINS`, while the
> same key succeeds on `site-list` (HTTP 200) -- so the credential is valid
> and it is the scope that is missing, not the key.
>
> This was re-checked after the account reached **Wix Studio Partner,
> Pioneer level**. Pioneer does not unlock it. Use the UI path in step 2.

`UpdateDnsZone` is a `PATCH` that takes explicit `additions` and `deletions`
arrays. It is **not** a whole-zone replace -- the docs describe it as "adds DNS
records to and removes DNS records from a DNS zone", and records you do not
name are left alone.

That is exactly the safety property this runbook is built around. The whole
reason for "leave every MX and TXT record alone" is that Google Workspace mail
runs on this domain and a slip kills `jordan@ebicinc.com`. Through the API you
never type the letters M or X: the request names only the A and CNAME records,
so the mail records cannot be collaterally edited by a misclick in a records
table. The call is also synchronous and atomic -- it fails whole rather than
leaving the apex half-pointed.

**The setup is not free, so it is worth knowing before starting.** The Domain
DNS API is account-level-API-key only:

> This call requires an account level API key and cannot be authenticated with
> the standard authorization header.

So the default browser-OAuth MCP config in `.mcp.json` will **not** work for
this, and the failure will look like a permissions error rather than a config
error. You need:

1. An account-level API key -- <https://manage.wix.com/account/api-keys>.
2. Your Wix account ID, shown on the same page.
3. A second MCP entry carrying both. **It holds a secret, so it goes in the
   user-level config (`~/.claude.json`), never in this public repo:**

```json
{
  "mcpServers": {
    "wix-dns": {
      "type": "http",
      "url": "https://mcp.wix.com/mcp",
      "headers": {
        "Authorization": "<ACCOUNT LEVEL API KEY>",
        "wix-account-id": "<WIX ACCOUNT ID>"
      }
    }
  }
}
```

The relevant MCP tool is `CallWixSiteAPI` (single REST call). The business
solutions advertised on the Wix MCP marketing page -- eCommerce, Bookings, CMS
-- are not the tool surface; it exposes a generic REST passthrough, which is how
a domains call is reachable at all.

**The order matters, and the first step is not optional.** `deletions` match on
exact values, so you cannot write the delete until you have read what is
actually there:

1. **Read the zone first.** Get the current records for `ebicinc.com` and keep
   the output. This is your rollback source -- it is the only record of the
   pre-change MX and TXT values, and it costs nothing.
2. **One PATCH, deleting the Wix A record and adding the GitHub one.**

```bash
curl -X PATCH 'https://www.wixapis.com/domains/v1/dns-zones/ebicinc.com' \
  -H 'Authorization: <ACCOUNT LEVEL API KEY>' \
  -H 'wix-account-id: <WIX ACCOUNT ID>' \
  -H 'Content-Type: application/json' \
  -d '{
    "deletions": [
      { "type": "A", "hostName": "ebicinc.com",
        "values": ["<THE 185.230.63.x VALUES YOU READ IN STEP 1>"] }
    ],
    "additions": [
      { "type": "A", "hostName": "ebicinc.com", "ttl": 3600,
        "values": ["185.199.108.153", "185.199.109.153",
                   "185.199.110.153", "185.199.111.153"] },
      { "type": "CNAME", "hostName": "www.ebicinc.com", "ttl": 3600,
        "values": ["samuraibuddha.github.io"] }
    ]
  }'
```

**The trap that will bite if you improvise this:** the API allows only ONE
record object per record type, with multiple values carried in `values`. You
therefore cannot add the four GitHub addresses as four separate `A` additions,
and you cannot add them one at a time alongside the existing Wix address. It is
one delete of the whole A record plus one add of the whole A record, in the same
request. The docs say so directly:

> You can only set up a single `record` object per DNS record type. If you want
> to specify multiple values for the same record type, you must save them in the
> `values` for the relevant type.

If an existing `www` CNAME is present, delete it in the same call rather than
adding a second one.

Note `dnssecEnabled` is also a field on this endpoint. Do not send it. Leave
DNSSEC exactly as it is.

**Two things this path does not settle**, both unverified as of writing:

- Wix locks DNS editing in the UI while the domain is connected to a Wix site,
  which is why step 2 disconnects first. Whether the API enforces the same lock
  is untested. If the PATCH is rejected, disconnect the Wix site as in step 2
  and retry.
- The API-key path has not been exercised on this account. If getting the key
  turns into a detour, the UI path in step 2 is proven and takes ten minutes.

Verification is unchanged -- use step 5 either way, and treat the `MX` check
there as the one that must pass before you walk away.

### 3. Point GitHub at the domain

Once the records are saved:

1. Repository **Settings -> Pages -> Custom domain**.
2. Enter `www.ebicinc.com` and save.

`www` is the right primary: every `canonical` and `og:url` tag on the site
already declares the `www` form, so making the apex primary instead would put
the site's own metadata at odds with the URL people land on. GitHub
automatically redirects the apex to `www` because of the A records from step 2.

Saving this writes a `CNAME` file into the repository root. Leave it there --
deleting it unsets the custom domain.

### 4. Enable HTTPS

GitHub provisions a Let's Encrypt certificate once it can see the DNS. This is
usually minutes but is documented as taking up to 24 hours.

When **Settings -> Pages -> Enforce HTTPS** stops being greyed out, tick it.
Do not skip this: without it the site answers on plain HTTP.

### 5. Confirm

```bash
# should return the four GitHub addresses
nslookup ebicinc.com 8.8.8.8

# should resolve through to github.io
nslookup www.ebicinc.com 8.8.8.8

# should be 200, and http:// should 301 to https://
curl -sI https://www.ebicinc.com/ | head -1

# email must still resolve -- if this changes, stop and restore
nslookup -type=MX ebicinc.com 8.8.8.8
```

Propagation is typically under an hour, but allow up to 48 hours for the
long tail.

---

## Rollback

Reconnect the domain to the Wix site in the Wix dashboard. That restores Wix's
own A and CNAME records and the old site answers again. Nothing in this
procedure deletes the Wix site or its content.

If you have already set the custom domain in GitHub, clear it in
**Settings -> Pages** as well, so `github.io` stops redirecting.

---

## What GitHub Pages does not do that Apache did

`.htaccess` in this repository is an **Apache** configuration file. GitHub
Pages does not read it, so these stop applying at cutover:

| Directive | Impact | Notes |
|---|---|---|
| `Header always set X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `X-XSS-Protection` | **Lost.** Pages does not support custom response headers. | Unavoidable on Pages. Putting Cloudflare in front of the domain restores them for free, and is the usual fix if these matter. |
| Extensionless URL rewriting (`/services` -> `services.html`) | **Lost.** | Low impact: every internal link on the site already uses the explicit `.html` form. Only hand-typed or externally published extensionless links would 404. |
| Trailing-slash 301 canonicalisation | **Lost.** | Cosmetic. |
| `ExpiresByType` / `Cache-Control` tuning | **Replaced.** | Pages sets its own caching (roughly 10 minutes on HTML). Fine for a brochure site. |
| `mod_deflate` compression | **Replaced.** | Pages compresses automatically. |
| `ErrorDocument 404 /404.html` | **Now works.** | Pages serves `/404.html` for unknown paths natively, and that file now exists. |

The file is kept in the repository because it costs nothing and documents the
intent, but be aware it is inert on Pages.

---

## Deploying future changes

Push to `master`. Pages rebuilds automatically, usually within a minute.

```bash
git add -A
git commit -m "..."
git push origin master
gh api repos/SamuraiBuddha/EBIC-website/pages/builds/latest --jq '.status'
```

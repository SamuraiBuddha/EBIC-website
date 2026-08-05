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

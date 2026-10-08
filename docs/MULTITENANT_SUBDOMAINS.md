# Multi-Tenant Subdomain Setup

> Phase 1 foundation reference. Pinned plan lives in `.lovable/plan.md`.

## Subdomain → shell mapping

| Subdomain                | Shell        | Tier         | Status          |
| ------------------------ | ------------ | ------------ | --------------- |
| `app.task-me.ke`         | TaskMe app   | `agency`     | Live (existing) |
| `integral.task-me.ke`    | Integral     | `integral`   | Phase 1 stub    |
| `pms.task-me.ke`         | Partial      | `partial`    | Phase 2         |
| `pms.sf.task-me.ke`      | Self-Manage  | `self_manage`| Phase 3         |

Resolution happens in two places, in this order:
1. **Browser host** (`window.location.host`) — `utils/orgHost.ts`.
2. **DB lookup** via `resolve_org_by_host(_host)` — `context/OrgContext.tsx`. Returns
   the org's `id`, `tier`, `status`, and public branding (no Mpesa secrets).

If the org row is missing or the host doesn't match a known subdomain, the
app falls back to the **agency** shell so existing previews and localhost
keep working. Suspended orgs are blocked at the shell level before any UI
loads.

## Dev / preview overrides

To preview a non-agency shell from localhost or a preview URL, append a
query param once:

- `?shell=integral`
- `?shell=partial`
- `?shell=self_manage`
- `?shell=agency`

The choice is cached in `sessionStorage` so navigation keeps the same shell
until the tab closes. Production hosts ignore the override (the host always
wins via the explicit `app.task-me.ke` / `integral.task-me.ke` checks).

## DNS records to add (when ready to go live)

Connect each subdomain in **Project Settings → Project section → Domains**.
For each, add at your DNS provider:

```
A      integral.task-me.ke    185.158.133.1
A      pms.task-me.ke         185.158.133.1
A      pms.sf.task-me.ke      185.158.133.1
TXT    _lovable.<sub>         lovable_verify=...
```

`app.task-me.ke` should already be in place. SSL is provisioned
automatically by Lovable per subdomain.

## Auth model

You picked **separate login per subdomain** — cookies are scoped to the
exact host, not `.task-me.ke`. The Supabase client today persists sessions
in `localStorage`, which already isolates per-origin, so this is the
default behavior with no extra config.

For Integral super-admin impersonation across subdomains, see the
`org_impersonation_tokens` table — UI ships in the next iteration.

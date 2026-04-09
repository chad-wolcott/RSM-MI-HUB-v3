# RSM Defense — Managed Identity Hub

A centralized web-based management console providing a single pane of glass across all client SailPoint ISC and CyberArk PAM identity tenants.

**Version:** 1.0 (Frontend Iteration — Mock Data)  
**Classification:** Internal  

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| Routing | React Router v6 |
| Styling | Custom CSS with RSM brand variables |
| Data | Mock data (no backend yet) |
| Hosting | Netlify (static SPA) |

---

## Features in this iteration

- **Dashboard** — Live stats, health summary, alert banners, activity feed, quick actions
- **Tenant List** — Sortable/filterable table of 20 mock tenants with search, type/status filters, pagination, and URL copy
- **Tenant Launch** — Animated multi-step launch workflow simulating Delinea credential retrieval
- **Onboarding Wizard** — 6-step guided wizard with form validation and simulated connectivity checks
- **Admin Console** — Tabbed interface: General, Identity Provider (OIDC), Users (role management), Vault Config, Health Check, SIEM, System Health
- **Audit Logs** — Searchable/filterable immutable log viewer with CSV and JSON export

---

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

The dev server runs at `http://localhost:5173`.

---

## Deploy to Netlify

### Option 1: Netlify CLI

```bash
npm install -g netlify-cli
npm run build
netlify deploy --prod --dir=dist
```

### Option 2: GitHub + Netlify (recommended)

1. Push this repo to GitHub
2. Log in to [netlify.com](https://netlify.com) → **Add new site** → **Import from Git**
3. Select your repo
4. Netlify auto-detects the `netlify.toml` — no config needed
5. Click **Deploy site**

Every push to `main` will auto-deploy. Pull request previews are generated automatically.

### netlify.toml summary

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200    # SPA catch-all routing
```

---

## Project Structure

```
mih-app/
├── netlify.toml          # Netlify build + routing config
├── package.json
├── vite.config.js
├── index.html
├── public/
│   └── rsm-logo.png      # RSM brand logo
└── src/
    ├── main.jsx           # Entry point
    ├── App.jsx            # Router, Layout, Sidebar, Theme context
    ├── styles.css         # Global CSS with RSM brand variables
    ├── data/
    │   └── mock.js        # Mock tenants, users, audit logs, stats
    └── pages/
        ├── Dashboard.jsx  # Main dashboard with stats + activity
        ├── Tenants.jsx    # Tenant list + Launch modal
        ├── Onboard.jsx    # 6-step onboarding wizard
        ├── Admin.jsx      # Admin console (7 tabs)
        └── AuditLogs.jsx  # Audit log viewer + export
```

---

## Brand Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--rsm-navy` | `#000153` | Sidebar, primary brand |
| `--rsm-cyan` | `#009CDE` | Accent, links, primary actions |
| `--rsm-green` | `#3F9C35` | Healthy status, success states |
| `--rsm-gray` | `#888B8D` | Secondary text, neutral badges |

---

## Next Steps (Backend Integration)

When adding a real backend, replace mock data references in:

| File | Replace |
|------|---------|
| `src/data/mock.js` | All constants — wire to API calls |
| `src/pages/Tenants.jsx` | `MOCK_TENANTS` → `GET /api/tenants` |
| `src/pages/Dashboard.jsx` | `STATS` + `MOCK_ACTIVITY` → `GET /api/dashboard` |
| `src/pages/AuditLogs.jsx` | `MOCK_AUDIT_LOGS` → `GET /api/audit` |
| `src/pages/Admin.jsx` | `MOCK_USERS` → `GET /api/users` |

Recommended backend options (per spec):
- **Node.js + Express** with MSAL.js for Entra ID / Okta OIDC
- **.NET 8 Web API** with Microsoft.Identity.Web
- Database: PostgreSQL or Azure SQL

---

## Requirements Coverage (v1.0 mock)

| Section | Req IDs | Status |
|---------|---------|--------|
| Dashboard | DASH-001–013 | ✅ UI complete (mock data) |
| Tenant List | TL-001–008 | ✅ UI complete |
| Tenant Launch | LCH-001,006,007 | ✅ UI/UX complete (mock flow) |
| Onboarding | ONB-001–009 | ✅ UI complete |
| Administration | ADM-001–015 | ✅ UI complete |
| Audit Logs | AUD-001–007 | ✅ UI complete + export |
| Authentication | AUTH-001–008 | 🔲 Requires real IdP integration |
| Security | SEC-001–010 | 🔲 Requires backend |
| Performance | PERF-001–006 | 🔲 Requires backend load testing |

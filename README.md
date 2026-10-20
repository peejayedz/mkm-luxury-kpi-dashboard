# MKM Luxury — Sales KPI Dashboard

Live page: https://peejayedz.github.io/mkm-luxury-kpi-dashboard/

- `sync.mjs` runs hourly in GitHub Actions (`.github/workflows/sync.yml`), reads GoHighLevel with a read-only Private Integration token and writes `data.json`.
- Contact names, phones, emails and opportunity names are AES-GCM encrypted with the team passphrase; only aggregate-ready lead metrics are public.
- `kpi-core.mjs` holds every KPI rule, shared by the page and the tests, so a tile always equals its click-through list.
- `config.mjs` — location id, source spelling merges, white-label GHL URL.

## Secrets (Settings → Secrets and variables → Actions)
- `GHL_TOKEN` — GHL Private Integration token (read-only scopes).
- `DASHBOARD_PASSPHRASE` — team unlock phrase. Changing it signs out every remembered device.

## Run a sync now
Actions → "Sync GHL data" → Run workflow.

# QA — Checkpoint 7.0A Personal Private Online

## Automated regression
- `npm test`: **62 tests / 62 pass / 0 fail**.
- CP6 persistent-data migration + validated pre-migration backup: PASS.
- CP6.6 exact Excel report templates: PASS.
- CP7 Legal Intelligence + human-review-only behavior: PASS.
- Tailscale IPv4 range detection: PASS.
- Personal Private runtime health fields + minimal public `/healthz`: PASS.
- Existing optional Cloudflare security gateway regression: PASS.

## Static checks
- `node --check server.mjs`: PASS.
- `node --check public/app.js`: PASS.
- `node --check scripts/start-personal-private.mjs`: PASS.
- `node --check scripts/personal-online-preflight.mjs`: PASS.
- `node --check scripts/personal-online-status.mjs`: PASS.

## Runtime limitation in packaging environment
The build environment does not have an authenticated Tailscale node, so the final launcher cannot be proven against a real tailnet here. The launcher is deliberately fail-closed: if a valid Tailscale IPv4 cannot be detected, it exits instead of binding the app to LAN/public interfaces. The first user-device run must pass `START_PRIVATE_ONLINE.bat` preflight and show a `100.64.0.0/10` Private URL before remote use.

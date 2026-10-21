# CP7.3 Login Fix

Root cause addressed: Railway login depended on a first-run/random or one-shot reset flow that was too easy to desynchronize from the persistent SQLite volume. CP7.3 changes the Railway contract to one explicit canonical secret: `EHS_ADMIN_PASSWORD`.

Recovery contract:
- Persistent DB/volume is kept intact.
- On every server start, if `EHS_ADMIN_PASSWORD` is present, `admin` is re-enabled, assigned role `admin`, re-hashed from that value, login guard is removed, and previous admin sessions are revoked.
- A correct password is checked before enforcing an existing brute-force guard, so the legitimate user can recover from an accidental lock without waiting 15 minutes.
- Wrong attempts are still rate-limited/locked.
- Railway launcher refuses to start without an explicit `EHS_ADMIN_PASSWORD`, preventing another unknown first-run password scenario.

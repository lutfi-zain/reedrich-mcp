## 1. Cloudflare Tunnel Ingress & Host Invariant Verification

- [x] 1.1 Verify Cloudflare Tunnel route for `pg.membran.app` in `/etc/cloudflared/config.yml` points to `tcp://127.0.0.1:6432`
- [x] 1.2 Verify PgBouncer container is healthy and actively listening on `127.0.0.1:6432` with TLS enabled
- [x] 1.3 Confirm UFW firewall policy maintains `default deny incoming` with port 6432 strictly closed to public IP traffic

## 2. Cloudflare Hyperdrive Domain Origin Migration

- [x] 2.1 Reconfigure Cloudflare Hyperdrive configuration `vps-pg` (`246e815964a44eed9464752afe346134`) via Wrangler to use domain origin `--host 43-133-148-181.sslip.io` targeting database `reedrich`
- [x] 2.2 Verify updated Hyperdrive configuration via `npx wrangler hyperdrive get 246e815964a44eed9464752afe346134` shows domain origin `43-133-148-181.sslip.io` with zero raw IP addresses
## 3. Worker Build & Edge Deployment

- [x] 3.1 Run TypeScript static type check (`npm run typecheck`) to ensure zero build errors
- [x] 3.2 Run local unit and integration tests (`npm test`) against `reedrich_test`
- [x] 3.3 Deploy the worker to Cloudflare Workers (`npm run deploy`)

## 4. End-to-End Verification & Health Checks

- [x] 4.1 Perform live health probe on worker endpoint (`GET /health`)
- [x] 4.2 Execute a live test probe against MCP `register_user` or `login_user` tool over HTTPS to confirm database connectivity latency is under 500ms
- [x] 4.3 Validate that the Google OAuth callback profile lookup (`/oauth/google/callback`) executes without 30-second socket timeouts or HTTP 500 errors
- [x] 4.4 Run remote integration test suite (`npm run test:remote`) ensuring zero regressions

## 5. Documentation & Operational Logging

- [x] 5.1 Update `AGENTS.md` and `README.md` to document the domain origin requirement and ban raw IP origins for Hyperdrive
- [x] 5.2 Append operational maintenance entry to OKF log (`~/.donna/vault/.okf/log.md`) and update concept dossier for Hyperdrive

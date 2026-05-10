# RepFlow smoke tests

Single Playwright spec that walks the demo golden path end-to-end against a
live deployment. No Playwright dep in `package.json` — invoke via `npx`.

## Run

```bash
# one-time: install chromium + system deps
npx playwright@latest install chromium --with-deps

# run against default prod (https://koino-insurance-os.vercel.app)
npx playwright@latest test tests/ux-hot-path.spec.js --reporter=line

# override target
PLAYWRIGHT_BASE_URL=https://repflow.koino.capital \
  npx playwright@latest test tests/ux-hot-path.spec.js --reporter=line
```

Screenshots land in `tests/screenshots/`. Failed-step shots are prefixed `FAIL-`.

## Steps asserted

1. **landing** — `/landing.html` renders signup CTA, click navigates to login.
2. **demo mode** — "Continue with demo" button (or `?demo=1` fallback) loads the app shell.
3. **today / hq** — login card gone, sidebar nav populated.
4. **floor / live** — Floor nav opens, Live tab list renders ≥1 row.
5. **crm pipeline** — CRM (or Floor → Pipeline) renders ≥1 lead row.
6. **copilot** — AI rail opens, `/api/copilot` returns <500, assistant message renders.
7. **sign out** — `window.signOut()` returns to login card.

A failing step is logged but the spec keeps going — final summary lists PASS / FAIL per step.

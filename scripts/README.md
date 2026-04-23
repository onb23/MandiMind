# Scripts

## Cloudflare API interactive challenge guard

Use this script to inspect (and optionally update) Cloudflare zone security behavior so API requests are not blocked by interactive challenges.

### Inspect only (safe default)

```bash
CLOUDFLARE_API_TOKEN=... \
CLOUDFLARE_ZONE_NAME=mandimind.tech \
CLOUDFLARE_API_HOST=api.mandimind.tech \
pnpm --filter @workspace/scripts run cloudflare:api-guard
```

### Apply the suggested skip rule

```bash
CLOUDFLARE_API_TOKEN=... \
CLOUDFLARE_ZONE_NAME=mandimind.tech \
CLOUDFLARE_API_HOST=api.mandimind.tech \
pnpm --filter @workspace/scripts exec tsx ./src/cloudflare-api-challenge-guard.ts --apply
```

The rule skips interactive challenge/security products for API hostname and `/api/*` paths while keeping normal protections for web pages.

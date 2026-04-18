# Deployment Marker Notes

This document tracks lightweight deployment markers added to verify that Cloudflare Pages and Worker deploys are live.

## Files Changed

- `artifacts/mandimind/src/pages/Settings.jsx`
- `artifacts/api-server/src/routes/health.ts`

## Version Label Added (Frontend)

- Added a small Settings-page deployment marker:
  - `APP_VERSION = "v1.0.4-debug"`
- Placement:
  - Near the bottom of the Settings page, below the app info card.
- Styling:
  - Small font size (`11px`)
  - Reduced opacity for subtlety
  - Minimal visual footprint

## Credit Text Added (Frontend)

- Added subtle credit line:
  - `made by omkar borade`
- Placement:
  - Directly below the version label in Settings.
- Styling:
  - Monospace stack (`"Courier New", Courier, monospace`)
  - Slight letter spacing for distinct but understated branding

## Backend Debug Version Marker

- Added an internal health/debug route:
  - `GET /healthz/internal`
- Response now includes:
  - `status: "ok"`
  - `debugVersion: "worker-v1.0.4"`
- Existing `GET /healthz` route was preserved unchanged to avoid breaking current API shape.

## How to Update for Future Deployment Verification

When you need to verify a fresh deploy:

1. Update frontend marker in `Settings.jsx`:
   - `APP_VERSION = "vX.Y.Z-debug"`
2. Update backend marker in `health.ts`:
   - `WORKER_DEBUG_VERSION = "worker-vX.Y.Z"`
3. Deploy frontend and backend.
4. Verify live environment:
   - Open Settings page and confirm updated version + credit text are visible.
   - Hit `/healthz/internal` and confirm updated `debugVersion` value.

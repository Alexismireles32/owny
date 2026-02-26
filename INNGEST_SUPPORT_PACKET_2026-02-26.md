# Inngest Support Packet (Owny)

Date (UTC): 2026-02-26T20:42:49Z

## Problem Summary

Events are accepted by Inngest Event API (`status: 200` + event IDs returned), but no function runs are ever created in the same environment. This occurs for multiple trigger types, not only `pipeline/start`.

## Production App Details

- App URL: `https://owny.vercel.app`
- Inngest route: `https://owny.vercel.app/api/inngest`
- Runtime introspection (signed GET to `/api/inngest`):
  - `app_id`: `owny-core`
  - `env`: `main`
  - `mode`: `cloud`
  - `function_count`: `1`
  - `event_key_hash`: `40198f470acec8ea02fd3b1ab311aa5ba1118dfcc665e0188aa3f2eb5b2f7651`
  - `signing_key_hash`: `signkey-prod-6134a527669142574ad4b2052390b6251e96a480f84798bce9e3fcdfbdf04458`

## Registration State

- `PUT https://owny.vercel.app/api/inngest` returns:
  - `{"message":"Successfully registered","modified":true}`
- `GET /v1/apps/owny-core/functions` returns one active function:
  - `owny-core-scrape-pipeline` (trigger `pipeline/start`, step URL points to `https://owny.vercel.app/api/inngest?...`)
- `GET /v1/apps/owny/functions` still returns legacy functions under app `owny` (older namespace).

## Repro Evidence (Fresh)

### Probe 1: `pipeline/start`

- Event API send result:
  - Event internal ID: `01KJDTZ3RMXV0NTKCHZ0N4415X`
  - Send status: `200`
- Run lookup:
  - `GET /v1/events/01KJDTZ3RMXV0NTKCHZ0N4415X/runs`
  - Observed over 5 polls: `0, 0, 0, 0, 0`

### Probe 2: `email/drip.tick`

- Event API send result:
  - Event internal ID: `01KJDTZAMVC74GXWG9GAW71J1N`
  - Send status: `200`
- Run lookup:
  - `GET /v1/events/01KJDTZAMVC74GXWG9GAW71J1N/runs`
  - Observed over 5 polls: `0, 0, 0, 0, 0`

## Expected vs Actual

- Expected: accepted events should create at least one run when matching registered triggers.
- Actual: events are ingested in environment `main` but produce zero runs.

## Code / Deploy Context

Recent relevant commits:

- `57d6129` Start direct fallback immediately when dispatch is unhealthy
- `192dc1d` Fail over immediately when Inngest dispatch creates no runs
- `c94c2bd` Isolate Inngest app namespace to avoid registration collisions
- `aef6c2a` Harden pipeline dispatch with direct fallback watchdog

Latest production deploy alias points to:

- `https://owny-16wq1nsph-alexismrls32-4348s-projects.vercel.app`
- aliased as `https://owny.vercel.app`

## Attachment

Machine-generated full evidence JSON:

- `support.inngest.evidence.json`


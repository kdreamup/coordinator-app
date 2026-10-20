# Administrator bounded reads — 2026-10-20

## Behavior

- Boot opens today's records, not the selected month's full detail.
- Today's two legacy-compatible date streams are shared by initial loading, in-page reload, and live attendance monitoring. Month detail uses two cursor queries of 50 documents each per explicit action (at most 100 returned documents before deduplication).
- Monthly rows are explicitly partial until exhausted. Totals and inactive-member lists are withheld, and Excel is blocked until the requested month is complete. Filters explicitly state they apply to loaded rows. Full-month calculation/search/export requires the separate confirmed action.
- Two date fields remain supported to avoid hiding older visit records. Same-ID rows are merged. Legacy rows with neither date remain reachable via the existing explicit all-period operation.
- In-page monthly reload starts a new bounded page; today reload reuses the current stream. A full browser reload or another computer still creates independent today listeners. There is no claim of shared cross-computer caching.
- Date correction, full record editing, outbox and staff APK are unchanged. No new rules, indexes, authentication, billing or attendance writes are part of deployment.

## Verification

- `node tests/admin-bounded-reads.cjs`: 1200 records, cursor continuity, overlap deduplication, concurrent actions, offline partial-page retry without cursor advancement, stable cached edits, two shared today listeners, no month load at boot.
- `node tests/admin-boundaries.cjs`, `node tests/admin-record-editor.cjs`, `node tests/admin-corrections.cjs`, `node tests/read-scope.cjs`, `node tests/attendance-regression.cjs`, visit save/draft regressions passed locally.
- Complete HTML DOM integration: install `jsdom@26.1.0` with `npm install --prefix /tmp/coordinator-admin-test-tools --no-save --no-audit --no-fund jsdom@26.1.0`; then `node tests/admin-page-integration.cjs`. All Firebase operations are mocks, and unexpected writes fail. Optional `ADMIN_BASELINE_FILE` points to the preceding administrator HTML for comparison.
- Synthetic fixture: 1200 monthly documents, 600 overlapping visit dates, 60 today documents. Previous boot returned 1950 attendance documents across calls; new boot returned 90, same-page today reload returned 0 additional documents; first month detail action returned 100. These are test returned-document counts, not billable-read measurements or a guarantee for production traffic.

## Remaining limits

No precomputed month summary is introduced: requesting the complete month still reads the complete requested month. Free-text/filter search is explicitly limited to loaded rows until the administrator requests all month rows. Persistent cross-refresh caches, cross-device shared summaries and staff retry fixes are separate work. Actual production daily quota behavior must be measured after deployment. This change does not establish server-side administrator authorization.

## Delivery

`deployment-admin-read-fix` is a whitelist-only Hosting package (three HTML files, previous staff and classic administrator HTML preserved). The deployment driver verifies packaged SHA-256 hashes and live HTML hashes, and never changes Firestore configuration. A copy of the previous administrator HTML is retained outside the public directory for rollback. Do not deploy the repository root/public directory wholesale.

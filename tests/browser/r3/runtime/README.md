# Isolated actual Next runtime

This test-only application runs copies of the actual R3 routes and root layout
through installed Next's production build/start. It is not the production app.
Codex remains the implementation writer; this is verification, not a handoff runner.

From the worktree, with the fixture server stopped:

1. Generate the existing static CSS/artwork fixtures with `node scripts/renderR3Fixtures.mjs ../shots/r3-static` if absent.
2. `node scripts/buildR3NextFixture.mjs`
3. `node scripts/runR3NextFixture.mjs build`
4. `node scripts/runR3NextFixture.mjs start` in a separate process.
5. `node scripts/verifyR3NextRuntime.mjs`
6. Write `.next/r3-runtime/stop` to stop only the launched fixture server. The runner also has a ten-minute deadline.

Use existing dependencies only. The generated project stays inside ignored
`.next/r3-runtime`; screenshots/HTML/records use the existing sibling shots folder.
The build runner removes only the verified fixture cache, preventing old
`unstable_cache` fixture results surviving provider-contract changes.

Provider/database/email modules are aliased to fixture contracts. Compilation
rejects original provider and analytics transport modules. Node starts without
inherited credentials and preloads fetch/HTTP/socket restrictions before Next
and its workers. Browser requests permit loopback fixture routes/assets and
reference artwork only; unrelated local navigation/prefetch routes receive a
recorded fixture 404 without reaching the server. No affiliate destination is
visited. The actual click handler reaches stub transports, not SDKs/ingestion.

Boundaries: Google font setup is replaced by previously compiled offline CSS;
Next Script and analytics transports are replaced; Image optimisation is disabled;
listing route is copied unchanged with its approved dynamic rendering. Source hashes and declared transforms
are written to the manifest. Real Next HTML, hydration, metadata-file loader,
client navigation, route announcer, cache wrappers and shared components remain.
This does not prove production deployment, provider integration, crawler
ingestion, Safari/iOS, real screen readers or unrelated routes.

Known installed-Next finding: an uncached ISR `permanentRedirect` emits two identical
Location headers. It reproduces in the real listing route and a framework-only
control. Cached responses have one. Node's redirect follower combines the cold
values into an invalid card path and gets 404. The main verifier retains this
framework-only control separately from actual route acceptance. The approved
listing route omits static generation to avoid that path; data caches remain.

`node scripts/diagnoseR3Redirect.mjs` compares fresh raw HTTP, Node fetch and
Chrome responses using the running ordinary fixture. It deliberately reports
the header/Node failure even when Chrome reaches the right destination.

The owner approved the measured cache trade-off after the opt-in prototype.
The generator now copies the actual dynamic listing route without transforming
static params; the old probe flag is retired. Run
`node scripts/probeR3DynamicRedirect.mjs` to check single redirects and no-store
page responses in this default fixture. Original data-cache code remains, but
equivalent provider counts/billing are not claimed. Main verification also
exercises one real category and its sealed redirect through fixture providers.

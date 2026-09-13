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

## R4 catalogue extension

The same generator now includes the actual set and species routes. Run `node scripts/verifyR4Catalogue.mjs` against the same isolated server for the R4 matrix (1280/light, 390/light, 320/dark), saved HTML, list/gallery interactions, native keyboard skip, local storage failure/reset/reload and actual missing-only print PDFs. It never accepts a remote application URL.

Fixture provenance: `saved-catalogue.json` contains publicly rendered historical RSC card data recovered locally from `../prod-jungle.html`, `../local-nd.html` and `../drag-after.html`; live offers stripped. Jungle64, Neo Destiny113 and Dragonite75 retain exact historical permanent links and recorded reference context. `dragonite-links.json` preserves the earlier saved 75-link baseline. `set-rows.json` preserves the 17C.12 rendered identities (keys/name/number/rarity) for the three set pilots. Boundaries Crossed153 uses those identities with explicitly simulated reference values/condition and numbered fixture URLs; it does not establish production link-resolution parity for that set. Cleffa is a small synthetic catalogue-path control. No fixture represents current live inventory or prices.

R4 output: `../shots/r4-catalogue/record.json`, three missing-only PDFs and labelled screenshots. Reference artwork may load from the existing TCGPlayer/pokemontcg.io CDNs. All provider/database/analytics transport isolation from R3 still applies. Tests make no Safari/iOS, real screen-reader, crawler-ingestion, live provider, hosting cost or task-study claim. Full exact live link-resolution and runtime costs remain release/observation limits.

## R5 remaining-family extension

The same generator includes directories, all seven guides, six trust pages, release/Japanese/sealed families and current/dated research. `node scripts/verifyR5Families.mjs` uses the same isolated server and installed Chrome; local alert POSTs are fulfilled by CDP and never reach an API/server/email provider. Routes retain actual JSX/metadata/schema. Directory identities reuse saved R4 catalogue data; market aggregates and Japanese offers are explicitly simulated. The Japanese control uses no artwork rather than relabelling an English image; latest-release groups exercise honest sparse states. All1025 species destinations are checked in initial HTML, alongside full fixture set and guide links. Current Tailwind source is compiled on every generation; only embedded local Geist font faces come from the earlier static fixture. This adds no production routes or dependencies. Fixtures and evidence do not establish current market facts, live link resolution, production hosting costs, Safari/iOS or real screen-reader behaviour.

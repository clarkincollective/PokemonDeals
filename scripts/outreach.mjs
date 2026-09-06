// SEO Phase 10D (+ final closeout) - approval-gated manual outreach CLI.
//
//   npm run outreach:list
//   npm run outreach -- show <id>
//   npm run outreach:approve -- <id>
//   npm run outreach:send -- <id> [--dry-run]   (submits one lead to Instantly -> QUEUED)
//   npm run outreach:sync -- <id>               (QUEUED -> SENT only on real Instantly send evidence)
//   npm run outreach -- suppress <domain> [reason...]
//   npm run outreach -- unsuppress <domain>
//   npm run outreach -- replied <id>            (mark a reply received)
//   npm run outreach -- dnc <id>               (mark DO_NOT_CONTACT + suppress)
//
// Runs LOCALLY, server-side, by the site owner. There is no deployed API,
// no background job, no follow-up automation, and no bulk import. Cold
// outreach delivery goes through the compliant provider adapter
// (lib/outreach/provider.js -> Instantly) - NEVER the Resend
// transactional mailer.
//
// Flow: DRAFT -> approve -> APPROVED -> send (one lead created in the
// pre-built Instantly campaign) -> QUEUED -> sync (Instantly confirms the
// email step executed) -> SENT. A provider failure -> FAILED.
// If OUTREACH_TEST_RECIPIENT is set, a send is redirected there and the
// subject is prefixed [TEST]; the record stays APPROVED.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import {
  canApprove,
  canSend,
  isSuppressed,
  submissionsInWindow,
  applySyncResult,
  resolveBody,
  bodyNeedsSnapshot,
  DEFAULT_DAILY_CAP,
  SENDABLE_CONTACT_TYPES,
} from "../lib/outreach/core.js";
import { renderMessage } from "../lib/outreach/render.js";
// Cold outreach goes through a compliant outreach provider (Instantly),
// NEVER through the project's Resend transactional mailer (lib/email.js).
import { getProvider } from "../lib/outreach/provider.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RECORDS_PATH = join(HERE, "..", "lib", "outreach", "records.json");
const SUPPRESSION_PATH = join(HERE, "..", "lib", "outreach", "suppression.json");
const RESEARCH_URL = "https://pokemondealfinder.com/market-data/pokemon-card-value-distribution";

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
const now = () => new Date().toISOString();

const CFG = {
  // Outreach identity is SEPARATE from the Resend transactional sender.
  // No ALERT_FROM_EMAIL fallback - that address is for opt-in mail only.
  // With Instantly the actual From is the campaign's verified mailbox;
  // these values are recorded on the message for the audit trail and
  // used as the reply-to hint.
  fromEmail: process.env.OUTREACH_FROM_EMAIL || null,
  replyTo: process.env.OUTREACH_REPLY_TO || process.env.OUTREACH_FROM_EMAIL || null,
  senderName: process.env.OUTREACH_SENDER_NAME || "James",
  testRecipient: process.env.OUTREACH_TEST_RECIPIENT || null,
  dailyCap: Number(process.env.OUTREACH_DAILY_CAP || DEFAULT_DAILY_CAP),
};

const PROVIDER = getProvider();

function die(msg) {
  console.error(`\n  ✖ ${msg}\n`);
  process.exit(1);
}

function find(records, id) {
  const r = records.find((x) => x.id === id);
  if (!r) die(`no outreach record with id "${id}" (try: npm run outreach:list)`);
  return r;
}

// --- live research snapshot (frozen into a record at approve time) -----
async function fetchSnapshot() {
  const res = await fetch(RESEARCH_URL, { headers: { "user-agent": "pokemondealfinder-outreach/1.0" } });
  if (!res.ok) throw new Error(`research page returned HTTP ${res.status}`);
  const html = await res.text();
  const t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--\s*-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

  const g = (re, label) => {
    const m = t.match(re);
    if (!m) throw new Error(`could not parse ${label} from the live research page`);
    return m[1];
  };
  const snap = {
    snapshotDate: g(/Catalogue snapshot:\s*([0-9][0-9A-Za-z. ]+?[0-9]{4})/, "snapshotDate").trim(),
    population: Number(
      g(/of the ([\d,]+) priced English Pokemon cards in our current analysed catalogue/, "population").replace(/,/g, "")
    ),
    under5Pct: Number(
      g(/([\d.]+)% of the [\d,]+ priced English Pokemon cards[^.]*under \$5/, "under5Pct")
    ),
    under25Pct: Number(g(/Under \$25\s+([\d.]+)%/, "under25Pct")),
    over100Pct: Number(g(/\$100 or more\s+([\d.]+)%/, "over100Pct")),
    median: Number(g(/median raw market reference is \$([\d.]+) USD/i, "median")),
  };
  // sanity
  for (const k of ["under5Pct", "under25Pct", "over100Pct"]) {
    if (!(snap[k] >= 0 && snap[k] <= 100)) throw new Error(`parsed ${k}=${snap[k]} out of range`);
  }
  if (!(snap.population > 1000)) throw new Error(`parsed population=${snap.population} implausible`);
  if (!(snap.median > 0)) throw new Error(`parsed median=${snap.median} implausible`);
  snap.capturedAt = now();
  snap.source = RESEARCH_URL;
  return snap;
}

// --- commands ---------------------------------------------------------

function cmdList(records) {
  console.log("");
  console.log("  id               type            status       recipient");
  console.log("  " + "-".repeat(72));
  for (const r of records) {
    console.log(
      "  " +
        r.id.padEnd(17) +
        String(r.contactType).padEnd(16) +
        String(r.status).padEnd(13) +
        r.recipient
    );
  }
  const inWin = submissionsInWindow(records);
  console.log("");
  console.log("  DRAFT = not approved   APPROVED = ready   QUEUED = lead accepted by Instantly,");
  console.log("  not yet confirmed sent   SENT = Instantly confirmed the email went out");
  console.log("");
  console.log(`  submissions (QUEUED+SENT) in last 24h: ${inWin} / cap ${CFG.dailyCap}`);
  console.log(
    `  provider: ${PROVIDER.name}` +
      (PROVIDER.isConfigured() ? " (configured)" : " (NOT configured - see the phase report)") +
      (CFG.testRecipient ? `   TEST MODE -> ${CFG.testRecipient}` : "")
  );
  console.log(`  reply-to hint: ${CFG.replyTo ?? "(set OUTREACH_REPLY_TO)"}`);
  console.log("  cold outreach never uses the Resend transactional mailer.");
  console.log("");
}

function previewOf(record) {
  if (!SENDABLE_CONTACT_TYPES.includes(record.contactType)) {
    // non-email: show the raw text a human will paste
    return {
      channel: record.contactType,
      target: record.recipient,
      subject: record.subject,
      body: safeBody(record),
    };
  }
  const msg = renderMessage(record, {
    senderName: CFG.senderName,
    fromEmail: CFG.fromEmail || "(from address not configured)",
    replyTo: CFG.replyTo || "(reply-to not configured)",
    testRecipient: CFG.testRecipient,
  });
  return { channel: "EMAIL", to: msg.to, from: msg.from, replyTo: msg.replyTo, subject: msg.subject, body: msg.text };
}

function safeBody(record) {
  try {
    return resolveBody(record);
  } catch (err) {
    return `[unresolved: ${err.message}]\n\n${record.body}`;
  }
}

function cmdShow(records, id) {
  const r = find(records, id);
  const p = previewOf(r);
  console.log("");
  console.log(`  record      : ${r.id}  (${r.prospectName}, ${r.organisation})`);
  console.log(`  status      : ${r.status}`);
  console.log(`  target page : ${r.targetPage}`);
  console.log(`  destination : ${r.destinationUrl}`);
  console.log(`  angle       : ${r.angle}`);
  if (r.contactSourceUrl) console.log(`  contact via : ${r.contactSourceUrl}`);
  if (r.prospectType || r.tier || r.score != null || r.checkedAt) {
    console.log(
      "  qualifier   : " +
        [
          r.prospectType,
          r.tier && `tier ${r.tier}`,
          r.score != null && `score ${r.score}`,
          r.checkedAt && `checked ${r.checkedAt}`,
        ]
          .filter(Boolean)
          .join("   ")
    );
  }
  if (r.linkAcquired) console.log(`  link        : ${r.linkUrl ?? "(acquired)"} -> ${r.linkTargetUrl ?? "?"}`);
  if (r.snapshot) console.log(`  snapshot    : ${JSON.stringify(r.snapshot)}`);
  if (r.provider) console.log(`  provider    : ${r.provider}`);
  if (r.providerRef) console.log(`  providerRef : ${r.providerRef}`);
  if (r.queuedAt) console.log(`  queuedAt    : ${r.queuedAt}`);
  if (r.sentAt) console.log(`  sentAt      : ${r.sentAt}  (Instantly send evidence)`);
  if (r.syncedAt) console.log(`  syncedAt    : ${r.syncedAt}`);
  if (r.lastTest) console.log(`  lastTest    : ${JSON.stringify(r.lastTest)}  (test-recipient redirect - prospect NOT contacted)`);
  if (r.lastError) console.log(`  lastError   : ${JSON.stringify(r.lastError)}`);
  console.log("  " + "-".repeat(72));
  console.log(`  channel     : ${p.channel}`);
  if (p.to) console.log(`  to          : ${p.to}`);
  if (p.target) console.log(`  post to     : ${p.target}`);
  if (p.from) console.log(`  from        : ${p.from}`);
  if (p.replyTo) console.log(`  reply-to    : ${p.replyTo}`);
  console.log(`  subject     : ${p.subject}`);
  console.log("  " + "-".repeat(72));
  console.log(p.body.split("\n").map((l) => "  " + l).join("\n"));
  console.log("");
  if (r.subjectAlt) console.log(`  (alt subject: ${r.subjectAlt})\n`);
}

async function cmdApprove(records, id) {
  const r = find(records, id);
  const suppression = readJson(SUPPRESSION_PATH);
  const gate = canApprove(r, { suppression });
  if (!gate.ok) die(`cannot approve "${id}": ${gate.reason}`);

  if (bodyNeedsSnapshot(r.body)) {
    console.log(`\n  fetching live research snapshot for "${id}"...`);
    let snap;
    try {
      snap = await fetchSnapshot();
    } catch (err) {
      die(`snapshot fetch/parse failed - NOT approving: ${err.message}`);
    }
    r.snapshot = snap;
    console.log(`  frozen: ${JSON.stringify(snap)}`);
  }

  r.status = "APPROVED";
  r.approvedAt = now();
  writeJson(RECORDS_PATH, records);
  console.log(`\n  ✓ "${id}" is APPROVED. Review it with:  npm run outreach -- show ${id}`);
  console.log(`    then send with:  npm run outreach:send -- ${id}   (add --dry-run to preview only)\n`);
}

async function cmdSend(records, id, { dryRun, force }) {
  const r = find(records, id);
  const suppression = readJson(SUPPRESSION_PATH);

  if (!SENDABLE_CONTACT_TYPES.includes(r.contactType)) {
    die(`"${id}" is a ${r.contactType} record - it has no mail-provider send path. Post it by hand.`);
  }
  const gate = canSend(r, { records, suppression, dailyCap: CFG.dailyCap, override: force });
  if (!gate.ok) die(`cannot send "${id}": ${gate.reason}`);
  if (!dryRun && !PROVIDER.isConfigured()) {
    die(
      `no outreach provider configured (current: ${PROVIDER.name}). Set INSTANTLY_API_KEY and ` +
        `INSTANTLY_CAMPAIGN_ID. Cold outreach never uses Resend. Use --dry-run to preview.`
    );
  }

  const msg = renderMessage(r, {
    senderName: CFG.senderName,
    fromEmail: CFG.fromEmail,
    replyTo: CFG.replyTo,
    testRecipient: CFG.testRecipient,
  });

  if (dryRun) {
    console.log("\n  === DRY RUN - no provider call ===");
    console.log(`  to       : ${msg.to}`);
    console.log(`  from     : ${msg.from}`);
    console.log(`  reply-to : ${msg.replyTo}`);
    console.log(`  subject  : ${msg.subject}`);
    console.log("  " + "-".repeat(72));
    console.log(msg.text.split("\n").map((l) => "  " + l).join("\n"));
    console.log("");
    r.sendLog.push({ at: now(), kind: "dry-run", to: msg.to, redirectedToTest: msg.meta.redirectedToTest });
    writeJson(RECORDS_PATH, records);
    return;
  }

  console.log(
    `\n  submitting "${id}" to provider "${PROVIDER.name}" as a lead for ${msg.to}` +
      `${msg.meta.redirectedToTest ? " (TEST redirect)" : ""}...`
  );
  const res = await PROVIDER.submitLead(msg);

  const isTest = Boolean(msg.meta.redirectedToTest);

  if (res?.accepted) {
    // The lead was ACCEPTED into the campaign - this does NOT prove an
    // email was sent. A REAL submit lands on QUEUED; a later `sync`
    // promotes to SENT only on Instantly send evidence. A TEST submit
    // (OUTREACH_TEST_RECIPIENT redirect) went to the owner's own inbox,
    // NOT the prospect - the real record stays APPROVED and none of its
    // delivery fields (queuedAt / sentAt / providerRef) are touched.
    r.sendLog.push({
      at: now(),
      kind: isTest ? "test-submit" : "submit",
      provider: PROVIDER.name,
      to: msg.to,
      providerRef: res.id ?? null,
    });
    // A successful submission - test or real - supersedes any earlier
    // failed attempt, so the stale error is cleared either way.
    r.lastError = null;
    if (isTest) {
      // Test-safe outcome, kept OFF the real delivery fields.
      r.lastTest = { at: now(), ok: true, to: msg.to, provider: PROVIDER.name, providerRef: res.id ?? null };
    } else {
      r.status = "QUEUED";
      r.queuedAt = now();
      r.sentAt = null; // not sent yet - set only by `sync` on send evidence
      r.provider = PROVIDER.name;
      r.providerRef = res.id ?? null;
      r.providerMessageId = res.id ?? null; // back-compat alias
    }
    writeJson(RECORDS_PATH, records);
    console.log(
      `  ✓ ${isTest ? "TEST lead" : `"${id}"`} accepted by ${PROVIDER.name}` +
        `${res.id ? ` (lead ${res.id})` : ""}. Real record status: ${r.status}.`
    );
    if (isTest) {
      console.log(`    Test message went to ${msg.to}. The real prospect (${r.recipient}) was NOT contacted.\n`);
    } else {
      console.log(`    Instantly will send it on the campaign schedule. Confirm with:  npm run outreach -- sync ${id}\n`);
    }
  } else {
    const reason = res?.reason || "unknown";
    const detail = String(res?.detail ?? "").slice(0, 300);
    if (isTest) {
      // A failed TEST submission must NOT mark the real prospect FAILED
      // or imply the real recipient was contacted - store it test-safe.
      r.lastTest = { at: now(), ok: false, to: msg.to, provider: PROVIDER.name, reason, detail };
      r.sendLog.push({ at: now(), kind: "test-fail", provider: PROVIDER.name, to: msg.to, reason });
      writeJson(RECORDS_PATH, records);
      die(`TEST submission failed (${reason}). Real record left as ${r.status}; real prospect not contacted.`);
    }
    r.status = "FAILED";
    r.lastError = { at: now(), provider: PROVIDER.name, reason, detail };
    r.sendLog.push({ at: now(), kind: "fail", provider: PROVIDER.name, to: msg.to, reason });
    writeJson(RECORDS_PATH, records);
    die(`send failed (${reason}) - record marked FAILED, not retried automatically.`);
  }
}

function cmdSuppress(domain, reasonParts) {
  const suppression = readJson(SUPPRESSION_PATH);
  const d = String(domain || "").toLowerCase().trim();
  if (!d) die("usage: npm run outreach -- suppress <domain-or-email> [reason...]");
  if (isSuppressed(d, suppression)) return console.log(`\n  "${d}" is already suppressed.\n`);
  suppression.push({ domain: d, reason: reasonParts.join(" ") || "requested", addedAt: now() });
  writeJson(SUPPRESSION_PATH, suppression);
  console.log(`\n  ✓ suppressed "${d}". No outreach will send to it.\n`);
}

function cmdUnsuppress(domain) {
  const suppression = readJson(SUPPRESSION_PATH);
  const d = String(domain || "").toLowerCase().trim();
  const next = suppression.filter((s) => String(s.domain ?? s).toLowerCase().trim() !== d);
  if (next.length === suppression.length) return console.log(`\n  "${d}" was not suppressed.\n`);
  writeJson(SUPPRESSION_PATH, next);
  console.log(`\n  ✓ removed "${d}" from the suppression list.\n`);
}

function cmdMark(records, id, status) {
  const r = find(records, id);
  r.status = status;
  if (status === "REPLIED") r.repliedAt = now();
  writeJson(RECORDS_PATH, records);
  if (status === "DO_NOT_CONTACT") {
    cmdSuppress(r.recipient.includes("@") ? r.recipient : r.organisation, ["marked DO_NOT_CONTACT"]);
  }
  console.log(`\n  ✓ "${id}" -> ${status}\n`);
}

// Ask Instantly whether a QUEUED lead's campaign email has actually been
// sent, then promote QUEUED -> SENT / FAILED / DO_NOT_CONTACT accordingly.
// SENT is set ONLY on real Instantly send evidence
// (Lead.timestamp_last_contact / status_summary step-executed); until then
// the record stays QUEUED.
async function cmdSync(records, id) {
  const r = find(records, id);
  if (r.status !== "QUEUED") {
    return console.log(`\n  "${id}" is ${r.status}, not QUEUED - nothing to sync.\n`);
  }
  if (!r.providerRef) die(`"${id}" has no providerRef - was it ever submitted?`);
  if (!PROVIDER.isConfigured()) {
    die(`no outreach provider configured (${PROVIDER.name}) - cannot query Instantly. Set INSTANTLY_API_KEY.`);
  }
  console.log(`\n  querying ${PROVIDER.name} for lead ${r.providerRef}...`);
  const reading = await PROVIDER.getLeadStatus(r.providerRef);
  if (!reading?.ok) die(`sync failed: ${reading?.reason ?? "unknown"} ${reading?.detail ?? ""}`.trim());

  const { patch, note, suppress } = applySyncResult(r, reading, { now });
  if (patch) Object.assign(r, patch);
  r.sendLog.push({ at: now(), kind: "sync", provider: PROVIDER.name, reading, result: r.status });
  writeJson(RECORDS_PATH, records);
  if (suppress) cmdSuppress(r.recipient.includes("@") ? r.recipient : r.organisation, ["unsubscribed via Instantly"]);
  console.log(`  ${note}\n  status: ${r.status}${r.sentAt ? `  sentAt: ${r.sentAt}` : ""}\n`);
}

// --- dispatch --------------------------------------------------------

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = rest.filter((a) => !a.startsWith("--"));
  const flags = new Set(rest.filter((a) => a.startsWith("--")));
  const records = readJson(RECORDS_PATH);

  switch (cmd) {
    case "list":
    case undefined:
      return cmdList(records);
    case "show":
      return cmdShow(records, args[0]);
    case "approve":
      return cmdApprove(records, args[0]);
    case "send":
      return cmdSend(records, args[0], { dryRun: flags.has("--dry-run"), force: flags.has("--force") });
    case "sync":
      return cmdSync(records, args[0]);
    case "suppress":
      return cmdSuppress(args[0], args.slice(1));
    case "unsuppress":
      return cmdUnsuppress(args[0]);
    case "replied":
      return cmdMark(records, args[0], "REPLIED");
    case "dnc":
      return cmdMark(records, args[0], "DO_NOT_CONTACT");
    default:
      die(`unknown command "${cmd}". Commands: list, show, approve, send, sync, suppress, unsuppress, replied, dnc`);
  }
}

main().catch((err) => die(err.message));

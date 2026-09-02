// SEO Phase 10D - approval-gated manual outreach CLI.
//
//   npm run outreach:list
//   npm run outreach -- show <id>
//   npm run outreach:approve -- <id>
//   npm run outreach:send -- <id> [--dry-run]
//   npm run outreach -- suppress <domain> [reason...]
//   npm run outreach -- unsuppress <domain>
//   npm run outreach -- replied <id>        (mark a reply received)
//   npm run outreach -- dnc <id>            (mark DO_NOT_CONTACT + suppress)
//
// Runs LOCALLY, server-side, by the site owner. There is no deployed API,
// no background job, no follow-up automation, and no bulk import. Sending
// goes through the project's existing Resend wrapper (lib/email.js).
//
// Real sends require: status APPROVED  ->  an explicit `send` command.
// If OUTREACH_TEST_RECIPIENT is set, every send is redirected there and
// the subject is prefixed [TEST].

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import emailMod from "../lib/email.js";
import {
  canApprove,
  canSend,
  isSuppressed,
  sentInWindow,
  resolveBody,
  bodyNeedsSnapshot,
  DEFAULT_DAILY_CAP,
  SENDABLE_CONTACT_TYPES,
} from "../lib/outreach/core.js";
import { renderMessage } from "../lib/outreach/render.js";

const { sendEmail } = emailMod;
const HERE = dirname(fileURLToPath(import.meta.url));
const RECORDS_PATH = join(HERE, "..", "lib", "outreach", "records.json");
const SUPPRESSION_PATH = join(HERE, "..", "lib", "outreach", "suppression.json");
const RESEARCH_URL = "https://pokemondealfinder.com/market-data/pokemon-card-value-distribution";

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
const now = () => new Date().toISOString();

const CFG = {
  fromEmail: process.env.OUTREACH_FROM_EMAIL || process.env.ALERT_FROM_EMAIL || null,
  replyTo:
    process.env.OUTREACH_REPLY_TO ||
    process.env.OUTREACH_FROM_EMAIL ||
    process.env.ALERT_FROM_EMAIL ||
    null,
  senderName: process.env.OUTREACH_SENDER_NAME || "James",
  testRecipient: process.env.OUTREACH_TEST_RECIPIENT || null,
  dailyCap: Number(process.env.OUTREACH_DAILY_CAP || DEFAULT_DAILY_CAP),
};

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
  const inWin = sentInWindow(records);
  console.log("");
  console.log(`  sent in last 24h: ${inWin} / cap ${CFG.dailyCap}`);
  console.log(
    `  mail from: ${CFG.fromEmail ?? "(not configured - set OUTREACH_FROM_EMAIL or ALERT_FROM_EMAIL)"}` +
      (CFG.testRecipient ? `   TEST MODE -> ${CFG.testRecipient}` : "")
  );
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
  if (r.snapshot) console.log(`  snapshot    : ${JSON.stringify(r.snapshot)}`);
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
  if (!CFG.fromEmail) die("no from address - set OUTREACH_FROM_EMAIL (or ALERT_FROM_EMAIL) to an address authorised in Resend");

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

  console.log(`\n  sending "${id}" to ${msg.to}${msg.meta.redirectedToTest ? " (TEST redirect)" : ""}...`);
  const res = await sendEmail({
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    replyTo: msg.replyTo,
  });

  if (res?.sent) {
    // A real (non-test) delivery advances the record; a test delivery is
    // logged but the record stays APPROVED so the real send can follow.
    r.sendLog.push({
      at: now(),
      kind: msg.meta.redirectedToTest ? "test-send" : "send",
      to: msg.to,
      providerMessageId: res.id ?? null,
    });
    if (!msg.meta.redirectedToTest) {
      r.status = "SENT";
      r.sentAt = now();
      r.providerMessageId = res.id ?? null;
      r.lastError = null;
    }
    writeJson(RECORDS_PATH, records);
    console.log(`  ✓ ${msg.meta.redirectedToTest ? "test message" : `"${id}"`} delivered${res.id ? ` (id ${res.id})` : ""}.\n`);
  } else {
    const reason = res?.reason || "unknown";
    r.status = "FAILED";
    r.lastError = { at: now(), reason, detail: String(res?.detail ?? "").slice(0, 300) };
    r.sendLog.push({ at: now(), kind: "fail", to: msg.to, reason });
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
    case "suppress":
      return cmdSuppress(args[0], args.slice(1));
    case "unsuppress":
      return cmdUnsuppress(args[0]);
    case "replied":
      return cmdMark(records, args[0], "REPLIED");
    case "dnc":
      return cmdMark(records, args[0], "DO_NOT_CONTACT");
    default:
      die(`unknown command "${cmd}". Commands: list, show, approve, send, suppress, unsuppress, replied, dnc`);
  }
}

main().catch((err) => die(err.message));

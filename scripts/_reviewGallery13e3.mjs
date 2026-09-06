// Phase 13E.3 HUMAN REVIEW GATE - builds ONE local review page that puts
// everything a human needs in front of them:
//   Part A - the final rendered creatives for the 4 families (read-only)
//   Part B - the 13 OpenAI backgrounds (10 sample + 3 auction_watch probe)
//            with the canonical 5-check QA UI + APPROVE / REJECT
//
// This script GENERATES NOTHING and APPROVES NOTHING. The page's
// APPROVE / REJECT buttons only record the human's choice in the
// browser's localStorage and then print the EXACT CLI command to make it
// real. The manifest is never touched here.
//
//   node scripts/_reviewGallery13e3.mjs   ->  .social-preview/13e3-review.html

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { QA_CHECKS } from "../lib/social/assets.mjs";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, ".social-preview");
const OUT = path.join(OUT_DIR, "13e3-review.html");
const RENDERS = path.join(OUT_DIR, "13e3");
mkdirSync(OUT_DIR, { recursive: true });

const manifest = JSON.parse(readFileSync(path.join(ROOT, "assets/social/generated/social-assets.json"), "utf8"));
const generated = manifest.assets.filter((a) => a.status === "generated");
const sample = generated.filter((a) => a.sample);
const probes = generated.filter((a) => !a.sample);

// paths are relative to .social-preview/
const bgSrc = (a) => `../assets/social/generated/${a.category}/${a.id}.png`;
const renderSrc = (name) => `13e3/${name}`;

// ---- Part A: final creatives, grouped by family -----------------------
const FAMILIES = [
  {
    key: "deal_drop", label: "1 · Deal Drop", purpose: "One qualified click to a genuine live under-market listing.",
    shots: [
      ["dealdrop_blastoise_A.png", "Blastoise (Base Shadowless) · raw · high price · variant A (hero split)"],
      ["dealdrop_blastoise_B.png", "Blastoise · variant B (product stack)"],
      ["dealdrop_lugia-psa9_A.png", "Lugia · PSA 9 · variant A"],
      ["dealdrop_lugia-psa9_B.png", "Lugia · PSA 9 · variant B"],
      ["dealdrop_raichu_A.png", "Raichu (Radiant Collection) · short name · large saving · variant A"],
      ["dealdrop_zekrom-long_A.png", "Zekrom (115 Full Art Secret Rare) · long name · variant A"],
      ["dealdrop_wigglytuff-gb_A.png", "Wigglytuff (Skyridge) · non-US marketplace (GB) · variant A"],
    ],
  },
  {
    key: "market_mover", label: "2 · Market Mover", purpose: "One real card's real price movement over a stated window. No confident trend -> no chart.",
    shots: [
      ["mover_raichu_A.png", "Raichu · +142% over 12 months · real price-history chart · variant A"],
      ["mover_pikachu-zekrom-gx_A.png", "Pikachu & Zekrom GX · +17% over 12 months · variant A"],
      ["mover_wigglytuff_A.png", "Wigglytuff · +17% over 90 days · variant A"],
      ["mover_raichu_B.png", "Raichu · variant B (stack)"],
    ],
  },
  {
    key: "hook_carousel", label: "3 · Hook Carousel", purpose: "Stop scroll on slide 1, earn swipes, close on the brand + CTA. Deterministic cover -> per-deal slides -> close.",
    shots: [
      ["carousel_1_cover.png", "Slide 1 · cover / hook"],
      ["carousel_2_card.png", "Slide 2 · card"],
      ["carousel_3_card.png", "Slide 3 · card"],
      ["carousel_4_card.png", "Slide 4 · card"],
      ["carousel_5_card.png", "Slide 5 · card"],
      ["carousel_6_close.png", "Slide 6 · close (PokemonDealFinder + CTA)"],
    ],
  },
  {
    key: "brand_ad", label: "4 · Brand / Conversion Ad", purpose: "Explain PokemonDealFinder fast. Version D - real pokemondealfinder.com screenshot in a deterministic frame.",
    shots: [["brandad_A.png", "STOP OVERPAYING FOR POKEMON CARDS · real site screenshot"]],
  },
];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const familyBlocks = FAMILIES.map((fam) => {
  const shots = fam.shots
    .filter(([f]) => existsSync(path.join(RENDERS, f)))
    .map(
      ([f, cap]) => `
      <figure class="shot">
        <a href="${renderSrc(f)}" target="_blank"><img loading="lazy" src="${renderSrc(f)}" alt="${esc(cap)}"></a>
        <figcaption>${esc(cap)}</figcaption>
      </figure>`
    )
    .join("");
  return `
    <section class="fam">
      <h3>${esc(fam.label)}</h3>
      <p class="purpose">${esc(fam.purpose)}</p>
      <div class="shots">${shots || "<p><em>no renders found — run <code>node scripts/_renderSocial13e3.mjs</code></em></p>"}</div>
    </section>`;
}).join("");

// ---- Part B: OpenAI backgrounds with the 5-check QA UI ----------------
function bgCard(a) {
  const cli = `npm run social:assets -- qa ${a.id} ${QA_CHECKS.map((c) => c + "=PASS").join(" ")}\nnpm run social:assets -- approve ${a.id}`;
  const cliReject = `npm run social:assets -- reject ${a.id}`;
  return `
    <div class="bg" data-id="${esc(a.id)}">
      <a href="${bgSrc(a)}" target="_blank"><img loading="lazy" src="${bgSrc(a)}" alt="${esc(a.id)}"></a>
      <div class="meta">
        <div class="idrow"><strong>${esc(a.id)}</strong> <span class="badge">status: ${esc(a.status)}</span></div>
        <dl>
          <div><dt>Family</dt><dd>${esc(a.category)}</dd></div>
          <div><dt>Variant</dt><dd>${esc(a.variant)}</dd></div>
          <div><dt>Style / zone</dt><dd>${esc(a.style)} · ${esc(a.zone)}</dd></div>
          <div><dt>Spec</dt><dd>${esc(a.prompt_spec_version)}</dd></div>
        </dl>
        <div class="checks">
          ${QA_CHECKS.map(
            (c) => `<div class="check" data-check="${c}">
              <span class="cl">${c.replace(/_/g, " ")}</span>
              <button type="button" data-v="PASS">PASS</button>
              <button type="button" data-v="REJECT">REJECT</button>
            </div>`
          ).join("")}
        </div>
        <div class="decide">
          <button type="button" class="approve" disabled>APPROVE (local)</button>
          <button type="button" class="reject">REJECT (local)</button>
          <span class="dstate">undecided</span>
        </div>
        <details class="cli"><summary>CLI to make it real</summary>
          <p>Approve (only after all 5 checks are PASS):</p><pre>${esc(cli)}</pre>
          <p>Reject &amp; queue a re-roll:</p><pre>${esc(cliReject)}</pre>
        </details>
      </div>
    </div>`;
}

const sampleBlock = sample.map(bgCard).join("");
const probeBlock = probes.map(bgCard).join("");

const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PokemonDealFinder — 13E.3 Human Review Gate</title>
<style>
  :root{--bg:#0b0b0d;--panel:#161619;--hair:#2a2a31;--ink:#fafafa;--sub:#b4b4bd;--faint:#8a8a94;--red:#f0322e;--green:#3fcf8e}
  *{box-sizing:border-box} body{margin:0;padding:28px;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,'Segoe UI',Roboto,sans-serif;max-width:1240px}
  h1{font-size:24px;margin:0 0 4px} h2{font-size:17px;margin:34px 0 6px;border-bottom:1px solid var(--hair);padding-bottom:6px}
  h3{font-size:15px;margin:20px 0 2px} .purpose{color:var(--faint);font-size:13px;margin:0 0 10px}
  .note{color:var(--faint);font-size:13px} code{background:var(--panel);padding:2px 6px;border-radius:4px;font-size:12px}
  pre{background:#000;border:1px solid var(--hair);border-radius:8px;padding:12px;font-size:12px;overflow:auto;color:var(--sub)}
  .banner{background:var(--panel);border:1px solid var(--hair);border-radius:12px;padding:14px 18px;margin-bottom:8px}
  .banner strong{color:var(--red)}
  .shots{display:flex;flex-wrap:wrap;gap:14px} .shot{margin:0;width:210px}
  .shot img{width:210px;height:262px;object-fit:cover;border-radius:10px;border:1px solid var(--hair);display:block;background:#000}
  .shot figcaption{font-size:11px;color:var(--faint);margin-top:5px;line-height:1.3}
  .bggrid{display:flex;flex-direction:column;gap:16px}
  .bg{display:flex;gap:18px;background:var(--panel);border:1px solid var(--hair);border-radius:12px;padding:14px}
  .bg img{width:220px;height:330px;object-fit:contain;border-radius:8px;border:1px solid var(--hair);background:#000;flex:none}
  .meta{flex:1;min-width:0}
  .idrow{font-size:15px;margin-bottom:8px} .badge{color:var(--faint);font-size:12px;font-weight:400;margin-left:8px}
  dl{display:grid;grid-template-columns:1fr 1fr;gap:2px 20px;margin:0 0 12px}
  dl div{display:flex;gap:8px;font-size:12px} dt{color:var(--faint)} dd{margin:0;color:var(--sub)}
  .checks{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}
  .check{display:flex;align-items:center;gap:8px;font-size:12px}
  .check .cl{flex:1;text-transform:uppercase;letter-spacing:.04em;color:var(--sub)}
  .check button,.decide button{border:1px solid var(--hair);background:#000;color:var(--sub);border-radius:6px;padding:5px 12px;font-size:11px;font-weight:800;cursor:pointer;letter-spacing:.03em}
  .check button.on[data-v="PASS"]{background:var(--green);color:#000;border-color:var(--green)}
  .check button.on[data-v="REJECT"]{background:var(--red);color:#fff;border-color:var(--red)}
  .decide{display:flex;align-items:center;gap:10px;margin-top:6px;padding-top:10px;border-top:1px dashed var(--hair)}
  .decide .approve{background:#000;border-color:var(--green);color:var(--green)}
  .decide .approve:disabled{opacity:.35;cursor:not-allowed;border-color:var(--hair);color:var(--faint)}
  .decide .approve.on{background:var(--green);color:#000}
  .decide .reject.on{background:var(--red);color:#fff;border-color:var(--red)}
  .dstate{font-size:12px;color:var(--faint)}
  details.cli{margin-top:10px} details.cli summary{cursor:pointer;font-size:12px;color:var(--faint)}
  details.cli p{font-size:12px;color:var(--sub);margin:8px 0 4px}
  a{color:var(--ink)}
</style></head><body>
<h1>PokemonDealFinder — Phase 13E.3 Human Review Gate</h1>
<p class="note">Generated ${new Date().toISOString()} · manifest counts ${esc(JSON.stringify(manifest.counts))}</p>

<div class="banner">
  <strong>REVIEW ONLY.</strong> Nothing on this page generates, approves, publishes, or changes any file.
  The PASS / REJECT / APPROVE buttons record your choice in this browser only. To make an approval real, run the
  CLI shown under each background. <code>publishing</code> stays <code>DISABLED</code>.
</div>
<div class="banner note">
  <strong style="color:var(--ink)">How to review a background:</strong> open the full image (click it), judge each of the 5 checks
  (PASS / REJECT), then — only if all 5 are PASS — the <em>APPROVE (local)</em> button enables. Approving locally reveals the exact
  two-line CLI to run. A REJECT queues a re-roll (<code>reject</code> then <code>generate --family &lt;cat&gt; --force</code>).
  Design of the final creatives (Part A) is <em>not</em> up for approval here — just look them over.
</div>

<h2>Part A — Final creatives (read-only)</h2>
<p class="note">The four families rendered with real, currently-valid production fixtures. Click any image for full size.</p>
${familyBlocks}

<h2>Part B — OpenAI sample backgrounds (10) — QA + APPROVE / REJECT</h2>
<p class="note">Evergreen, data-free Layer-1 backgrounds. The deterministic renderer overlays every real fact on top; the model saw none of them.</p>
<div class="bggrid">${sampleBlock}</div>

<h2>Part B — auction_watch probe backgrounds (3)</h2>
<p class="note">The original 13E.2.1 probes, kept on disk (not tracked). <code>__B</code> was re-rolled once during 13E.3.</p>
<div class="bggrid">${probeBlock}</div>

<script>
(function(){
  function load(k){try{return JSON.parse(localStorage.getItem(k)||"{}")}catch(e){return {}}}
  function save(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  var CHECKS = ${JSON.stringify(QA_CHECKS)};
  document.querySelectorAll(".bg").forEach(function(card){
    var id = card.getAttribute("data-id");
    var key = "pdf-13e3-bg-review::"+id;
    var state = load(key);
    var approveBtn = card.querySelector(".decide .approve");
    var rejectBtn = card.querySelector(".decide .reject");
    var dstate = card.querySelector(".dstate");
    function paint(){
      card.querySelectorAll(".check").forEach(function(row){
        var name = row.getAttribute("data-check");
        row.querySelectorAll("button").forEach(function(b){
          b.classList.toggle("on", state[name] === b.getAttribute("data-v"));
        });
      });
      var allPass = CHECKS.every(function(c){return state[c]==="PASS"});
      approveBtn.disabled = !allPass;
      approveBtn.classList.toggle("on", state.decision==="approve");
      rejectBtn.classList.toggle("on", state.decision==="reject");
      dstate.textContent = state.decision==="approve" ? "APPROVED (local) — now run the CLI below"
        : state.decision==="reject" ? "REJECTED (local) — run the reject CLI below"
        : allPass ? "all checks PASS — you may approve" : "undecided";
    }
    card.querySelectorAll(".check button").forEach(function(b){
      b.addEventListener("click", function(){
        var name = b.closest(".check").getAttribute("data-check");
        state[name] = b.getAttribute("data-v");
        if(!CHECKS.every(function(c){return state[c]==="PASS"}) && state.decision==="approve") delete state.decision;
        save(key,state); paint();
      });
    });
    approveBtn.addEventListener("click", function(){
      if(approveBtn.disabled) return;
      state.decision = state.decision==="approve" ? undefined : "approve";
      save(key,state); paint();
      var d = card.querySelector("details.cli"); if(state.decision==="approve" && d) d.open = true;
    });
    rejectBtn.addEventListener("click", function(){
      state.decision = state.decision==="reject" ? undefined : "reject";
      save(key,state); paint();
      var d = card.querySelector("details.cli"); if(state.decision==="reject" && d) d.open = true;
    });
    paint();
  });
})();
</script>
</body></html>`;

writeFileSync(OUT, html, "utf8");
console.log("Review page written:\n  " + OUT);
console.log("\nOpen it in your browser:\n  file:///" + OUT.replace(/\\\\/g, "/").replace(/\\/g, "/"));
console.log("\nBackgrounds: " + sample.length + " sample + " + probes.length + " probe = " + generated.length);
console.log("Final creatives: " + FAMILIES.reduce((n,f)=>n+f.shots.length,0) + " shots across 4 families");

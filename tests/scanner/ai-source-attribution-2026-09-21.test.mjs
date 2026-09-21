// 2026-09-21 GEO audit. traffic_source already recognised AI assistants,
// but collapsed every one of them into "ai_assistant" - so "which AI
// systems send visitors who go on to click a listing" was unanswerable.
//
// ai_source names the assistant from a fixed vocabulary. It must never
// widen what is collected: no hosts, no URLs, no free text, and nothing
// at all on non-assistant traffic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aiAssistantSource, classifyTrafficSource } from "../../lib/analytics/props.js";

test("names the assistant from a referrer", () => {
  const cases = [
    ["https://chatgpt.com/c/abc123", "chatgpt"],
    ["https://www.perplexity.ai/search/xyz", "perplexity"],
    ["https://gemini.google.com/app", "gemini"],
    ["https://copilot.microsoft.com/chats/1", "copilot"],
    ["https://claude.ai/chat/1", "claude"],
  ];
  for (const [referrer, want] of cases) assert.equal(aiAssistantSource({ referrer }), want, referrer);
});

test("names the assistant from utm_source, which is how ChatGPT arrives", () => {
  // ChatGPT appends ?utm_source=chatgpt.com and usually sends no referrer.
  assert.equal(aiAssistantSource({ referrer: "", utmSource: "chatgpt.com" }), "chatgpt");
  assert.equal(aiAssistantSource({ referrer: "", utmSource: "openai" }), "chatgpt");
  assert.equal(aiAssistantSource({ referrer: "", utmSource: "Perplexity" }), "perplexity");
});

test("returns null rather than guessing", () => {
  for (const referrer of ["https://www.google.com/", "https://example.com/", "not a url", ""]) {
    assert.equal(aiAssistantSource({ referrer }), null, referrer);
  }
  assert.equal(aiAssistantSource({ referrer: "", utmSource: "newsletter" }), null);
  assert.equal(aiAssistantSource({}), null);
});

test("the vocabulary is fixed - never a host, a URL or free text", () => {
  const values = new Set();
  for (const referrer of [
    "https://chatgpt.com/x",
    "https://www.perplexity.ai/y",
    "https://gemini.google.com/z",
    "https://copilot.microsoft.com/a",
    "https://claude.ai/b",
  ]) {
    values.add(aiAssistantSource({ referrer }));
  }
  assert.deepEqual([...values].sort(), ["chatgpt", "claude", "copilot", "gemini", "perplexity"]);
  for (const v of values) {
    assert.match(v, /^[a-z]+$/, "lower-case single token only");
    assert.ok(!v.includes("."), "never a host");
    assert.ok(!v.includes("/"), "never a URL");
  }
});

test("the existing traffic_source categories are unchanged", () => {
  // The new property is additive. If this drifts, existing reporting and
  // the cookieless posture both change meaning.
  assert.equal(classifyTrafficSource({ referrer: "https://chatgpt.com/x" }), "ai_assistant");
  assert.equal(classifyTrafficSource({ referrer: "https://www.google.com/" }), "organic_search");
  assert.equal(classifyTrafficSource({ referrer: "" }), "direct");
  assert.equal(classifyTrafficSource({ referrer: "https://gemini.google.com/app" }), "ai_assistant");
});

test("ai_source is attached only to assistant traffic", () => {
  const src = readFileSync(new URL("../../lib/analytics/session.js", import.meta.url), "utf8");
  assert.match(src, /traffic_source === "ai_assistant" \? aiAssistantSource/, "gated on the category");
  assert.match(src, /\.\.\.\(ai_source \? \{ ai_source \} : \{\}\)/, "omitted entirely when absent");
});

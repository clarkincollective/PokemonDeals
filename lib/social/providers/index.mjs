// Phase 13E.5A - social provider selection.
//
// Default (nothing configured) = nullProvider: refuses every call. This
// is the safety floor - with no BUFFER_ACCESS_TOKEN in the environment,
// the distribution layer has NO code path that can reach a social
// network, exactly like lib/outreach/provider.js's null provider.

import { bufferProvider } from "./buffer.mjs";

const nullProvider = {
  name: "none",
  isConfigured: () => false,
  async listChannels() {
    return { ok: false, reason: "no_social_provider_configured", detail: "Set BUFFER_ACCESS_TOKEN (see docs/social-distribution.md)." };
  },
  async createPost() {
    return { accepted: false, reason: "no_social_provider_configured", detail: "Set BUFFER_ACCESS_TOKEN. This tool never posts without an explicitly configured provider." };
  },
  async getPostStatus() {
    return { ok: false, reason: "no_social_provider_configured" };
  },
};

export function getSocialProvider(env = process.env) {
  const buf = bufferProvider(env);
  if (buf.isConfigured()) return buf;
  return nullProvider;
}

export const _providers = { nullProvider, bufferProvider };

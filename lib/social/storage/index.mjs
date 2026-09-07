// Phase 13E.5C - social asset STORAGE provider selection.
//
// Provider-neutral, same pattern as lib/social/providers/index.mjs. The
// renderer is NEVER coupled to storage - only the hosting layer
// (hostedAssets.mjs / the CLI `host` command) touches this.
//
// Default (nothing configured) = nullStorage: refuses every call.

import { supabaseStorage } from "./supabase.mjs";

const nullStorage = {
  name: "none",
  isConfigured: () => false,
  publicUrlFor: () => null,
  async upload() {
    return { ok: false, reason: "no_storage_provider_configured", detail: "Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (already present in this project)." };
  },
  async head() {
    return { ok: false, status: 0, reason: "no_storage_provider_configured" };
  },
  async probeRange() {
    return { ok: false, status: 0, reason: "no_storage_provider_configured" };
  },
  async listKeys() {
    return { ok: false, reason: "no_storage_provider_configured" };
  },
  async remove() {
    return { ok: false, reason: "no_storage_provider_configured" };
  },
};

export function getStorageProvider(env = process.env) {
  const s = supabaseStorage(env);
  return s.isConfigured() ? s : nullStorage;
}

export const _storage = { nullStorage, supabaseStorage };

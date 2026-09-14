import { register } from "node:module";

register("./hooks.mjs", import.meta.url);

// Provider-disabled: any outbound network attempt is a harness failure.
globalThis.fetch = async (url) => {
  throw new Error(`ingestion harness: network disabled (attempted ${String(url)})`);
};

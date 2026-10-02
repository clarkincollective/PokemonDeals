// 2 Oct 2026 - this PC's router/ISP DNS resolver cannot resolve the
// Supabase hostname (confirmed: Google's and Cloudflare's public DNS
// resolve it fine; the router's own forwarder returns "Server failed"
// for that one name, flushing the local cache did not help). Every
// outbound fetch() on this machine goes through Node's default resolver
// (dns.lookup -> OS getaddrinfo), which is the broken one - dns.setServers()
// does NOT affect dns.lookup(), only dns.resolve*(), so the OS-level
// resolver has to be bypassed at the HTTP layer instead.
//
// Import this (or --import it) FIRST, before any other module that might
// fetch() anything, in every Node entry point that runs on this PC:
// scripts/crons/runJob.mjs (via register.mjs), scripts/boards/captureJimmy.mjs,
// scripts/visual/screenLocal.mjs, scripts/crons/health.mjs. A global
// undici dispatcher with a custom `connect.lookup` affects Node's
// built-in global fetch() too (same dispatcher registry) - no admin
// rights, no OS/network setting touched, fully reversible by deleting
// this file and its imports once the router/ISP issue is actually fixed.
import { Agent, setGlobalDispatcher } from "undici";
import dns from "node:dns";

const resolver = new dns.Resolver();
resolver.setServers(["8.8.8.8", "1.1.1.1"]);

function publicDnsLookup(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  resolver.resolve4(hostname, (err4, addrs4 = []) => {
    resolver.resolve6(hostname, (err6, addrs6 = []) => {
      const all = [...addrs4.map((address) => ({ address, family: 4 })), ...addrs6.map((address) => ({ address, family: 6 }))];
      if (!all.length) return callback(err4 || err6 || new Error(`publicDnsLookup: no addresses for ${hostname}`));
      if (options.all) return callback(null, all);
      callback(null, all[0].address, all[0].family);
    });
  });
}

setGlobalDispatcher(new Agent({ connect: { lookup: publicDnsLookup } }));

const { createClient } = require("@supabase/supabase-js");

// The "service role" key can write to the database and bypasses row-level
// security - this must only ever be imported by server-side code (API
// routes, scripts), never anything that ships to the browser.
function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

module.exports = { supabaseAdmin };

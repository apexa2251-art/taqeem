import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createStaffHandler } from "./handler.js";
const url = Deno.env.get("SUPABASE_URL") || "";
const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const serviceKey = keys.default || legacyKey;
Deno.serve(
  createStaffHandler({
    createAdmin: () =>
      createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    serviceKey,
    serviceKeys: [...Object.values(keys), legacyKey],
    appOrigin: "https://taqeem-6ohq.onrender.com",
  }),
);

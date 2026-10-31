import { createClient } from "@supabase/supabase-js";
const { SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_EMAIL, ADMIN_NAME } =
  process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !ADMIN_EMAIL || !ADMIN_NAME)
  throw Error(
    "Set SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_EMAIL and ADMIN_NAME locally.",
  );
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
let user = null;
for (let page = 1; page <= 100; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw error;
  user = data.users.find(
    (u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
  );
  if (user || data.users.length < 100) break;
}
if (!user)
  throw Error(
    "Create and confirm this Auth user in Supabase first. No account or email was created by this script.",
  );
const result = await db
  .from("profiles")
  .upsert({
    id: user.id,
    full_name: ADMIN_NAME,
    system_admin: true,
    active: true,
  });
if (result.error) throw result.error;
console.log("Administrator profile provisioned. No secret was printed.");

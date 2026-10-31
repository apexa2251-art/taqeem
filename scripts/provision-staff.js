import { createClient } from "@supabase/supabase-js";
const {
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  STAFF_EMAIL,
  STAFF_NAME,
  STAFF_BRANCH,
  STAFF_ROLE = "operator",
} = process.env;
if (
  !SUPABASE_URL ||
  !SUPABASE_SECRET_KEY ||
  !STAFF_EMAIL ||
  !STAFF_NAME ||
  !["buraydah", "unayzah"].includes(STAFF_BRANCH) ||
  !["operator", "reviewer", "branch_admin", "viewer"].includes(STAFF_ROLE)
)
  throw Error(
    "Set SUPABASE_URL, SUPABASE_SECRET_KEY, STAFF_EMAIL, STAFF_NAME, STAFF_BRANCH and optional STAFF_ROLE.",
  );
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
let user;
for (let page = 1; page <= 100; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw error;
  user = data.users.find(
    (u) => u.email?.toLowerCase() === STAFF_EMAIL.toLowerCase(),
  );
  if (user || data.users.length < 100) break;
}
if (!user) throw Error("Create and confirm this Auth user in Supabase first.");
const existing = await db
  .from("profiles")
  .select("id")
  .eq("id", user.id)
  .maybeSingle();
if (existing.error) throw existing.error;
if (!existing.data) {
  const r = await db
    .from("profiles")
    .insert({ id: user.id, full_name: STAFF_NAME });
  if (r.error) throw r.error;
}
const r = await db
  .from("memberships")
  .upsert({ user_id: user.id, branch_id: STAFF_BRANCH, role: STAFF_ROLE });
if (r.error) throw r.error;
console.log("Staff branch membership provisioned.");

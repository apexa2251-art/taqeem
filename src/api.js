import { createClient } from "@supabase/supabase-js";
export let supabase;
export async function configure() {
  const r = await fetch("/api/config");
  if (!r.ok) throw new Error("SETUP_REQUIRED");
  const c = await r.json();
  if (c.url && c.key)
    supabase = createClient(c.url, c.key, {
      auth: {
        persistSession: true,
        storage: window.sessionStorage,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  return !!supabase;
}
export async function api(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const r = await fetch("/api" + path, {
    ...options,
    headers: {
      ...(options.body instanceof File
        ? { "Content-Type": options.body.type }
        : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${data.session?.access_token || ""}`,
      ...options.headers,
    },
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || "REQUEST_FAILED");
  return body;
}
export function action(op, branch, input) {
  return api("/action", {
    method: "POST",
    body: JSON.stringify({ op, branch, input }),
  });
}

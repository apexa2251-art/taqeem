export function isRecoveryLocation(location) {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(location.search || "");
  return (
    location.pathname === "/reset-password" ||
    hash.get("type") === "recovery" ||
    query.has("code") ||
    hash.has("error_code")
  );
}

// Subscribe before getSession: initialization can emit PASSWORD_RECOVERY
// while getSession is waiting for the callback code to be exchanged.
export async function initializeAuth(client, handlers) {
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event, session) => {
    handlers.session(session);
    if (event === "PASSWORD_RECOVERY") handlers.recovery();
  });
  handlers.subscription(subscription);
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  handlers.session(data.session);
}

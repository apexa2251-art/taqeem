import test from "node:test";
import assert from "node:assert/strict";
import {
  initializeAuth,
  isRecoveryLocation,
  recoveryFailure,
} from "../src/auth.js";

test("recovery listener catches initialization before getSession resolves", async () => {
  let listener,
    recovered = false,
    subscription;
  const session = { user: { id: "test-user" } };
  const sessions = [];
  await initializeAuth(
    {
      auth: {
        onAuthStateChange(callback) {
          listener = callback;
          return { data: { subscription: { unsubscribe() {} } } };
        },
        async getSession() {
          listener("PASSWORD_RECOVERY", session);
          return { data: { session }, error: null };
        },
      },
    },
    {
      session: (value) => sessions.push(value),
      recovery: () => {
        recovered = true;
      },
      subscription: (value) => {
        subscription = value;
      },
    },
  );
  assert.equal(recovered, true);
  assert.equal(sessions.at(-1), session);
  assert.ok(subscription);
});

test("dedicated recovery page stays in recovery mode across reloads", () => {
  assert.equal(
    isRecoveryLocation({ pathname: "/reset-password", hash: "" }),
    true,
  );
  assert.equal(
    isRecoveryLocation({ pathname: "/", hash: "#type=recovery" }),
    true,
  );
  assert.equal(
    isRecoveryLocation({ pathname: "/", hash: "", search: "?code=test-code" }),
    true,
  );
  assert.equal(
    isRecoveryLocation({ pathname: "/", hash: "#error_code=otp_expired" }),
    true,
  );
  assert.equal(isRecoveryLocation({ pathname: "/", hash: "" }), false);
});

test("invalid callback sessions are surfaced instead of silently showing sign-in", async () => {
  await assert.rejects(
    initializeAuth(
      {
        auth: {
          onAuthStateChange() {
            return { data: { subscription: { unsubscribe() {} } } };
          },
          async getSession() {
            return {
              data: { session: null },
              error: new Error("Invalid verifier"),
            };
          },
        },
      },
      { session() {}, recovery() {}, subscription() {} },
    ),
    /Invalid verifier/,
  );
});

test("quota failures state that no new recovery email was sent", () => {
  const result = recoveryFailure({
    code: "over_email_send_rate_limit",
    status: 429,
  });
  assert.equal(result.retryMs, 3600000);
  assert.match(result.text[0], /لم تُرسل رسالة جديدة/);
  assert.equal(recoveryFailure({ status: 429 }).retryMs, 60000);
  assert.equal(recoveryFailure({ message: "Network unavailable" }).retryMs, 0);
});

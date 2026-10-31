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

export function recoveryFailure(error) {
  if (
    error.code === "over_email_send_rate_limit" ||
    /email rate limit exceeded/i.test(error.message || "")
  ) {
    return {
      retryMs: 3600000,
      text: [
        "بلغت خدمة البريد حد إرسال رسائل الاستعادة. لم تُرسل رسالة جديدة. انتظر نحو ساعة ثم اطلب رابطًا واحدًا جديدًا؛ لا تستخدم الرسائل السابقة.",
        "The email service has reached its sending limit. No new email was sent. Wait about one hour, then request one new link; do not reuse older emails.",
      ],
    };
  }
  if (error.status === 429)
    return {
      retryMs: 60000,
      text: [
        "طلبات الاستعادة متقاربة. لم تُرسل رسالة جديدة؛ انتظر دقيقة قبل المحاولة مرة أخرى.",
        "Recovery requests are too frequent. No new email was sent; wait one minute before retrying.",
      ],
    };
  return {
    retryMs: 0,
    text: [
      "تعذر إرسال رسالة الاستعادة. تحقق من البريد والاتصال ثم حاول لاحقًا.",
      "The recovery email could not be sent. Check your email address and connection, then try again later.",
    ],
  };
}

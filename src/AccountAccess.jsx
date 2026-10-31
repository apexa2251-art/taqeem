import React, { useState } from "react";
import { staffAction, supabase } from "./api";
function PasswordFields({ t }) {
  return (
    <>
      <label>
        {t(
          "كلمة المرور الجديدة (12 حرفًا على الأقل)",
          "New password (at least 12 characters)",
        )}
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
      </label>
      <label>
        {t("تأكيد كلمة المرور", "Confirm password")}
        <input
          type="password"
          name="confirm_password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          onInput={(e) => e.currentTarget.setCustomValidity("")}
        />
      </label>
    </>
  );
}
function values(form, t) {
  const input = Object.fromEntries(new FormData(form));
  if (input.password !== input.confirm_password) {
    form.elements.confirm_password.setCustomValidity(
      t("كلمتا المرور غير متطابقتين.", "Passwords do not match."),
    );
    form.elements.confirm_password.reportValidity();
    return null;
  }
  delete input.confirm_password;
  return input;
}
export function StaffAccessPanel({
  t,
  branch,
  branches,
  profiles,
  run,
  loading,
  roleName,
  ownId,
}) {
  return (
    <>
      <section className="panel">
        <h2>
          {t(
            "إنشاء حساب موظف — دون بريد تأكيد",
            "Create a staff account — no confirmation email",
          )}
        </h2>
        <p className="hint">
          {t(
            "اختر الفرع والدور، وأدخل كلمة مرور تسلّمها للموظف مباشرة. يستطيع الموظف تغييرها من تبويب المستخدمون.",
            "Choose a branch and role, then provide the password directly to the staff member. Staff can change it from the Users tab.",
          )}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const input = values(form, t);
            if (input)
              run(async () => {
                await staffAction({ op: "create", ...input });
                form.reset();
              });
          }}
        >
          <div className="fields">
            <label>
              {t("الاسم الكامل", "Full name")}
              <input name="full_name" minLength={2} maxLength={100} required />
            </label>
            <label>
              {t("البريد المستخدم للدخول", "Sign-in email")}
              <input
                name="email"
                type="email"
                autoComplete="off"
                required
                dir="ltr"
              />
            </label>
            <label>
              {t("الفرع", "Branch")}
              <select name="branch_id" defaultValue={branch} required>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {t(b.name_ar, b.name_en)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("الدور", "Role")}
              <select name="role">
                {["operator", "reviewer", "branch_admin", "viewer"].map((r) => (
                  <option key={r} value={r}>
                    {roleName(r)}
                  </option>
                ))}
              </select>
            </label>
            <PasswordFields t={t} />
          </div>
          <button className="primary" disabled={loading}>
            {t(
              "إنشاء الحساب وتفعيل الدخول",
              "Create account and enable sign-in",
            )}
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>{t("تعيين كلمة مرور لموظف", "Set a staff password")}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const input = values(form, t);
            if (input)
              run(async () => {
                await staffAction({ op: "reset_password", ...input });
                form.reset();
              });
          }}
        >
          <div className="fields">
            <label>
              {t("حساب الموظف", "Staff account")}
              <select name="user_id" required>
                <option value="">—</option>
                {profiles
                  .filter((p) => p.active && p.id !== ownId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
              </select>
            </label>
            <PasswordFields t={t} />
          </div>
          <button className="primary" disabled={loading}>
            {t(
              "حفظ كلمة المرور دون إرسال بريد",
              "Save password without sending email",
            )}
          </button>
        </form>
      </section>
    </>
  );
}
export function OwnPasswordPanel({ t }) {
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  return (
    <section className="panel">
      <h2>{t("تغيير كلمة مروري", "Change my password")}</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const input = values(form, t);
          if (!input || busy) return;
          setBusy(true);
          setFailure("");
          try {
            await staffAction({
              op: "change_own_password",
              password: input.password,
            });
            form.reset();
            await supabase.auth.signOut();
            window.location.assign("/");
          } catch {
            setFailure(
              t(
                "تعذر حفظ كلمة المرور. تأكد من طولها ثم حاول مرة أخرى.",
                "Could not save your password. Check its length and try again.",
              ),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="fields">
          <PasswordFields t={t} />
        </div>
        {failure && <p role="alert">{failure}</p>}
        <p className="hint">
          {t(
            "بعد الحفظ، سجّل الدخول بكلمة المرور الجديدة.",
            "After saving, sign in with your new password.",
          )}
        </p>
        <button className="primary" disabled={busy}>
          {t("حفظ كلمة مروري الجديدة", "Save my new password")}
        </button>
      </form>
    </section>
  );
}

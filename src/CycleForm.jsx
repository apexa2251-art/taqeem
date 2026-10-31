import React, { useState } from "react";
import {
  Plus,
  Trash2,
  Upload,
  Save,
  Send,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";
import { action, api } from "./api";
import { operatingDate, localToIso, isoToLocal } from "../shared/domain";
export default function CycleForm({
  record,
  profile,
  branch,
  devices,
  programs,
  attachments,
  t,
  onSaved,
  onError,
}) {
  const [step, setStep] = useState(1),
    [busy, setBusy] = useState(false),
    [file, setFile] = useState(null);
  const [f, setF] = useState(() => ({
    id: record?.id || crypto.randomUUID(),
    device_id: record?.device_id || "",
    machine_number: record?.machine_number || "",
    operating_date: record?.operating_date || operatingDate(),
    program_id: record?.program_id || "",
    payload: {
      items: [{ name: "", quantity: "", identifiers: "" }],
      packs: "",
      temperature: "",
      exposure: "",
      pressure: "",
      pressure_unit: "",
      M: "",
      C: "",
      D: "",
      completion: "",
      notes: "",
      na_reason: "",
      implantable_load: false,
      ...record?.payload,
      start: isoToLocal(record?.payload?.start),
      end: isoToLocal(record?.payload?.end),
    },
  }));
  const p = f.payload,
    put = (k, v) => setF((f) => ({ ...f, [k]: v })),
    val = (k, v) => setF((f) => ({ ...f, payload: { ...f.payload, [k]: v } }));
  const updateItem = (i, k, v) =>
    val(
      "items",
      p.items.map((x, j) => (j === i ? { ...x, [k]: v } : x)),
    );
  const program = programs.find((x) => x.id === f.program_id),
    existing = attachments.filter(
      (x) => x.cycle_id === f.id && x.cycle_version === (record?.version || 1),
    );
  async function save(submit = false) {
    setBusy(true);
    try {
      if (!f.device_id || !f.machine_number.trim())
        throw new Error("CYCLE_NUMBER_REQUIRED");
      const payload = {
        ...p,
        start: localToIso(p.start),
        end: localToIso(p.end),
      };
      const saved = await action("save_cycle", branch, { ...f, payload });
      if (file) {
        if (file.size > 10 * 1024 * 1024) throw new Error("FILE_TOO_LARGE");
        await api(`/reports/${branch}/${f.id}`, { method: "POST", body: file });
        setFile(null);
      }
      if (submit) await action("submit_cycle", branch, { id: f.id });
      onSaved(saved, submit);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  const field = (k, label, type = "text") => (
    <label>
      {label}
      <input
        type={type}
        value={p[k] ?? ""}
        onChange={(e) => val(k, e.target.value)}
        step={type === "number" ? "any" : undefined}
      />
    </label>
  );
  const explanations = [
    t(
      "ابدأ بتعريف الدورة ومحتوياتها. الهدف ربط كل طقم أو أداة بالجهاز ورقم الدورة الصحيحين.",
      "Identify the cycle and its contents to trace each set or instrument to the correct device and machine cycle.",
    ),
    t(
      "استخدم هذه المرحلة عند توفر تقرير الجهاز ونتائج الفحوص؛ انقل القيم الفعلية دون نسخ نتائج دورة سابقة.",
      "Use this stage when printout and check results are available. Enter actual values without copying a previous cycle’s results.",
    ),
    t(
      "راجع الملخص وأرفق الدليل قبل إرسال السجل. الإرسال لا يعني اعتماد الحمولة للاستخدام.",
      "Review the summary and attach evidence before submission. Submitting does not approve the load for use.",
    ),
  ];
  return (
    <section>
      <header className="page-title">
        <div>
          <span className="eyebrow">
            {t("توثيق دورة التعقيم", "Sterilization cycle documentation")}
          </span>
          <h1>
            {record
              ? t("تعديل المسودة", "Edit draft")
              : t("دورة جديدة", "New cycle")}
          </h1>
        </div>
        <span className="tag">
          {t("المُدخل: ", "Operator: ")}
          {profile.full_name}
        </span>
      </header>
      <div className="steps">
        {[
          t("الجهاز والحمولة", "Device & load"),
          t("القراءات والفحوص", "Readings & checks"),
          t("المرفقات والإرسال", "Attach & send"),
        ].map((s, i) => (
          <button
            key={s}
            className={step === i + 1 ? "active" : ""}
            onClick={() => setStep(i + 1)}
            aria-current={step === i + 1 ? "step" : undefined}
          >
            <b>{i + 1}</b>
            {s}
          </button>
        ))}
      </div>
      <div className="help">
        <Info size={18} />
        <span>{explanations[step - 1]}</span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          step < 3 ? setStep(step + 1) : save(true);
        }}
      >
        {step === 1 && (
          <div className="panel">
            <h2>{t("اختر جهاز التعقيم", "Choose sterilizer")}</h2>
            <div className="device-picks">
              {devices
                .filter((d) => d.active && d.branch_id === branch)
                .map((d) => (
                  <button
                    type="button"
                    key={d.id}
                    className={f.device_id === d.id ? "selected" : ""}
                    onClick={() =>
                      setF({
                        ...f,
                        device_id: d.id,
                        program_id: "",
                        payload: { ...p, pressure_unit: "" },
                      })
                    }
                  >
                    {t("جهاز", "Device")} {d.code}
                  </button>
                ))}
            </div>
            {!devices.some((d) => d.active) && (
              <p className="hint">
                {t(
                  "يحتاج المسؤول إلى تعيين جهاز لهذا الفرع وتفعيله أولاً.",
                  "Administrator must assign and activate a branch device first.",
                )}
              </p>
            )}
            <div className="fields">
              <label>
                {t("رقم الدورة من الجهاز", "Machine cycle number")}
                <input
                  value={f.machine_number}
                  onChange={(e) => put("machine_number", e.target.value)}
                  placeholder={t("من تقرير الجهاز", "From machine printout")}
                />
              </label>
              <label>
                {t("تاريخ التشغيل", "Operating date")}
                <input
                  type="date"
                  value={f.operating_date}
                  onChange={(e) => put("operating_date", e.target.value)}
                />
              </label>
              <label>
                {t("البرنامج المعتمد", "Approved program")}
                <select
                  value={f.program_id}
                  onChange={(e) => {
                    const pg = programs.find((x) => x.id === e.target.value);
                    setF({
                      ...f,
                      program_id: e.target.value,
                      payload: {
                        ...p,
                        pressure_unit: pg?.criteria.pressure_unit || "",
                      },
                    });
                  }}
                >
                  <option value="">
                    {t("اختر البرنامج", "Choose program")}
                  </option>
                  {programs
                    .filter((x) => x.device_id === f.device_id && x.active)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {t("اسم المُدخل · من الحساب", "Operator · from account")}
                <input value={profile.full_name} readOnly />
              </label>
            </div>
            <div className="section-heading">
              <h2>{t("محتويات الحمولة", "Load contents")}</h2>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  val("items", [
                    ...p.items,
                    { name: "", quantity: "", identifiers: "" },
                  ])
                }
              >
                <Plus size={16} />
                {t("إضافة نوع / طقم", "Add item / set")}
              </button>
            </div>
            <p className="hint">
              {t(
                "عندك ١٠ أطقم فحص؟ أدخل النوع مرة واحدة والعدد ١٠. أضف سطراً لنوع آخر أو معرّفات منفصلة.",
                "For 10 examination sets, enter the type once and quantity 10. Add rows for other types or separate IDs.",
              )}
            </p>
            {p.items.map((x, i) => (
              <div className="load-item" key={i}>
                <div className="section-heading">
                  <span>
                    {t("عنصر", "Item")} {i + 1}
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    disabled={p.items.length === 1}
                    onClick={() =>
                      val(
                        "items",
                        p.items.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 size={15} />
                    {t("حذف", "Remove")}
                  </button>
                </div>
                <div className="fields">
                  <label>
                    {t("اسم الطقم / الأداة", "Set / instrument name")}
                    <input
                      list="item-names"
                      value={x.name}
                      onChange={(e) => updateItem(i, "name", e.target.value)}
                    />
                  </label>
                  <label>
                    {t("العدد", "Quantity")}
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={x.quantity}
                      onChange={(e) =>
                        updateItem(i, "quantity", e.target.value)
                      }
                    />
                  </label>
                  <label className="wide">
                    {t(
                      "معرّفات الأطقم / الأدوات إن وجدت",
                      "Set / instrument IDs, if applicable",
                    )}
                    <input
                      value={x.identifiers}
                      onChange={(e) =>
                        updateItem(i, "identifiers", e.target.value)
                      }
                      placeholder="EX-01, HP-03"
                    />
                  </label>
                </div>
              </div>
            ))}
            <datalist id="item-names">
              <option value={t("طقم فحص", "Examination set")} />
              <option value={t("طقم جراحة", "Surgical kit")} />
              <option value={t("قبضة زراعة", "Implant handpiece")} />
            </datalist>
            <div className="summary-line">
              {t("إجمالي الأطقم / الأدوات", "Total sets / instruments")}
              <strong>
                {p.items.reduce((n, x) => n + (Number(x.quantity) || 0), 0)}
              </strong>
            </div>
            {field(
              "packs",
              t(
                "عدد العبوات داخل الدورة (أكياس / حزم)",
                "Packages in this cycle (pouches / packs)",
              ),
              "number",
            )}
            <details>
              <summary>
                {t(
                  "ما الفرق بين عدد الأطقم وعدد العبوات؟",
                  "Set quantity versus package count?",
                )}
              </summary>
              <p>
                {t(
                  "عدد الأطقم هو عدد المجموعات الكاملة، وليس عدد أدواتها الداخلية. عدد العبوات هو عدد وحدات التغليف الفعلية داخل الدورة. مثال: ١٠ أطقم كل طقم في كيس مستقل = ١٠ أطقم و١٠ عبوات. ١٠ أطقم وقبضتان كل وحدة في كيس مستقل = ١٢ عبوة. طبقات التغليف حول الوحدة نفسها لا تعد عبوات منفصلة.",
                  "Set quantity counts complete sets, not their internal instruments. Package count counts actual packaged units in the cycle. Ten sets in ten separate pouches = 10 sets and 10 packages. Ten sets plus two handpieces, each separately pouched = 12 packages. Packaging layers around the same unit are not separate packages.",
                )}
              </p>
            </details>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={p.implantable_load}
                onChange={(e) => val("implantable_load", e.target.checked)}
              />
              {t(
                "الحمولة تحتوي جهازاً يُزرع ويُترك داخل المريض",
                "Load contains an implantable device left in the patient",
              )}
            </label>
            <p className="hint">
              {t(
                "قبضة الزراعة أو الدريل القابل لإعادة الاستخدام ليس هو الغرسة التي تُترك داخل المريض.",
                "A reusable implant handpiece or drill is not an implant left in the patient.",
              )}
            </p>
          </div>
        )}
        {step === 2 && (
          <div className="panel">
            <h2>
              {t(
                "القراءات من تقرير الجهاز",
                "Actual machine printout readings",
              )}
            </h2>
            <div className="fields">
              {field(
                "start",
                t("بداية الدورة · بتوقيت السعودية", "Cycle start · Saudi time"),
                "datetime-local",
              )}
              {field(
                "end",
                t("نهاية الدورة · بتوقيت السعودية", "Cycle end · Saudi time"),
                "datetime-local",
              )}
              {field(
                "temperature",
                t("الحرارة الفعلية °C", "Actual temperature °C"),
                "number",
              )}
              {field(
                "exposure",
                t("زمن التعرض بالدقائق", "Exposure time in minutes"),
                "number",
              )}
              {field(
                "pressure",
                t("الضغط الفعلي", "Actual pressure"),
                "number",
              )}
              <label>
                {t("وحدة الضغط · من البرنامج", "Pressure unit · from program")}
                <input value={p.pressure_unit} readOnly />
              </label>
            </div>
            <p className="hint">
              {t(
                "زمن التعرض مرحلة التعقيم، وهو مستقل عن المدة الكلية للدورة.",
                "Exposure is the sterilization phase, separate from total cycle duration.",
              )}
            </p>
            {[
              ["M", t("المراقبة الميكانيكية", "Mechanical monitoring")],
              [
                "C",
                t(
                  "مؤشر الحمولة الكيميائي المنفصل",
                  "Separate load chemical indicator",
                ),
              ],
              ["D", t("جفاف العبوات وسلامتها", "Pack dryness and integrity")],
            ].map(([k, name]) => (
              <fieldset className="result-row" key={k}>
                <legend>
                  <b>{k}</b> {name}
                </legend>
                <div className="choices">
                  {[
                    "P",
                    "F",
                    ...(k === "C" && program?.criteria.allow_na ? ["NA"] : []),
                  ].map((v) => (
                    <label
                      key={v}
                      className={p[k] === v ? "choice selected" : "choice"}
                    >
                      <input
                        type="radio"
                        name={k}
                        value={v}
                        checked={p[k] === v}
                        onChange={() => val(k, v)}
                      />
                      {v} ·{" "}
                      {v === "P"
                        ? t("مقبول", "Acceptable")
                        : v === "F"
                          ? t("غير مقبول", "Unacceptable")
                          : t("لا ينطبق", "Not applicable")}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            {p.C === "NA" &&
              field(
                "na_reason",
                t("سبب لا ينطبق وفق السياسة", "NA reason under policy"),
              )}
            <label>
              {t("اكتمال الدورة والإنذارات", "Completion and alarms")}
              <select
                value={p.completion}
                onChange={(e) => val("completion", e.target.value)}
              >
                <option value="">{t("حدد الحالة", "Select status")}</option>
                <option value="complete">
                  {t("اكتملت دون إنذار", "Completed without alarm")}
                </option>
                <option value="alarm">{t("إنذار", "Alarm")}</option>
                <option value="interrupted">
                  {t("انقطاع الدورة", "Interrupted")}
                </option>
              </select>
            </label>
          </div>
        )}
        {step === 3 && (
          <div className="panel">
            <h2>{t("المرفقات والملخص", "Attachments and summary")}</h2>
            <label className="upload">
              <Upload size={24} />
              {t(
                "إرفاق تقرير الجهاز · PDF / PNG / JPG · حتى ١٠ MB",
                "Attach printout · PDF / PNG / JPG · up to 10 MB",
              )}
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => setFile(e.target.files[0] || null)}
              />
            </label>
            {existing.map((a) => (
              <p key={a.id} className="hint">
                {t("مرفق محفوظ: ", "Saved attachment: ")}
                {a.filename}
              </p>
            ))}
            <label>
              {t("ملاحظات / إجراء تصحيحي", "Notes / corrective action")}
              <textarea
                value={p.notes}
                onChange={(e) => val("notes", e.target.value)}
              />
            </label>
            <div className="summary-line">
              <span>
                {t("الجهاز / الدورة", "Device / cycle")}:{" "}
                {devices.find((d) => d.id === f.device_id)?.code} /{" "}
                {f.machine_number}
              </span>
              <span>
                {t("العبوات", "Packages")}: {p.packs}
              </span>
            </div>
            {p.items.map((x, i) => (
              <p key={i}>
                {x.name} × {x.quantity} {x.identifiers && `· ${x.identifiers}`}
              </p>
            ))}
            <div className="help">
              {t(
                "بعد الإرسال يصبح السجل للقراءة والمراجعة. التصحيح اللاحق يحتاج سبباً موثقاً وإصداراً جديداً.",
                "After submission the record is read-only for review. Later corrections require a documented reason and new revision.",
              )}
            </div>
          </div>
        )}
        <footer className="form-footer">
          <div className="row">
            {step > 1 && (
              <button
                type="button"
                className="secondary"
                onClick={() => setStep(step - 1)}
              >
                {t("السابق", "Back")}
              </button>
            )}
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => save(false)}
            >
              <Save size={16} />
              {t("حفظ مسودة", "Save draft")}
            </button>
          </div>
          <button className="primary" disabled={busy}>
            {step === 3 ? <Send size={16} /> : <ChevronLeft size={16} />}{" "}
            {busy
              ? t("جارٍ الحفظ…", "Saving…")
              : step === 3
                ? t("إرسال للمراجعة", "Submit for review")
                : t("متابعة", "Continue")}
          </button>
        </footer>
      </form>
    </section>
  );
}

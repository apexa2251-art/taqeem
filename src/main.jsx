import React, { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  List,
  PlusCircle,
  ClipboardCheck,
  FlaskConical,
  ListChecks,
  Microwave,
  Package,
  Files,
  Users,
  History,
  BookOpen,
  Settings,
  Bell,
  LogOut,
  Languages,
  Menu,
  ChevronLeft,
  Check,
  TriangleAlert,
  Info,
  RefreshCw,
  Printer,
  Download,
  Eye,
  ShieldCheck,
  X,
  HelpCircle,
} from "lucide-react";
import { configure, supabase, api, action } from "./api";
import CycleForm from "./CycleForm";
import { errors } from "./messages";
import {
  approvalIssues,
  deriveNotifications,
  csvCell,
  operatingDate,
  localToIso,
} from "../shared/domain";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "@fontsource-variable/inter";
import "./styles.css";
const navigation = [
  ["home", LayoutDashboard, "نظرة عامة", "Overview"],
  ["cycles", List, "سجل الدورات", "Cycle log"],
  ["new", PlusCircle, "دورة جديدة", "New cycle"],
  ["review", ClipboardCheck, "المراجعة والاعتماد", "Review & approval"],
  ["bio", FlaskConical, "الاختبارات الحيوية", "Biological tests"],
  ["checks", ListChecks, "فحوص الأجهزة", "Device checks"],
  ["devices", Microwave, "الأجهزة والبرامج", "Devices & programs"],
  ["sets", Package, "الأطقم والقبضات", "Sets & handpieces"],
  ["notifications", Bell, "الإشعارات والتنبيهات", "Notifications & alerts"],
  ["reports", Files, "التقارير والطباعة", "Reports & printing"],
  ["users", Users, "المستخدمون", "Users"],
  ["audit", History, "سجل التدقيق", "Audit trail"],
  ["guide", BookOpen, "دليل الاستخدام", "User guide"],
];
const empty = {
  devices: [],
  programs: [],
  cycles: [],
  evidence_tests: [],
  attachments: [],
  cycle_versions: [],
  audit_events: [],
  notification_receipts: [],
  profiles: [],
  memberships: [],
};
function App() {
  const [lang, setLang] = useState(
    localStorage.getItem("sterilog-language") || "ar",
  );
  const t = (a, e) => (lang === "ar" ? a : e);
  const [ready, setReady] = useState(false),
    [configured, setConfigured] = useState(false),
    [session, setSession] = useState(null),
    [me, setMe] = useState(null),
    [branch, setBranch] = useState(""),
    [data, setData] = useState(empty),
    [page, setPage] = useState("home"),
    [mobile, setMobile] = useState(false),
    [message, setMessage] = useState(null),
    [loading, setLoading] = useState(false),
    [selected, setSelected] = useState(""),
    [editor, setEditor] = useState(null),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [tour, setTour] = useState(-1),
    [recovery, setRecovery] = useState(false);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    localStorage.setItem("sterilog-language", lang);
  }, [lang]);
  useEffect(() => {
    let alive = true,
      subscription;
    configure()
      .then(async (yes) => {
        if (!alive) return;
        setConfigured(yes);
        if (yes) {
          const { data } = await supabase.auth.getSession();
          if (alive) setSession(data.session);
          subscription = supabase.auth.onAuthStateChange((event, s) => {
            if (!alive) return;
            setSession(s);
            if (event === "PASSWORD_RECOVERY") setRecovery(true);
          }).data.subscription;
        }
        setReady(true);
      })
      .catch(() => {
        setReady(true);
      });
    return () => {
      alive = false;
      subscription?.unsubscribe();
    };
  }, []);
  const error = (e) => {
    const key = Object.keys(errors).find((k) => e.message.includes(k));
    setMessage({
      kind: "error",
      text: key
        ? t(...errors[key])
        : t(
            "تعذر إكمال العملية. راجع بيانات الدخول والاتصال أو تواصل مع المسؤول.",
            "Unable to complete the operation. Check credentials and connectivity or contact your administrator.",
          ),
    });
  };
  useEffect(() => {
    let alive = true;
    setMe(null);
    setBranch("");
    setData(empty);
    if (session)
      api("/me")
        .then((v) => {
          if (alive) {
            setMe(v);
            const saved = sessionStorage.getItem("sterilog-branch");
            setBranch(
              v.branches.find((b) => b.id === saved)?.id ||
                v.branches[0]?.id ||
                "",
            );
          }
        })
        .catch(error);
    return () => {
      alive = false;
    };
  }, [session?.user?.id]);
  useEffect(() => {
    let alive = true;
    setData(empty);
    if (branch && me) {
      setLoading(true);
      sessionStorage.setItem("sterilog-branch", branch);
      api(`/data/${branch}`)
        .then((v) => {
          if (alive) setData({ ...empty, ...v });
        })
        .catch(error)
        .finally(() => {
          if (alive) setLoading(false);
        });
    }
    return () => {
      alive = false;
    };
  }, [branch, me]);
  async function reload() {
    if (!branch) return;
    setData({ ...empty, ...(await api(`/data/${branch}`)) });
  }
  async function run(fn, success = true) {
    if (loading) return;
    setLoading(true);
    setMessage(null);
    try {
      await fn();
      await reload();
      if (success)
        setMessage({
          kind: "success",
          text: t("تم حفظ الإجراء بنجاح.", "Action saved successfully."),
        });
    } catch (e) {
      error(e);
    } finally {
      setLoading(false);
    }
  }
  const role = me?.profile.system_admin
    ? "system_admin"
    : me?.memberships.find((m) => m.branch_id === branch)?.role;
  const roleName = (r) =>
    r === "system_admin"
      ? t("مسؤول عام", "System administrator")
      : r === "branch_admin"
        ? t("مسؤول الفرع", "Branch administrator")
        : r === "reviewer"
          ? t("مراجع مخول", "Authorized reviewer")
          : r === "operator"
            ? t("مُدخل سجلات", "Operator")
            : t("للعرض فقط", "Viewer");
  const canWrite = [
      "operator",
      "reviewer",
      "branch_admin",
      "system_admin",
    ].includes(role),
    canReview = ["reviewer", "branch_admin", "system_admin"].includes(role),
    canAdmin = ["branch_admin", "system_admin"].includes(role);
  const cycles = data.cycles
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    activeBranch = me?.branches.find((b) => b.id === branch),
    notifications = deriveNotifications(cycles, data.evidence_tests),
    unread = notifications.filter(
      (n) =>
        !data.notification_receipts.some(
          (r) => r.event_key === n.key && r.read_at,
        ),
    ).length;
  const c = cycles.find((c) => c.id === selected),
    searchCycles = cycles.filter((c) =>
      (
        c.machine_number +
        " " +
        c.operator_name +
        " " +
        c.payload.items?.map((i) => i.name + " " + i.identifiers).join(" ")
      )
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  const devCode = (id) => data.devices.find((d) => d.id === id)?.code || "—";
  const state = (c) =>
    c.decision === "R"
      ? t("معتمدة للاستخدام", "Approved for use")
      : c.decision === "H"
        ? t("قيد الحجز", "Held")
        : c.decision === "X"
          ? t("مرفوضة", "Rejected")
          : c.workflow === "submitted"
            ? t("بانتظار المراجعة", "Awaiting review")
            : t("مسودة", "Draft");
  const badge = (c) => (
    <span
      className={`status ${c.decision === "R" ? "success" : c.decision ? "danger" : c.workflow === "submitted" ? "warning" : "neutral"}`}
    >
      {state(c)}
    </span>
  );
  const go = (id) => {
    setPage(id);
    setMobile(false);
    setMessage(null);
    if (id === "new") setEditor(null);
  };
  const openCycle = (record, review = false) => {
    setSelected(record.id);
    setPage(review ? "review" : "detail");
  };
  const time = (v) =>
    v
      ? new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-GB", {
          timeZone: "Asia/Riyadh",
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(v))
      : "—";
  const formData = (e) => Object.fromEntries(new FormData(e.currentTarget));
  const title = (ar, en, extra = null) => (
    <header className="page-title">
      <div>
        <span className="eyebrow">
          {activeBranch
            ? t(activeBranch.name_ar, activeBranch.name_en)
            : "CSSD"}
        </span>
        <h1>{t(ar, en)}</h1>
      </div>
      {extra}
    </header>
  );
  const newButton = canWrite && (
    <button className="primary" onClick={() => go("new")}>
      <PlusCircle size={17} />
      {t("دورة جديدة", "New cycle")}
    </button>
  );
  const cycleList = (items) =>
    items.length ? (
      <div className="cycle-list">
        {items.map((c) => (
          <button key={c.id} className="cycle-row" onClick={() => openCycle(c)}>
            <div>
              <strong dir="ltr">#{c.machine_number}</strong>
              <span className="hint">
                {t("جهاز", "Device")} {devCode(c.device_id)} ·{" "}
                {c.operating_date}
              </span>
            </div>
            <div className="cycle-load">
              {c.payload.items
                ?.map((x) => `${x.name} × ${x.quantity}`)
                .join(" · ") || "—"}
              <span className="hint">
                {c.operator_name} · {t("العبوات", "Packages")}:{" "}
                {c.payload.packs || "—"}
              </span>
            </div>
            {badge(c)}
            <ChevronLeft size={16} />
          </button>
        ))}
      </div>
    ) : (
      <div className="empty">
        <Package size={30} />
        <h2>{t("لا توجد دورات هنا بعد", "No cycles here yet")}</h2>
        <p>
          {t(
            "تظهر السجلات بعد إدخال أول دورة لهذا الفرع.",
            "Records appear after the first branch cycle is entered.",
          )}
        </p>
        {newButton}
      </div>
    );
  function summary(c) {
    return (
      <>
        <div className="detail-grid">
          {[
            [t("الجهاز", "Device"), devCode(c.device_id)],
            [t("رقم الدورة", "Machine cycle"), c.machine_number],
            [t("التاريخ", "Date"), c.operating_date],
            [t("البرنامج", "Program"), c.program_snapshot?.name || "—"],
            [t("المُدخل", "Operator"), c.operator_name],
            [t("المراجع", "Reviewer"), c.reviewer_name || "—"],
            [t("عدد العبوات", "Package count"), c.payload.packs],
            [t("الإصدار", "Version"), c.version],
          ].map(([a, b]) => (
            <div key={a}>
              <span className="hint">{a}</span>
              <strong>{b}</strong>
            </div>
          ))}
        </div>
        <div className="result-summary">
          {[
            ["M", t("ميكانيكي", "Mechanical")],
            ["C", t("مؤشر حمولة", "Load chemical")],
            ["D", t("الجفاف والسلامة", "Dry & intact")],
          ].map(([k, label]) => (
            <div key={k}>
              <b>{k}</b>
              <span>{label}</span>
              <strong>{c.payload[k] || "—"}</strong>
            </div>
          ))}
        </div>
        <dl className="readings">
          <dt>
            {t(
              "الحرارة / زمن التعرض / الضغط",
              "Temperature / exposure / pressure",
            )}
          </dt>
          <dd>
            {c.payload.temperature ?? "—"} °C · {c.payload.exposure ?? "—"} min
            · {c.payload.pressure ?? "—"} {c.payload.pressure_unit}
          </dd>
          <dt>{t("بداية / نهاية الدورة", "Cycle start / end")}</dt>
          <dd>
            {time(c.payload.start)} → {time(c.payload.end)}
          </dd>
        </dl>
        <h3>{t("محتويات الحمولة", "Load contents")}</h3>
        {c.payload.items?.map((x, i) => (
          <div className="list-line" key={i}>
            <span>
              {x.name} × {x.quantity}
            </span>
            <span dir="ltr">{x.identifiers}</span>
          </div>
        ))}
        {c.payload.notes && <p>{c.payload.notes}</p>}
        {c.reason && (
          <div className="help">
            {c.reason}
            <br />
            {c.corrective_action}
          </div>
        )}
        <h3>{t("التقارير المرفقة", "Attached reports")}</h3>
        {data.attachments
          .filter((a) => a.cycle_id === c.id)
          .map((a) => (
            <button
              key={a.id}
              className="secondary"
              onClick={() =>
                run(async () => {
                  const result = await api("/report/" + a.id);
                  window.open(result.url, "_blank", "noopener,noreferrer");
                }, false)
              }
            >
              <Eye size={16} />
              {a.filename}
            </button>
          ))}
        {!data.attachments.some((a) => a.cycle_id === c.id) && (
          <p className="hint">
            {t("لم يرفق تقرير بعد.", "No report attached yet.")}
          </p>
        )}
      </>
    );
  }
  const tourPages = [
    "home",
    "new",
    "cycles",
    "review",
    "notifications",
    "devices",
    "reports",
  ];
  const tourTexts = [
    t(
      "هنا ملخص سجلات فرعك وما يحتاج متابعة. بيانات الفرعين منفصلة.",
      "This is your branch overview and follow-up queue. Branch records are isolated.",
    ),
    t(
      "سجّل الدورة بثلاث مراحل. اسمك يأتي من حسابك تلقائياً.",
      "Record a cycle in three stages. Your name comes from your account automatically.",
    ),
    t(
      "ابحث عن الدورة وافتح تقريرها واسم مُدخلها وقرار المراجع.",
      "Search cycles and open evidence, operator name and review decision.",
    ),
    t(
      "المراجع المخول يراجع الأدلة ثم يعتمد الاستخدام أو يوثق الحجز والرفض.",
      "Authorized reviewers check evidence and approve use or document hold/rejection.",
    ),
    t(
      "التنبيه يفتح السجل المرتبط به. الاطلاع لا يحل المشكلة ولا يغير القرار.",
      "Notifications open the related record. Reading does not resolve an issue or change a decision.",
    ),
    t(
      "المسؤول يوزع الأجهزة الأربعة ويضبط البرامج من مراجع المصنع المعتمدة.",
      "Administrator assigns the four devices and configures programs from approved manufacturer references.",
    ),
    t(
      "اطبع سجلات الفرع أو صدّرها، مع اسم المُدخل والمراجع.",
      "Print or export branch logs with operator and reviewer names.",
    ),
  ];
  function devicePage() {
    return (
      <>
        {title("الأجهزة والبرامج", "Devices & programs")}
        <div className="help">
          <Info size={18} />
          {t(
            "الأجهزة الأربعة غير موزعة تلقائياً. يحدد المسؤول فرع كل جهاز ويضبط البرامج ومعايير القبول من تعليمات المصنع.",
            "The four devices are not assigned automatically. An administrator assigns each device and configures programs and criteria from manufacturer instructions.",
          )}
        </div>
        <div className="device-cards">
          {data.devices.map((d) => (
            <div className="panel" key={d.id}>
              <span className="eyebrow">
                {t("جهاز", "Device")} {d.code}
              </span>
              <h2>{d.model || t("يحتاج إعداداً", "Setup needed")}</h2>
              <p className="hint">
                {d.branch_id
                  ? d.serial || "—"
                  : t("لم يحدد الفرع", "Branch not assigned")}
              </p>
              {canAdmin ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = formData(e);
                    run(() =>
                      action("save_device", branch, {
                        id: d.id,
                        ...v,
                        active: v.active === "on",
                      }),
                    );
                  }}
                >
                  <label>
                    {t("الشركة والطراز", "Manufacturer / model")}
                    <input name="model" defaultValue={d.model} required />
                  </label>
                  <label>
                    {t("الرقم التسلسلي", "Serial number")}
                    <input name="serial" defaultValue={d.serial} />
                  </label>
                  <label>
                    {t("مرجع تعليمات المصنع IFU", "Manufacturer IFU reference")}
                    <input name="ifu" defaultValue={d.ifu} required />
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      name="active"
                      defaultChecked={d.active}
                    />
                    {t("تفعيل في الفرع الحالي", "Activate in current branch")}
                  </label>
                  <button className="secondary" disabled={loading}>
                    {t("حفظ وربط بالفرع", "Save and assign branch")}
                  </button>
                </form>
              ) : (
                <span className="tag">
                  {d.active ? t("مفعل", "Active") : t("غير مفعل", "Inactive")}
                </span>
              )}
            </div>
          ))}
        </div>
        <section className="panel">
          <h2>{t("البرامج المعتمدة", "Approved programs")}</h2>
          {data.programs.map((p) => (
            <div className="list-line" key={p.id}>
              <span>
                {devCode(p.device_id)} · {p.name}
                <small>{p.ifu}</small>
              </span>
              <span>{p.approved_name}</span>
            </div>
          ))}
          {!data.programs.length && (
            <p className="hint">
              {t(
                "لا توجد برامج معتمدة بعد؛ لن يمكن إرسال دورة دون برنامج.",
                "No approved programs yet. Submission requires an approved program.",
              )}
            </p>
          )}
          {canAdmin && (
            <details>
              <summary>
                {t(
                  "إضافة برنامج بمعايير معتمدة",
                  "Add program with approved criteria",
                )}
              </summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = formData(e);
                  run(() =>
                    action("create_program", branch, {
                      device_id: v.device_id,
                      name: v.name,
                      ifu: v.ifu,
                      criteria: {
                        temp_min: Number(v.temp_min),
                        temp_max: Number(v.temp_max),
                        exposure_min: Number(v.exposure_min),
                        pressure_min: Number(v.pressure_min),
                        pressure_max: Number(v.pressure_max),
                        pressure_unit: v.pressure_unit,
                        allow_na: v.allow_na === "on",
                        bi_required: v.bi_required === "on",
                      },
                    }),
                  );
                }}
              >
                <div className="fields">
                  <label>
                    {t("الجهاز", "Device")}
                    <select name="device_id" required>
                      <option value="">—</option>
                      {data.devices
                        .filter((d) => d.branch_id === branch)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.code}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    {t("اسم البرنامج", "Program name")}
                    <input name="name" required />
                  </label>
                  <label className="wide">
                    {t(
                      "مرجع المعايير / IFU والإصدار",
                      "Criteria / IFU reference and revision",
                    )}
                    <input name="ifu" required />
                  </label>
                  {[
                    ["temp_min", "الحرارة الدنيا °C", "Minimum temperature °C"],
                    ["temp_max", "الحرارة العليا °C", "Maximum temperature °C"],
                    [
                      "exposure_min",
                      "زمن التعرض الأدنى بالدقائق",
                      "Minimum exposure minutes",
                    ],
                    ["pressure_min", "الضغط الأدنى", "Minimum pressure"],
                    ["pressure_max", "الضغط الأعلى", "Maximum pressure"],
                  ].map(([key, ar, en]) => (
                    <label key={key}>
                      {t(ar, en)}
                      <input type="number" step="any" name={key} required />
                    </label>
                  ))}
                  <label>
                    {t("وحدة الضغط", "Pressure unit")}
                    <select name="pressure_unit">
                      <option>bar</option>
                      <option>kPa</option>
                    </select>
                  </label>
                </div>
                <label className="checkbox">
                  <input type="checkbox" name="allow_na" />
                  {t(
                    "السياسة تسمح NA لمؤشر الحمولة المنفصل مع السبب",
                    "Policy permits NA for separate load indicator with a reason",
                  )}
                </label>
                <label className="checkbox">
                  <input type="checkbox" name="bi_required" />
                  {t(
                    "يتطلب نتيجة BI قبل اعتماد الاستخدام",
                    "Requires BI result before use approval",
                  )}
                </label>
                <button className="primary" disabled={loading}>
                  {t("اعتماد هذا البرنامج", "Approve this program")}
                </button>
              </form>
            </details>
          )}
        </section>
      </>
    );
  }
  function testsPage(kind) {
    const bi = kind === "bi";
    return (
      <>
        {title(
          bi ? "الاختبارات الحيوية" : "فحوص الأجهزة",
          bi ? "Biological tests" : "Device checks",
        )}
        <div className="help">
          {bi
            ? t(
                "سجّل الاختبار والشاهد غير المعالج ونتائجهما حسب تعليمات المؤشر. أي قراءة لاحقة تسجل كإدخال جديد مرتبط بالدورة نفسها؛ تحفظ القراءات السابقة.",
                "Record the test and unprocessed control under indicator instructions. Later readings are new entries linked to the same cycle; previous entries remain.",
              )
            : t(
                "دوّن الفحوص المنطبقة على طراز الجهاز فقط وفق مرجع معتمد، دون افتراض أن كل الفحوص تنطبق على الأجهزة الأربعة.",
                "Record only checks applicable to the device model under its approved reference.",
              )}
        </div>
        {canWrite && (
          <section className="panel">
            <h2>{t("إضافة سجل", "Add record")}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const v = formData(e),
                  payload = { ...v };
                for (const key of ["incubation_at", "read_at", "performed_at"])
                  if (payload[key]) payload[key] = localToIso(payload[key]);
                run(() =>
                  action("record_test", branch, {
                    kind,
                    device_id: v.device_id,
                    cycle_id: v.cycle_id,
                    payload,
                  }),
                );
              }}
            >
              <div className="fields">
                <label>
                  {t("الجهاز", "Device")}
                  <select name="device_id" required>
                    <option value="">—</option>
                    {data.devices
                      .filter((d) => d.active)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.code}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  {t("الدورة المرتبطة إن وجدت", "Linked cycle, if applicable")}
                  <select name="cycle_id">
                    <option value="">—</option>
                    {cycles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {devCode(c.device_id)} / #{c.machine_number}
                      </option>
                    ))}
                  </select>
                </label>
                {bi ? (
                  <>
                    {[
                      ["test_lot", "تشغيلة الاختبار", "Test lot"],
                      ["control_lot", "تشغيلة الشاهد", "Control lot"],
                    ].map(([key, ar, en]) => (
                      <label key={key}>
                        {t(ar, en)}
                        <input name={key} required />
                      </label>
                    ))}
                    <label>
                      {t(
                        "بداية الحضانة · السعودية",
                        "Incubation start · Saudi time",
                      )}
                      <input
                        type="datetime-local"
                        name="incubation_at"
                        required
                      />
                    </label>
                    <label>
                      {t("وقت القراءة · السعودية", "Reading time · Saudi time")}
                      <input type="datetime-local" name="read_at" />
                    </label>
                    {[
                      ["test_result", t("نتيجة الاختبار", "Test result")],
                      ["control_result", t("نتيجة الشاهد", "Control result")],
                    ].map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <select name={key}>
                          <option value="pending">
                            {t("قيد الانتظار", "Pending")}
                          </option>
                          <option value="negative">
                            {t("سلبي", "Negative")}
                          </option>
                          <option value="positive">
                            {t("إيجابي", "Positive")}
                          </option>
                        </select>
                      </label>
                    ))}
                  </>
                ) : (
                  <>
                    <label>
                      {t("نوع الفحص ومرجعه", "Check type and reference")}
                      <input
                        name="check_type"
                        required
                        placeholder="Air removal / Leak test / ..."
                      />
                    </label>
                    <label>
                      {t("وقت التنفيذ · السعودية", "Performed at · Saudi time")}
                      <input
                        type="datetime-local"
                        name="performed_at"
                        required
                      />
                    </label>
                    <label>
                      {t("النتيجة", "Result")}
                      <select name="result" required>
                        <option value="">—</option>
                        <option>P</option>
                        <option>F</option>
                      </select>
                    </label>
                  </>
                )}
                <label className="wide">
                  {t(
                    "ملاحظات / إجراء / مرجع التقرير",
                    "Notes / action / report reference",
                  )}
                  <textarea name="notes" />
                </label>
              </div>
              <button className="primary" disabled={loading}>
                {t("حفظ السجل باسمي", "Save record under my name")}
              </button>
            </form>
          </section>
        )}
        <section className="panel">
          <h2>{t("السجلات السابقة", "Previous records")}</h2>
          {data.evidence_tests
            .filter((x) => x.kind === kind)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((x) => (
              <div className="list-line" key={x.id}>
                <div>
                  {t("جهاز", "Device")} {devCode(x.device_id)} ·{" "}
                  {bi
                    ? `${x.payload.test_result} / ${x.payload.control_result}`
                    : x.payload.check_type + " · " + x.payload.result}
                  <small>
                    {x.operator_name} · {time(x.created_at)}
                  </small>
                  <small>{x.payload.notes}</small>
                </div>
              </div>
            ))}
        </section>
      </>
    );
  }
  function content() {
    if (page === "new")
      return canWrite ? (
        <CycleForm
          key={editor?.id || "new"}
          record={editor}
          profile={me.profile}
          branch={branch}
          devices={data.devices}
          programs={data.programs}
          attachments={data.attachments}
          t={t}
          onError={error}
          onSaved={async (record, submitted) => {
            await reload();
            setSelected(record.id);
            setPage("detail");
            setMessage({
              kind: "success",
              text: submitted
                ? t("أرسل السجل للمراجعة.", "Record submitted for review.")
                : t("حفظت المسودة باسمك.", "Draft saved under your name."),
            });
          }}
        />
      ) : (
        <div className="empty">
          {t("حسابك للعرض فقط.", "Your account is read-only.")}
        </div>
      );
    if (page === "home") {
      const today = cycles.filter((c) => c.operating_date === operatingDate());
      return (
        <>
          {title("نظرة عامة", "Overview", newButton)}
          <div className="overview-photo">
            <img src="/assets/cssd-department.png" alt="" loading="lazy" />
            <div>
              <span className="hero-kicker">STERILOG / CSSD</span>
              <h2>
                {t(
                  "وضوح في السجلات. سهولة في المتابعة.",
                  "Clear records. Simpler follow-up.",
                )}
              </h2>
              <p>
                {t(activeBranch?.name_ar || "", activeBranch?.name_en || "")}
              </p>
            </div>
          </div>
          <p className="subtitle">
            {t(
              "كل جهاز وكل دورة في مكان واحد.",
              "Every device and cycle in one place.",
            )}
          </p>
          <div className="metrics">
            {[
              [today.length, t("دورات اليوم", "Cycles today")],
              [
                cycles.filter((c) => c.workflow === "submitted").length,
                t("بانتظار المراجعة", "Awaiting review"),
              ],
              [
                cycles.filter((c) => c.decision === "H").length,
                t("حمولات قيد الحجز", "Held loads"),
              ],
            ].map(([n, l]) => (
              <div className="panel metric" key={l}>
                <span>{l}</span>
                <strong>{n}</strong>
              </div>
            ))}
          </div>
          <div className="device-cards compact">
            {data.devices
              .filter((d) => d.branch_id === branch)
              .map((d) => (
                <button
                  className="panel device-card"
                  key={d.id}
                  onClick={() => go("devices")}
                >
                  <span className="hint">{t("أوتوكلاف", "Autoclave")}</span>
                  <div>
                    <strong>{d.code}</strong>
                    <Microwave size={23} />
                  </div>
                  <span className="hint">
                    {d.model || t("يحتاج إعداداً", "Setup needed")}
                  </span>
                </button>
              ))}
          </div>
          {!data.devices.some((d) => d.branch_id === branch) && (
            <div className="help">
              <Settings size={18} />
              <span>
                {t(
                  "ابدأ من «الأجهزة والبرامج» لتعيين أجهزة هذا الفرع. لا توجد بيانات أو نتائج تجريبية في النظام.",
                  "Start with Devices & programs to assign this branch’s devices. This system contains no demo results.",
                )}
              </span>
            </div>
          )}
          <section className="panel">
            <div className="section-heading">
              <h2>{t("آخر الدورات", "Recent cycles")}</h2>
              <button className="text-button" onClick={() => go("cycles")}>
                {t("عرض الكل", "View all")}
                <ChevronLeft size={16} />
              </button>
            </div>
            {cycleList(cycles.slice(0, 6))}
          </section>
        </>
      );
    }
    if (page === "cycles")
      return (
        <>
          {title("سجل دورات التعقيم", "Sterilization cycle log", newButton)}
          <label className="search">
            {t(
              "البحث برقم الدورة أو الطقم أو اسم المُدخل",
              "Search by cycle, set or operator",
            )}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("ابحث في سجلات الفرع…", "Search branch records…")}
            />
          </label>
          <section className="panel">{cycleList(searchCycles)}</section>
        </>
      );
    if (page === "detail")
      return (
        <>
          {title(
            "تفاصيل الدورة",
            "Cycle details",
            <button className="secondary" onClick={() => go("cycles")}>
              {t("العودة للسجل", "Back to log")}
            </button>,
          )}
          {c ? (
            <section className="panel">
              <div className="section-heading">
                <h2 dir="ltr">#{c.machine_number}</h2>
                {badge(c)}
              </div>
              {summary(c)}
              <div className="row section-heading">
                {c.workflow === "draft" &&
                  c.operator_id === me.profile.id &&
                  canWrite && (
                    <button
                      className="primary"
                      onClick={() => {
                        setEditor(c);
                        setPage("new");
                      }}
                    >
                      {t("إكمال المسودة", "Continue draft")}
                    </button>
                  )}
                {canReview && c.workflow === "submitted" && (
                  <button
                    className="primary"
                    onClick={() => openCycle(c, true)}
                  >
                    {t("مراجعة السجل", "Review record")}
                  </button>
                )}
                {canReview && c.workflow !== "draft" && (
                  <details>
                    <summary>
                      {t("طلب تصحيح موثق", "Documented revision")}
                    </summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const v = formData(e);
                        run(async () => {
                          await action("revise_cycle", branch, {
                            id: c.id,
                            reason: v.reason,
                          });
                        }, true);
                      }}
                    >
                      <label>
                        {t("سبب التصحيح", "Revision reason")}
                        <textarea name="reason" minLength="3" required />
                      </label>
                      <button className="secondary" disabled={loading}>
                        {t(
                          "حفظ الإصدار السابق وإعادة المسودة",
                          "Archive previous revision and reopen draft",
                        )}
                      </button>
                    </form>
                  </details>
                )}
              </div>
              {data.cycle_versions.some((v) => v.cycle_id === c.id) && (
                <details>
                  <summary>
                    {t("الإصدارات السابقة", "Previous revisions")}
                  </summary>
                  {data.cycle_versions
                    .filter((v) => v.cycle_id === c.id)
                    .map((v) => (
                      <p key={v.id}>
                        {t("الإصدار", "Version")} {v.version} ·{" "}
                        {v.snapshot.operator_name} · {time(v.created_at)}
                      </p>
                    ))}
                </details>
              )}
            </section>
          ) : (
            <div className="empty">
              {t("اختر دورة من السجل.", "Choose a cycle from the log.")}
            </div>
          )}
        </>
      );
    if (page === "review") {
      const pending = cycles.filter((c) => c.workflow === "submitted"),
        current = c?.workflow === "submitted" ? c : pending[0];
      const issues = current
        ? approvalIssues(current, data.evidence_tests)
        : [];
      return (
        <>
          {title("المراجعة والاعتماد", "Review & approval")}
          <div className="help">
            <ClipboardCheck size={18} />
            {t(
              "بعد التحقق من الأدلة يقرر المراجع المخول اعتماد الاستخدام أو الحجز أو الرفض. اسم المُدخل والمراجع منفصلان.",
              "After checking evidence, the authorized reviewer approves use, holds or rejects. Operator and reviewer are recorded separately.",
            )}
          </div>
          {pending.length ? (
            <div className="review-grid">
              <aside className="review-queue">
                {pending.map((x) => (
                  <button
                    className={current.id === x.id ? "panel selected" : "panel"}
                    key={x.id}
                    onClick={() => setSelected(x.id)}
                  >
                    #{x.machine_number}
                    <small>
                      {t("جهاز", "Device")} {devCode(x.device_id)}
                    </small>
                    {badge(x)}
                  </button>
                ))}
              </aside>
              <div className="panel">
                <h2>#{current.machine_number}</h2>
                {summary(current)}
                {issues.map((i) => (
                  <div className="inline-warning" key={i}>
                    <TriangleAlert size={16} />
                    {t(...(errors[i] || errors.REQUEST_FAILED))}
                  </div>
                ))}
                {current.operator_id === me.profile.id && (
                  <div className="inline-warning">
                    {t(...errors.INDEPENDENT_REVIEW_REQUIRED)}
                  </div>
                )}
                {canReview ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const v = formData(e);
                      if (
                        !window.confirm(
                          t(
                            "تأكيد توثيق هذا القرار باسمك؟",
                            "Confirm recording this decision under your name?",
                          ),
                        )
                      )
                        return;
                      run(() =>
                        action("decide_cycle", branch, {
                          id: current.id,
                          ...v,
                        }),
                      );
                    }}
                  >
                    <div className="fields">
                      <label>
                        {t("القرار", "Decision")}
                        <select name="decision" required>
                          <option value="">
                            {t("اختر القرار", "Choose decision")}
                          </option>
                          <option
                            value="R"
                            disabled={
                              issues.length > 0 ||
                              current.operator_id === me.profile.id
                            }
                          >
                            {t("معتمدة للاستخدام", "Approved for use")}
                          </option>
                          <option value="H">{t("قيد الحجز", "Held")}</option>
                          <option value="X">{t("مرفوضة", "Rejected")}</option>
                        </select>
                      </label>
                      <label>
                        {t("السبب", "Reason")}
                        <input name="reason" />
                      </label>
                      <label className="wide">
                        {t(
                          "الإجراء التصحيحي / المتابعة",
                          "Corrective action / follow-up",
                        )}
                        <textarea name="corrective_action" />
                      </label>
                    </div>
                    <button className="primary" disabled={loading}>
                      {t("توثيق القرار باسمي", "Record decision under my name")}
                    </button>
                  </form>
                ) : (
                  <p className="hint">
                    {t(
                      "القرار متاح للمراجع المخول فقط.",
                      "Only an authorized reviewer can record a decision.",
                    )}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="empty">
              <Check size={30} />
              <h2>
                {t(
                  "لا توجد دورات بانتظار المراجعة",
                  "No cycles awaiting review",
                )}
              </h2>
            </div>
          )}
        </>
      );
    }
    if (page === "devices") return devicePage();
    if (page === "bio") return testsPage("bi");
    if (page === "checks") return testsPage("device_check");
    if (page === "notifications") {
      const list = notifications.filter(
        (n) =>
          filter === "all" ||
          (filter === "critical" && n.level === "critical") ||
          (filter === "unread" &&
            !data.notification_receipts.some(
              (r) => r.event_key === n.key && r.read_at,
            )),
      );
      return (
        <>
          {title("الإشعارات والتنبيهات", "Notifications & alerts")}
          <div className="help">
            <Bell size={18} />
            {t(
              "تنبيهات داخل التطبيق مبنية على السجلات المسجلة، وليست مراقبة مباشرة للأجهزة. اعتبار التنبيه مقروءاً لا يحل المشكلة ولا يعتمد الحمولة.",
              "In-app alerts derive from recorded data, not live device monitoring. Marking read does not resolve an issue or approve a load.",
            )}
          </div>
          <div className="tabs">
            {[
              ["all", t("الكل", "All")],
              ["unread", t("غير المقروءة", "Unread")],
              ["critical", t("الحرجة", "Critical")],
            ].map(([k, l]) => (
              <button
                key={k}
                className={filter === k ? "selected" : ""}
                onClick={() => setFilter(k)}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="panel">
            {list.map((n) => {
              const receipt = data.notification_receipts.find(
                (r) => r.event_key === n.key,
              );
              return (
                <article className={`notification ${n.level}`} key={n.key}>
                  <TriangleAlert size={20} />
                  <div>
                    <span className="hint">
                      {n.level === "critical"
                        ? t("تنبيه حرج", "Critical alert")
                        : t("تحتاج متابعة", "Follow-up")}
                      {!receipt?.read_at ? " · " + t("جديد", "New") : ""}
                    </span>
                    <h3>
                      {n.kind === "cycle_issue"
                        ? t(
                            "نتيجة غير مقبولة / حمولة غير معتمدة",
                            "Unacceptable result / unapproved load",
                          )
                        : n.kind === "review_due"
                          ? t("دورة بانتظار المراجعة", "Cycle awaiting review")
                          : n.kind === "bi_pending"
                            ? t(
                                "نتيجة اختبار حيوي معلقة",
                                "Pending biological test result",
                              )
                            : t(
                                "نتيجة اختبار تحتاج مراجعة",
                                "Test result needs review",
                              )}
                    </h3>
                    <p>
                      {n.cycle
                        ? `${t("جهاز", "Device")} ${devCode(n.cycle.device_id)} · #${n.cycle.machine_number}`
                        : `${t("جهاز", "Device")} ${devCode(n.test.device_id)} · ${time(n.test.created_at)}`}
                    </p>
                    <div className="row">
                      <button
                        className="secondary"
                        onClick={() =>
                          run(async () => {
                            await action("read_notification", branch, {
                              event_key: n.key,
                            });
                            if (n.cycle)
                              openCycle(
                                n.cycle,
                                n.cycle.workflow === "submitted",
                              );
                            else go(n.page);
                          }, false)
                        }
                      >
                        {t("فتح السجل", "Open record")}
                      </button>
                      <button
                        className="text-button"
                        disabled={!!receipt?.acknowledged_at || loading}
                        onClick={() =>
                          run(
                            () =>
                              action("read_notification", branch, {
                                event_key: n.key,
                                acknowledge: true,
                              }),
                            false,
                          )
                        }
                      >
                        {receipt?.acknowledged_at
                          ? t("تم تأكيد الاطلاع", "Acknowledged")
                          : t("تأكيد الاطلاع", "Acknowledge")}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
            {!list.length && (
              <div className="empty">
                <Bell size={28} />
                <p>
                  {t(
                    "لا توجد إشعارات ضمن هذا التصنيف.",
                    "No notifications in this filter.",
                  )}
                </p>
              </div>
            )}
          </div>
        </>
      );
    }
    if (page === "sets") {
      const items = cycles.flatMap((c) =>
        (c.payload.items || []).map((x) => ({ ...x, cycle: c })),
      );
      return (
        <>
          {title("الأطقم والقبضات", "Sets & handpieces")}
          <div className="help">
            {t(
              "هذه قائمة مستخرجة من حمولات السجلات؛ اكتب معرّف الطقم أو القبضة عند الإدخال لتسهيل تتبعه.",
              "This list comes from recorded loads. Enter set or handpiece IDs during cycle entry for traceability.",
            )}
          </div>
          <label>
            {t("بحث بالاسم أو المعرّف", "Search name or ID")}
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <section className="panel">
            {items
              .filter((x) =>
                (x.name + " " + x.identifiers)
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((x, i) => (
                <button
                  className="cycle-row"
                  key={x.cycle.id + i}
                  onClick={() => openCycle(x.cycle)}
                >
                  <span>
                    {x.name} × {x.quantity}
                    <small>{x.identifiers}</small>
                  </span>
                  <span>#{x.cycle.machine_number}</span>
                  {badge(x.cycle)}
                </button>
              ))}
            {!items.length && (
              <p className="hint">
                {t(
                  "تظهر العناصر بعد تسجيلها في الحمولات.",
                  "Items appear after they are recorded in loads.",
                )}
              </p>
            )}
          </section>
        </>
      );
    }
    if (page === "reports")
      return (
        <Reports
          cycles={cycles}
          branch={activeBranch}
          t={t}
          devCode={devCode}
          state={state}
        />
      );
    if (page === "users")
      return (
        <>
          {title("المستخدمون والصلاحيات", "Users & permissions")}
          <div className="help">
            <Users size={18} />
            {t(
              "لكل موظف حساب شخصي باسم كامل. ربط الحساب بالفرع يحدد السجلات التي يراها؛ لا تكتب أسماء الموظفين نيابة عنهم داخل الدورات.",
              "Each staff member has a personal account and full name. Branch membership controls records they can see. Do not type staff names on their behalf in cycle records.",
            )}
          </div>
          {me.profile.system_admin ? (
            <>
              <section className="panel">
                <h2>
                  {t(
                    "ربط موظف بفرع ودور",
                    "Assign a staff member to a branch and role",
                  )}
                </h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => action("assign_member", branch, formData(e)));
                  }}
                >
                  <div className="fields">
                    <label>
                      {t("الموظف", "Staff member")}
                      <select name="user_id" required>
                        <option value="">—</option>
                        {data.profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("الدور في الفرع الحالي", "Role in current branch")}
                      <select name="role">
                        {["operator", "reviewer", "branch_admin", "viewer"].map(
                          (r) => (
                            <option key={r} value={r}>
                              {roleName(r)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>
                  <button className="primary" disabled={loading}>
                    {t("حفظ الصلاحية", "Save permission")}
                  </button>
                </form>
              </section>
              <section className="panel">
                {data.profiles.map((p) => (
                  <div className="list-line" key={p.id}>
                    <span>
                      {p.full_name}
                      <small>
                        {p.system_admin
                          ? t("مسؤول عام", "System administrator")
                          : ""}
                      </small>
                    </span>
                    <span>
                      {data.memberships
                        .filter((m) => m.user_id === p.id)
                        .map((m) => `${m.branch_id} · ${m.role}`)
                        .join(" / ")}
                    </span>
                  </div>
                ))}
              </section>
            </>
          ) : (
            <section className="panel">
              <h2>{me.profile.full_name}</h2>
              <p>{roleName(role)}</p>
              <p>
                {t(
                  "إدارة ربط الموظفين متاحة للمسؤول العام.",
                  "Staff assignment is available to the system administrator.",
                )}
              </p>
            </section>
          )}
        </>
      );
    if (page === "audit")
      return (
        <>
          {title("سجل التدقيق", "Audit trail")}
          <section className="panel">
            {data.audit_events
              .slice()
              .sort((a, b) => b.id - a.id)
              .map((x) => (
                <div className="list-line" key={x.id}>
                  <span>
                    {x.action}
                    <small>{x.actor_name}</small>
                    <small>{x.detail.reason}</small>
                  </span>
                  <span className="hint">{time(x.created_at)}</span>
                </div>
              ))}
            {!data.audit_events.length && (
              <p className="hint">
                {t(
                  "تظهر الإجراءات هنا بعد بدء العمل.",
                  "Actions appear here once work starts.",
                )}
              </p>
            )}
          </section>
        </>
      );
    return (
      <>
        {title("دليل استخدام النظام", "System user guide")}
        <section className="panel">
          <h2>{t("من البداية إلى الاعتماد", "From entry to approval")}</h2>
          <ol>
            {[
              t(
                "سجل الدخول بحسابك واختر فرعك المصرح.",
                "Sign in with your personal account and select an authorized branch.",
              ),
              t(
                "أضف الدورة على الجهاز الصحيح مع رقمه الحقيقي.",
                "Create the cycle for the correct device using its actual machine cycle number.",
              ),
              t(
                "سجل أنواع الحمولات وكمياتها وعدد العبوات، ثم القراءات والفحوص.",
                "Record load items, quantities, package count, actual readings and checks.",
              ),
              t(
                "أرفق التقرير واحفظ مسودة أو أرسل للمراجع.",
                "Attach the printout and save a draft or submit to review.",
              ),
              t(
                "المراجع المخول الآخر يتحقق من الأدلة ثم يوثق القرار.",
                "Another authorized reviewer verifies evidence and records the decision.",
              ),
            ].map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>
          <button
            className="secondary"
            onClick={() => {
              setTour(0);
              go("home");
            }}
          >
            <HelpCircle size={17} />
            {t("بدء جولة النظام", "Start system tour")}
          </button>
        </section>
        <section className="panel">
          <h2>{t("دليل الرموز", "Code guide")}</h2>
          {[
            ["M", "المراقبة الميكانيكية", "Mechanical monitoring"],
            [
              "C",
              "مؤشر الحمولة الكيميائي المنفصل؛ لا يغني عن مؤشر كل عبوة",
              "Separate load chemical indicator; does not replace each pack’s indicator",
            ],
            ["D", "الجفاف وسلامة التغليف", "Dryness and packaging integrity"],
            ["P / F", "مقبول / غير مقبول", "Acceptable / Unacceptable"],
            [
              "NA",
              "لا ينطبق لـ C وفق السياسة المعتمدة مع السبب",
              "C not applicable under approved policy, with a reason",
            ],
            [
              "R / H / X",
              "معتمدة للاستخدام / قيد الحجز / مرفوضة",
              "Approved for use / Held / Rejected",
            ],
          ].map(([k, a, b]) => (
            <div className="list-line" key={k}>
              <b dir="ltr">{k}</b>
              <span>{t(a, b)}</span>
            </div>
          ))}
        </section>
        <section className="panel">
          <h2>{t("الحسابات والفروع", "Accounts and branches")}</h2>
          <p>
            {t(
              "اسم المُدخل يسجل من حسابه ولا يمكن تعديله من نموذج الدورة. اسم المراجع يسجل عند قراره. مسؤول النظام يربط الموظفين ببريدة أو عنيزة؛ الموظف يرى الفروع المصرح بها فقط.",
              "Operator identity is taken from the account and cannot be edited in the cycle form. Reviewer identity is recorded with the decision. The administrator assigns staff to Buraydah or Unayzah; staff see only authorized branches.",
            )}
          </p>
        </section>
      </>
    );
  }
  if (!ready)
    return (
      <div className="boot">STERILOG · {t("جارٍ التحميل…", "Loading…")}</div>
    );
  const alert = message && (
    <div
      className={`feedback ${message.kind}`}
      role={message.kind === "error" ? "alert" : "status"}
    >
      <Info size={18} />
      <span>{message.text}</span>
      <button onClick={() => setMessage(null)} aria-label={t("إغلاق", "Close")}>
        <X size={18} />
      </button>
    </div>
  );
  if (!session || !me || recovery)
    return (
      <div className="login-layout">
        <div className="login-story">
          <img
            className="login-photo"
            src="/assets/cssd-department.png"
            alt={t(
              "صورة توضيحية لقسم تعقيم حديث وأجهزة تعقيم على سطح نظيف",
              "Illustrative modern sterilization department with clean counters and sterilizers",
            )}
            fetchPriority="high"
          />
          <div className="login-photo-shade" />
          <div className="photo-brand">
            <Brand />
          </div>
          <div className="hero-caption">
            <span className="hero-kicker">CENTRAL STERILIZATION</span>
            <h1>
              {t(
                "كل دورة،\nموثّقة بوضوح.",
                "Every cycle.\nClearly documented.",
              )}
            </h1>
            <p>
              {t(
                "من تسجيل الحمولة إلى المراجعة والاعتماد، تفاصيل العمل أمامك في مكان واحد.",
                "From load entry to review and approval, your daily records together in one place.",
              )}
            </p>
            <div className="hero-locations">
              <span>{t("بريدة", "Buraydah")}</span>
              <span>{t("عنيزة", "Unayzah")}</span>
            </div>
          </div>
        </div>
        <main className="login-main">
          <button
            className="secondary language"
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
          >
            <Languages size={17} />
            {lang === "ar" ? "English" : "العربية"}
          </button>
          <div className="login-panel">
            <div className="login-brand">
              <Brand />
            </div>
            <span className="login-intro">
              {t("بوابتك إلى سجل تعقيم منظّم", "YOUR STERILIZATION WORKSPACE")}
            </span>
            <h2>
              {recovery
                ? t("تعيين كلمة مرور جديدة", "Set a new password")
                : t("أهلاً بعودتك", "Welcome back")}
            </h2>
            <p className="hint">
              {t(
                "ادخل بحسابك الشخصي؛ اسمك يسجل تلقائياً في السجلات.",
                "Use your personal account; your name is recorded automatically.",
              )}
            </p>
            {alert}
            {!configured && (
              <div className="setup-notice">
                <Info size={16} />
                <span>
                  {t(
                    "الواجهة جاهزة. يتاح تسجيل الدخول بعد إكمال ربط النظام.",
                    "The interface is ready. Sign-in becomes available once system setup is complete.",
                  )}
                </span>
              </div>
            )}
            {session && !me && !recovery ? (
              <>
                <p>
                  {t(
                    "جارٍ تحميل صلاحيات حسابك، أو يحتاج حسابك تفعيل المسؤول.",
                    "Loading your permissions, or your account needs administrator provisioning.",
                  )}
                </p>
                <button
                  className="secondary"
                  onClick={() => supabase.auth.signOut()}
                >
                  {t("تسجيل الخروج", "Sign out")}
                </button>
              </>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!configured) return;
                  const v = formData(e);
                  setLoading(true);
                  try {
                    const result = recovery
                      ? await supabase.auth.updateUser({ password: v.password })
                      : await supabase.auth.signInWithPassword({
                          email: v.email,
                          password: v.password,
                        });
                    if (result.error) throw result.error;
                    setRecovery(false);
                  } catch (e) {
                    error(e);
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {!recovery && (
                  <label>
                    {t("البريد الإلكتروني", "Email")}
                    <input
                      type="email"
                      name="email"
                      autoComplete="username"
                      placeholder="name@clinic.com"
                      dir="ltr"
                      disabled={!configured}
                      required
                    />
                  </label>
                )}
                <label>
                  {t("كلمة المرور", "Password")}
                  <input
                    type="password"
                    name="password"
                    autoComplete={
                      recovery ? "new-password" : "current-password"
                    }
                    minLength={recovery ? 12 : undefined}
                    placeholder="••••••••••••"
                    disabled={!configured}
                    required
                  />
                </label>
                <button className="primary" disabled={loading || !configured}>
                  {loading
                    ? t("جارٍ التحقق…", "Checking…")
                    : recovery
                      ? t("حفظ كلمة المرور", "Save password")
                      : t("تسجيل الدخول", "Sign in")}
                </button>
                {!recovery && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={!configured}
                    onClick={async (e) => {
                      const email = e.currentTarget.form.elements.email.value;
                      if (!email) {
                        setMessage({
                          kind: "error",
                          text: t(
                            "اكتب بريدك أولاً.",
                            "Enter your email first.",
                          ),
                        });
                        return;
                      }
                      const { error: err } =
                        await supabase.auth.resetPasswordForEmail(email, {
                          redirectTo: window.location.origin,
                        });
                      if (err) error(err);
                      else
                        setMessage({
                          kind: "success",
                          text: t(
                            "إذا كان البريد مسجلاً فستصلك تعليمات الاستعادة.",
                            "If the email is registered, recovery instructions will arrive.",
                          ),
                        });
                    }}
                  >
                    {t("نسيت كلمة المرور؟", "Forgot password?")}
                  </button>
                )}
              </form>
            )}
            <div className="branch-pills">
              <span>{t("تعقيم بريدة", "Buraydah CSSD")}</span>
              <span>{t("تعقيم عنيزة", "Unayzah CSSD")}</span>
            </div>
            <p className="hint">
              {t(
                "لا توجد حسابات مشتركة أو تسجيل عام. يفعّل المسؤول حساب كل موظف ويحدد فرعه.",
                "No shared accounts or public signup. The administrator provisions each staff member and branch.",
              )}
            </p>
          </div>
        </main>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <Brand />
        <div className="workspace">
          <span className="hint">{t("مساحة العمل", "Workspace")}</span>
          <strong>
            {t(activeBranch?.name_ar || "", activeBranch?.name_en || "")}
          </strong>
        </div>
        <nav aria-label={t("تبويبات النظام", "System navigation")}>
          {navigation
            .filter(([id]) => id !== "new" || canWrite)
            .map(([id, Icon, a, b]) => (
              <button
                key={id}
                className={page === id ? "active" : ""}
                onClick={() => go(id)}
                aria-current={page === id ? "page" : undefined}
              >
                <Icon size={18} />
                <span>{t(a, b)}</span>
                {id === "notifications" && unread > 0 && (
                  <b className="counter">{unread}</b>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-user">
          <span className="avatar">{me.profile.full_name.slice(0, 1)}</span>
          <div>
            <strong>{me.profile.full_name}</strong>
            <small>{roleName(role)}</small>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="row">
            <button
              className="icon-button mobile-toggle"
              onClick={() => setMobile(!mobile)}
              aria-label={t("فتح القائمة", "Open navigation")}
              aria-expanded={mobile}
            >
              <Menu size={21} />
            </button>
            <label className="branch-select">
              <span>{t("الفرع الحالي", "Current branch")}</span>
              <select
                value={branch}
                onChange={(e) => {
                  setBranch(e.target.value);
                  setPage("home");
                  setSelected("");
                  setEditor(null);
                  setQuery("");
                  setMessage(null);
                }}
              >
                {me.branches.map((b) => (
                  <option value={b.id} key={b.id}>
                    {t(b.name_ar, b.name_en)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row">
            <button
              className="secondary bell"
              onClick={() => go("notifications")}
            >
              <Bell size={18} />
              <span>{t("الإشعارات", "Notifications")}</span>
              {unread > 0 && <b className="counter">{unread}</b>}
            </button>
            <button
              className="text-button tour-button"
              onClick={() => {
                setTour(0);
                go("home");
              }}
            >
              <HelpCircle size={18} />
              <span>{t("جولة النظام", "Tour")}</span>
            </button>
            <button
              className="icon-button"
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              aria-label={t("التبديل إلى الإنجليزية", "Switch to Arabic")}
            >
              <Languages size={19} />
            </button>
            <button
              className="icon-button"
              onClick={() => supabase.auth.signOut()}
              aria-label={t("تسجيل الخروج", "Sign out")}
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>
        <main className="content" aria-busy={loading}>
          {alert}
          {loading && (
            <div className="loading-line" role="status">
              {t("جارٍ تحديث البيانات…", "Updating records…")}
            </div>
          )}
          {!branch ? (
            <div className="empty">
              {t(
                "لم يربط حسابك بفرع بعد. تواصل مع المسؤول.",
                "Your account has no branch assignment. Contact the administrator.",
              )}
            </div>
          ) : (
            <>
              {tour >= 0 && (
                <section className="tour-panel">
                  <div className="section-heading">
                    <span className="tag">
                      {t("جولة النظام", "System tour")} {tour + 1} /{" "}
                      {tourPages.length}
                    </span>
                    <button className="text-button" onClick={() => setTour(-1)}>
                      {t("إنهاء الجولة", "End tour")}
                      <X size={16} />
                    </button>
                  </div>
                  <p>{tourTexts[tour]}</p>
                  <div className="row">
                    <button
                      className="secondary"
                      disabled={tour === 0}
                      onClick={() => {
                        setTour(tour - 1);
                        go(tourPages[tour - 1]);
                      }}
                    >
                      {t("السابق", "Back")}
                    </button>
                    <button
                      className="primary"
                      onClick={() => {
                        if (tour === tourPages.length - 1) setTour(-1);
                        else {
                          setTour(tour + 1);
                          go(tourPages[tour + 1]);
                        }
                      }}
                    >
                      {tour === tourPages.length - 1
                        ? t("إنهاء", "Finish")
                        : t("التالي", "Next")}
                    </button>
                  </div>
                </section>
              )}
              {notifications.some((n) => n.level === "critical") &&
                page !== "notifications" && (
                  <div className="critical-banner">
                    <TriangleAlert size={20} />
                    <div>
                      <strong>
                        {t("تنبيه يحتاج متابعة", "An alert needs follow-up")}
                      </strong>
                      <p>
                        {t(
                          "توجد نتائج غير مقبولة أو حمولات غير معتمدة في سجلات الفرع.",
                          "Branch records contain unacceptable results or unapproved loads.",
                        )}
                      </p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => go("notifications")}
                    >
                      {t("عرض التنبيهات", "View alerts")}
                    </button>
                  </div>
                )}
              {content()}
            </>
          )}
          <footer className="app-footer">
            STERILOG ·{" "}
            {t(
              "التوقيت: السعودية · الأسماء من الحسابات الشخصية",
              "Timezone: Saudi Arabia · Identities from personal accounts",
            )}
            <button
              className="text-button"
              disabled={loading}
              onClick={() => run(reload, false)}
            >
              <RefreshCw size={14} />
              {t("تحديث", "Refresh")}
            </button>
          </footer>
        </main>
        <nav
          className="mobile-bottom"
          aria-label={t("التنقل السريع", "Quick navigation")}
        >
          {[
            ["home", LayoutDashboard, "الرئيسية", "Home"],
            ["cycles", List, "السجل", "Log"],
            [
              canWrite ? "new" : "review",
              canWrite ? PlusCircle : ClipboardCheck,
              canWrite ? "دورة جديدة" : "المراجعة",
              canWrite ? "New cycle" : "Review",
            ],
            ["notifications", Bell, "التنبيهات", "Alerts"],
          ].map(([id, Icon, a, b]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <Icon size={20} />
              <span>{t(a, b)}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <img
        className="brand-logo"
        src="/assets/sterilog-logo.png"
        alt="شعار نظام تعقيم — STERILOG"
        width="2048"
        height="683"
      />
      <span className="brand-project">
        تعقيم{" "}
        <span lang="en" dir="ltr">
          Taqeem
        </span>
      </span>
    </div>
  );
}
function Reports({ cycles, branch, t, devCode, state }) {
  const [from, setFrom] = useState(operatingDate()),
    [to, setTo] = useState(operatingDate());
  const rows = cycles.filter(
    (c) => c.operating_date >= from && c.operating_date <= to,
  );
  function download() {
    const header = [
      "Date / التاريخ",
      "Device / الجهاز",
      "Cycle / الدورة",
      "Load / الحمولة",
      "Packs / العبوات",
      "M",
      "C",
      "D",
      "Operator / المُدخل",
      "Reviewer / المراجع",
      "Status / الحالة",
      "Reason / السبب",
    ];
    const text =
      "\uFEFF" +
      [
        header,
        ...rows.map((c) => [
          c.operating_date,
          devCode(c.device_id),
          c.machine_number,
          c.payload.items?.map((i) => i.name + " × " + i.quantity).join(" / "),
          c.payload.packs,
          c.payload.M,
          c.payload.C,
          c.payload.D,
          c.operator_name,
          c.reviewer_name,
          state(c),
          c.reason,
        ]),
      ]
        .map((r) => r.map(csvCell).join(","))
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `sterilog-${branch.id}-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <header className="page-title">
        <div>
          <span className="eyebrow">{t(branch.name_ar, branch.name_en)}</span>
          <h1>{t("التقارير والطباعة", "Reports & printing")}</h1>
        </div>
      </header>
      <div className="panel report-controls">
        <div className="fields">
          <label>
            {t("من", "From")}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            {t("إلى", "To")}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <div className="row">
          <button className="primary" onClick={() => window.print()}>
            <Printer size={17} />
            {t("طباعة / حفظ PDF", "Print / save PDF")}
          </button>
          <button className="secondary" onClick={download}>
            <Download size={17} />
            CSV
          </button>
        </div>
      </div>
      <div className="panel print-report">
        <div className="report-heading">
          <h2>Sterilization cycle log / سجل دورات التعقيم</h2>
          <p>
            {branch.name_ar} / {branch.name_en} · {from} — {to}
          </p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "Date / التاريخ",
                  "Device / الجهاز",
                  "Cycle / الدورة",
                  "Load / الحمولة",
                  "Packs / العبوات",
                  "M / C / D",
                  "Operator / المُدخل",
                  "Reviewer / المراجع",
                  "Status / الحالة",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.operating_date}</td>
                  <td>{devCode(c.device_id)}</td>
                  <td>{c.machine_number}</td>
                  <td>
                    {c.payload.items
                      ?.map((i) => i.name + " × " + i.quantity)
                      .join(" / ")}
                  </td>
                  <td>{c.payload.packs}</td>
                  <td>
                    {c.payload.M || "—"} / {c.payload.C || "—"} /{" "}
                    {c.payload.D || "—"}
                  </td>
                  <td>{c.operator_name}</td>
                  <td>{c.reviewer_name || "—"}</td>
                  <td>
                    {state(c)}
                    {c.reason && <small>{c.reason}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div className="empty">
            {t(
              "لا توجد دورات في الفترة المحددة.",
              "No cycles in the selected period.",
            )}
          </div>
        )}
        <p className="hint">
          M: Mechanical / ميكانيكي · C: Load chemical / مؤشر الحمولة · D: Dry &
          intact / الجفاف والسلامة
        </p>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);

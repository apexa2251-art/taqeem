import React, { useEffect, useState, useRef } from "react";
import { api } from "./api";
const tasks = {
  receive: ["الاستلام والمطابقة", "Receive & match"],
  clean: ["التنظيف", "Clean"],
  inspect: ["التجفيف والفحص", "Dry & inspect"],
  pack: ["التغليف", "Package"],
  load: ["ربط الدورة والملصق", "Load & label"],
  approve: ["اعتماد الاستخدام", "Approve for use"],
  dispatch: ["تجهيز للاستلام", "Dispatch"],
  recall: ["الحجز والاستدعاء", "Hold & recall"],
  supervise: ["إدارة التكليف", "Supervise"],
};
const stages = {
  received: ["مستلم", "Received"],
  cleaned: ["تم التنظيف", "Cleaned"],
  inspected: ["تم التجفيف والفحص", "Inspected"],
  packed: ["مغلف", "Packaged"],
  loaded: ["مرتبط بدورة", "Linked to cycle"],
  ready: ["جاهز للاستلام", "Ready for collection"],
  collected: ["استلمته العيادة", "Collected"],
  held: ["محجوز", "Held"],
  recalled: ["مستدعى", "Recalled"],
};
const blank = {
  people: [],
  clinics: [],
  clinic_users: [],
  grants: [],
  boxes: [],
  templates: [],
  shipments: [],
  packages: [],
  assignments: [],
  handovers: [],
  settings: [],
  events: [],
};
export default function Tracking({
  branch,
  profile,
  cycles,
  devices,
  t,
  onError,
  onReload,
  profiles = [],
}) {
  const [data, setData] = useState(blank),
    [page, setPage] = useState("shipments"),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [printQr, setPrintQr] = useState(""),
    [rows, setRows] = useState([{ name: "", sent: 1 }]),
    [camera, setCamera] = useState(false),
    [status, setStatus] = useState("");
  const video = useRef(null),
    stream = useRef(null),
    scanTimer = useRef(null),
    generation = useRef(0),
    scanEpoch = useRef(0);
  async function reload() {
    const gen = ++generation.current;
    const d = await api("/tracking/" + branch);
    if (gen === generation.current) setData(d);
  }
  useEffect(() => {
    setData(blank);
    setSelected("");
    setSearch("");
    setStatus("");
    reload().catch(onError);
    return () => {
      generation.current++;
      stopCamera();
    };
  }, [branch]);
  function stopCamera() {
    scanEpoch.current++;
    stream.current?.getTracks().forEach((x) => x.stop());
    stream.current = null;
    clearInterval(scanTimer.current);
    setCamera(false);
  }
  async function scan() {
    try {
      if (!window.BarcodeDetector) {
        setStatus(
          t(
            "المسح غير مدعوم هنا؛ استخدم البحث اليدوي دائمًا.",
            "Camera scanning is unavailable; use manual search.",
          ),
        );
        return;
      }
      setCamera(true);
      const epoch = ++scanEpoch.current;
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (epoch !== scanEpoch.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      setTimeout(() => {
        if (!video.current) return;
        video.current.srcObject = stream.current;
        video.current.play();
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        scanTimer.current = setInterval(async () => {
          try {
            const r = await detector.detect(video.current);
            if (r[0]) {
              setSearch(r[0].rawValue.replace(/^TAQEEM:/, ""));
              stopCamera();
            }
          } catch {}
        }, 700);
      }, 100);
    } catch {
      stopCamera();
      setStatus(
        t(
          "تعذر فتح الكاميرا؛ أدخل الرمز يدويًا.",
          "Camera unavailable; enter the code manually.",
        ),
      );
    }
  }
  const grants = data.grants.filter(
    (g) =>
      g.user_id === profile.id &&
      g.active &&
      Date.parse(g.valid_until) > Date.now(),
  );
  const has = (task) => grants.some((g) => g.task === task);
  const admin = profile.system_admin,
    supervisor = has("supervise"),
    clinics = data.clinics.filter((c) =>
      data.clinic_users.some(
        (u) => u.user_id === profile.id && u.clinic_id === c.id,
      ),
    );
  const shipment = data.shipments.find((s) => s.id === selected),
    packs = data.packages.filter((p) => p.shipment_id === selected),
    setting = data.settings[0];
  async function run(op, input, after) {
    if (busy) return;
    setBusy(true);
    setStatus("");
    try {
      const r = await api("/tracking/" + branch, {
        method: "POST",
        body: JSON.stringify({ op, input }),
      });
      await reload();
      await onReload?.();
      setStatus(t("تم التوثيق بحسابك.", "Recorded under your account."));
      after?.(r);
      return r;
    } catch (e) {
      setStatus(errorText(e.message));
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  function errorText(code) {
    return (
      {
        QUALIFIED_DUTY_REQUIRED: t(
          "يلزم تخويل وتدريب ساريان وتكليف مناسب لموظفة العيادة.",
          "Valid qualification and appropriate assignment are required.",
        ),
        CLINIC_ACCESS_REQUIRED: t(
          "يلزم ربط حسابك بالعيادة.",
          "Your account must be linked to this clinic.",
        ),
        OVER_ALLOCATION: t(
          "الكمية تتجاوز المستلم المتاح بعد استبعاد التالف.",
          "Quantity exceeds available matched items.",
        ),
        APPROVAL_REQUIRED: t(
          "لا توجد موافقة استخدام صالحة لهذه المحاولة.",
          "This attempt does not have valid approval.",
        ),
        COLLECTION_BLOCKED: t(
          "الكيس غير جاهز أو محجوز أو انتهت صلاحيته.",
          "Package is not ready, held or expired.",
        ),
        EXCLUSIVE_CSSD_DUTY: t(
          "أنت مكلّفة بالتعقيم حصريًا خلال هذه الفترة.",
          "You have exclusive CSSD duty during this period.",
        ),
        ASSIGNMENT_OVERLAP: t(
          "يوجد تكليف متداخل.",
          "An overlapping assignment exists.",
        ),
        BOX_IN_USE: t(
          "الحافظة مستخدمة؛ وثّق إعادتها بعد المطابقة.",
          "Box in use; record its return after matching.",
        ),
        DIFFERENCE_REASON_REQUIRED: t(
          "اكتب سبب فرق الأعداد أو التالف.",
          "Explain count differences or damage.",
        ),
        SENDER_COLLECTION_REQUIRED: t(
          "تستلم الممرضة التي أرسلت الإرسالية بنفسها.",
          "The sending nurse must collect this shipment.",
        ),
        QUALIFICATION_REQUIRED: t(
          "التكليف لا يمنح التأهيل؛ تحقّق من التخويل وتاريخ انتهائه.",
          "Assignment does not grant competence; check qualification expiry.",
        ),
        ZONE_TASK_MISMATCH: t(
          "المهام لا تطابق المنطقة المختارة.",
          "Tasks do not match the selected zone.",
        ),
      }[code] || t("تعذر الإجراء: ", "Action blocked: ") + code
    );
  }
  const field = (name, label, type = "text", extra = {}) => (
    <label>
      {label}
      <input name={name} type={type} required {...extra} />
    </label>
  );
  const select = (name, label, items) => (
    <label>
      {label}
      <select
        name={name}
        required
        defaultValue={items.length === 1 ? items[0][0] : ""}
      >
        <option value="">{t("اختر", "Select")}</option>
        {items.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  const personOptions = data.people
    .filter((x) => x.active)
    .map((x) => [x.id, x.full_name]);
  const simpleForm = (title, op, children, convert = (x) => x) => (
    <details className="panel">
      <summary>{title}</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(
            op,
            convert(
              Object.fromEntries(new FormData(e.currentTarget)),
              new FormData(e.currentTarget),
            ),
          );
        }}
      >
        <div className="fields">{children}</div>
        <button disabled={busy}>{t("توثيق", "Record")}</button>
      </form>
    </details>
  );
  function labelFor(p) {
    const c = cycles.find((c) => c.id === p.cycle_id),
      d = devices.find((d) => d.id === c?.device_id);
    return (
      p.label_snapshot || {
        package: p.code,
        device: d?.code || "—",
        cycle: c?.machine_number || "—",
        date: c?.operating_date || "—",
        expiry: p.expiry_date || "—",
      }
    );
  }
  async function print(p) {
    const reason = window.prompt(
      t("سبب الطباعة / إعادة الطباعة", "Print / reprint reason"),
    );
    if (!reason) return;
    const r = await run("print", { id: p.id, reason });
    if (!r) return;
    const QR = await import("qrcode");
    const url = await QR.toDataURL("TAQEEM:" + p.code, { width: 200 });
    setPrintQr(url);
    setSelected(p.id);
  }
  return (
    <section className="tracking">
      <header>
        <h1>
          {t("استلام وتسليم وتتبع الأدوات", "Instrument handover & tracking")}
        </h1>
        <p>
          {t(
            "كل العمليات تعمل يدويًا دون طابعة أو قارئ. المسح والطباعة اختياريان.",
            "All operations work manually. Scanning and printing are optional.",
          )}
        </p>
      </header>
      <div className="tabs">
        {[
          ["shipments", "الإرساليات", "Shipments"],
          ["packages", "الأكياس والمعالجة", "Packages & processing"],
          ["duties", "التكليف وتسليم المهام", "Duty & handover"],
          ["setup", "الإعداد والتخويل", "Setup & qualification"],
          ["history", "التدقيق", "Audit"],
        ].map(([id, a, e]) => (
          <button
            key={id}
            className={page === id ? "active" : ""}
            onClick={() => {
              setPage(id);
              setSelected("");
            }}
          >
            {t(a, e)}
          </button>
        ))}
      </div>
      <p role="status">{status}</p>
      <div className="fields">
        <label>
          {t(
            "بحث برقم الإرسالية أو الكيس أو الحافظة",
            "Search shipment, package or box code",
          )}
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button onClick={scan}>
          {t("مسح QR بالكاميرا — اختياري", "Scan QR with camera — optional")}
        </button>
        <button onClick={() => reload().catch(onError)}>
          {t("تحديث", "Refresh")}
        </button>
      </div>
      {camera && (
        <div>
          <video ref={video} muted playsInline style={{ maxWidth: "100%" }} />
          <button onClick={stopCamera}>
            {t("إغلاق الكاميرا", "Close camera")}
          </button>
        </div>
      )}
      {page === "shipments" && (
        <>
          <details className="panel" open>
            <summary>
              {t("تسليم سريع من العيادة", "Quick clinic handover")}
            </summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const v = Object.fromEntries(new FormData(e.currentTarget));
                run("send", { box_id: v.box_id, items: rows }, (r) =>
                  setSelected(r.id),
                );
              }}
            >
              <div className="fields">
                {select(
                  "box_id",
                  t("الحافظة • العيادة • الطبيب", "Box • clinic • doctor"),
                  data.boxes
                    .filter((b) => clinics.some((c) => c.id === b.clinic_id))
                    .map((b) => {
                      const c = data.clinics.find((c) => c.id === b.clinic_id);
                      return [b.id, `${b.code} • ${c?.name} • ${c?.doctor}`];
                    }),
                )}
                <label>
                  {t("قائمة محفوظة — اختياري", "Saved list — optional")}
                  <select
                    onChange={(e) => {
                      const x = data.templates.find(
                        (x) => x.id === e.target.value,
                      );
                      if (x) setRows(x.items);
                    }}
                    defaultValue=""
                  >
                    <option value="">—</option>
                    {data.templates.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {rows.map((r, i) => (
                <div className="fields" key={i}>
                  <label>
                    {t("الطقم / الأداة", "Set / item")}
                    <input
                      required
                      value={r.name}
                      onChange={(e) =>
                        setRows(
                          rows.map((x, j) =>
                            j === i ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    {t("العدد المرسل", "Sent count")}
                    <input
                      required
                      type="number"
                      min="1"
                      step="1"
                      value={r.sent}
                      onChange={(e) =>
                        setRows(
                          rows.map((x, j) =>
                            j === i ? { ...x, sent: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={rows.length === 1}
                    onClick={() => setRows(rows.filter((_, j) => i !== j))}
                  >
                    {t("حذف السطر", "Remove row")}
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setRows([...rows, { name: "", sent: 1 }])}
              >
                {t("إضافة نوع", "Add item")}
              </button>
              <button disabled={busy || !clinics.length}>
                {t(
                  "تأكيد التسليم باسمي — لا يلزم انتظار المطابقة",
                  "Confirm handover — no need to wait for matching",
                )}
              </button>
            </form>
          </details>
          <div className="tracking-grid">
            {data.shipments
              .filter(
                (s) =>
                  !search ||
                  `${s.code} ${data.boxes.find((b) => b.id === s.box_id)?.code}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              )
              .map((s) => {
                const ps = data.packages.filter((p) => p.shipment_id === s.id),
                  ready = ps.filter((p) => p.stage === "ready").length,
                  done = ps.filter((p) => p.stage === "collected").length;
                return (
                  <button
                    className="panel"
                    key={s.id}
                    onClick={() => setSelected(s.id)}
                  >
                    <b>{s.code}</b>
                    <p>
                      {data.clinics.find((c) => c.id === s.clinic_id)?.name} •{" "}
                      {s.doctor_snapshot}
                    </p>
                    <p>
                      {s.sender_name} • {new Date(s.sent_at).toLocaleString()}
                    </p>
                    <span>
                      {s.received_at
                        ? t("تمت المطابقة", "Matched")
                        : t("بانتظار المطابقة", "Awaiting match")}
                    </span>
                    <p>
                      {t(
                        "جاهز / مستلم / متبقٍ",
                        "Ready / collected / remaining",
                      )}
                      : {ready} / {done} / {ps.length - done}
                    </p>
                    {!s.received_at &&
                      Date.now() > Date.parse(s.expected_at) && (
                        <b>
                          {t("متأخرة عن موعد المطابقة", "Matching overdue")}
                        </b>
                      )}
                  </button>
                );
              })}
          </div>
          {shipment && (
            <article className="panel">
              <h2>{shipment.code}</h2>
              <p>
                {t(
                  "المرسل والمستلم والتالف محفوظة بشكل منفصل.",
                  "Sent, received and damaged counts are retained separately.",
                )}
              </p>
              {!shipment.received_at ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    run("receive", {
                      id: shipment.id,
                      reason: fd.get("reason"),
                      received: shipment.items.map((x, i) => ({
                        name: x.name,
                        received: fd.get("r" + i),
                        damaged: fd.get("d" + i),
                      })),
                    });
                  }}
                >
                  {shipment.items.map((x, i) => (
                    <div className="fields" key={x.name}>
                      <b>
                        {x.name} — {t("مرسل", "Sent")} {x.sent}
                      </b>
                      {field(
                        "r" + i,
                        t("المستلم فعليًا", "Actually received"),
                        "number",
                        { min: 0, step: 1 },
                      )}
                      {field("d" + i, t("التالف", "Damaged"), "number", {
                        min: 0,
                        step: 1,
                        defaultValue: 0,
                      })}
                    </div>
                  ))}
                  {field(
                    "reason",
                    t(
                      "سبب الاستثناء عند وجود فرق أو تلف",
                      "Exception reason if counts differ / damage",
                    ),
                    "text",
                    { required: false },
                  )}
                  <button disabled={busy || !has("receive")}>
                    {t("توثيق المطابقة باسمي", "Record matching under my name")}
                  </button>
                </form>
              ) : (
                <>
                  <table>
                    <thead>
                      <tr>
                        <th>{t("الصنف", "Item")}</th>
                        <th>{t("مرسل", "Sent")}</th>
                        <th>{t("مستلم", "Received")}</th>
                        <th>{t("تالف", "Damaged")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipment.items.map((x) => {
                        const y = shipment.received.find(
                          (y) => y.name === x.name,
                        );
                        return (
                          <tr key={x.name}>
                            <td>{x.name}</td>
                            <td>{x.sent}</td>
                            <td>{y?.received}</td>
                            <td>{y?.damaged}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p>{shipment.reason}</p>
                  <button
                    disabled={busy || !has("receive")}
                    onClick={() => run("return_box", { id: shipment.id })}
                  >
                    {t(
                      "توثيق إعادة الحافظة — لا يعني تسليم الأكياس",
                      "Record box return — does not collect packages",
                    )}
                  </button>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const contents = shipment.received
                        .map((x, i) => ({
                          name: x.name,
                          quantity: Number(f.get("q" + i)),
                        }))
                        .filter((x) => x.quantity > 0);
                      run("package", { shipment_id: shipment.id, contents });
                    }}
                  >
                    <h3>
                      {t(
                        "إنشاء وحدة تتبع ستُغلف في كيس واحد",
                        "Create a tracking unit for one package",
                      )}
                    </h3>
                    {shipment.received.map((x, i) => (
                      <label key={x.name}>
                        {x.name}
                        <input
                          name={"q" + i}
                          type="number"
                          min="0"
                          step="1"
                          defaultValue="0"
                        />
                      </label>
                    ))}
                    <button disabled={busy || !has("receive")}>
                      {t(
                        "إنشاء رقم كيس — دون افتراض دورة",
                        "Create package ID — no assumed cycle",
                      )}
                    </button>
                  </form>
                </>
              )}
              <p>
                {t("الأكياس المنشأة", "Created packages")}:{" "}
                {packs.map((x) => x.code).join("، ") || "—"}
              </p>
            </article>
          )}
        </>
      )}
      {page === "packages" && (
        <div className="panel">
          <h2>{t("الدورات المرتبطة", "Linked cycles")}</h2>
          {cycles
            .filter((c) => data.packages.some((p) => p.cycle_id === c.id))
            .map((c) => (
              <div key={c.id}>
                <b>
                  {devices.find((d) => d.id === c.device_id)?.code} /{" "}
                  {c.machine_number}
                </b>
                <button
                  disabled={busy || c.workflow !== "draft"}
                  onClick={() => run("start_cycle", { id: c.id })}
                >
                  {t(
                    "توثيق بدء التشغيل بعد المطابقة والتعريف",
                    "Record start after matching & labelling",
                  )}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    const reason = window.prompt(
                      t(
                        "سبب استدعاء جميع أكياس الدورة",
                        "Reason to recall all packages in cycle",
                      ),
                    );
                    if (reason) run("recall_cycle", { id: c.id, reason });
                  }}
                >
                  {t(
                    "استدعاء جميع أكياس الدورة",
                    "Recall every package in this cycle",
                  )}
                </button>
              </div>
            ))}
        </div>
      )}
      {page === "packages" && (
        <div className="tracking-grid">
          {data.packages
            .filter(
              (p) =>
                !search || p.code.toLowerCase().includes(search.toLowerCase()),
            )
            .map((p) => {
              const s = data.shipments.find((s) => s.id === p.shipment_id),
                label = labelFor(p);
              return (
                <article className="panel" key={p.id}>
                  <h2>{p.code}</h2>
                  <b>{t(...stages[p.stage])}</b>
                  <p>
                    {s?.code} •{" "}
                    {data.clinics.find((c) => c.id === s?.clinic_id)?.name} •{" "}
                    {t("المحاولة", "Attempt")} {p.attempt}
                  </p>
                  <p>
                    {p.contents
                      .map((x) => `${x.name} × ${x.quantity}`)
                      .join("، ")}
                  </p>
                  <p>{p.recall_reason}</p>
                  {p.stage === "inspected" && (
                    <label>
                      {t(
                        "تاريخ انتهاء وفق السياسة فقط — اختياري",
                        "Policy-based expiry only — optional",
                      )}
                      <input type="date" id={"expiry-" + p.id} />
                    </label>
                  )}
                  {["received", "cleaned", "inspected"].includes(p.stage) && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(
                          {
                            received: "clean",
                            cleaned: "inspect",
                            inspected: "pack",
                          }[p.stage],
                          {
                            id: p.id,
                            ...(p.stage === "inspected"
                              ? {
                                  expiry_date:
                                    document.getElementById("expiry-" + p.id)
                                      ?.value || "",
                                }
                              : {}),
                          },
                        )
                      }
                    >
                      {p.stage === "received"
                        ? t("توثيق التنظيف باسمي", "Record cleaning")
                        : p.stage === "cleaned"
                          ? t(
                              "توثيق التجفيف والفحص باسمي",
                              "Record drying & inspection",
                            )
                          : t("توثيق التغليف باسمي", "Record packaging")}
                    </button>
                  )}
                  {p.stage === "packed" && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        run("load", {
                          id: p.id,
                          cycle_id: new FormData(e.currentTarget).get(
                            "cycle_id",
                          ),
                        });
                      }}
                    >
                      {select(
                        "cycle_id",
                        t(
                          "الدورة الحقيقية — أنشئ مسودة الدورة أولًا",
                          "Actual cycle — first create a cycle draft",
                        ),
                        cycles
                          .filter((c) => c.workflow === "draft" && c.program_id)
                          .map((c) => [
                            c.id,
                            `${devices.find((d) => d.id === c.device_id)?.code} / ${c.machine_number} / ${c.operating_date}`,
                          ]),
                      )}
                      <button disabled={busy}>
                        {t("ربط الكيس بالدورة", "Link package to cycle")}
                      </button>
                    </form>
                  )}
                  {p.cycle_id && (
                    <div className="tracking-label">
                      <p>
                        {t(
                          "انسخ على الكيس حسب تعليمات التغليف",
                          "Write on the package following packaging IFU",
                        )}
                      </p>
                      <b>{label.package}</b>
                      <p>
                        {t(
                          "الجهاز / الدورة / التاريخ / الانتهاء إن طبق",
                          "Device / cycle / date / expiry if applicable",
                        )}
                      </p>
                      <p dir="ltr">
                        {label.device} / {label.cycle} / {label.date} /{" "}
                        {label.expiry || "—"}
                      </p>
                      <p>
                        {t(
                          "السجل الإلكتروني لا يغني عن تعريف الكيس فعليًا.",
                          "Electronic records do not replace physical package identification.",
                        )}
                      </p>
                      {!p.label_confirmed && p.stage === "loaded" && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            run("confirm_label", { id: p.id, confirmed: true })
                          }
                        >
                          {t(
                            "أؤكد نقل البيانات إلى هذا الكيس",
                            "I confirm these identifiers are on this package",
                          )}
                        </button>
                      )}
                    </div>
                  )}
                  {p.stage === "loaded" && (
                    <button
                      disabled={busy}
                      onClick={() => run("ready", { id: p.id })}
                    >
                      {t(
                        "جاهز للاستلام — بعد اعتماد الدورة",
                        "Ready for collection — after cycle approval",
                      )}
                    </button>
                  )}
                  {p.stage === "ready" && (
                    <button
                      disabled={busy || s?.sender_id !== profile.id}
                      onClick={() => run("collect", { id: p.id })}
                    >
                      {t(
                        "تأكيد استلام هذا الكيس باسمي",
                        "Confirm my collection of this package",
                      )}
                    </button>
                  )}
                  {["hold", "recall", "reprocess"].map((op) => (
                    <details key={op}>
                      <summary>
                        {
                          {
                            hold: t("حجز", "Hold"),
                            recall: t("استدعاء", "Recall"),
                            reprocess: t("إعادة معالجة", "Reprocess"),
                          }[op]
                        }
                      </summary>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          run(op, {
                            id: p.id,
                            reason: f.get("reason"),
                            returned: f.get("returned") === "on",
                          });
                        }}
                      >
                        {field(
                          "reason",
                          t("السبب والإجراء", "Reason and action"),
                        )}
                        {op === "reprocess" && (
                          <label>
                            <input name="returned" type="checkbox" />
                            {t(
                              "تم استرجاع الكيس المستدعى فعليًا",
                              "Recalled package physically returned",
                            )}
                          </label>
                        )}
                        <button disabled={busy}>{t("توثيق", "Record")}</button>
                      </form>
                    </details>
                  ))}
                  {setting?.printing_enabled && (
                    <button
                      disabled={busy || !p.label_confirmed}
                      onClick={() => print(p)}
                    >
                      {t("طباعة / إعادة طباعة الملصق", "Print / reprint label")}
                    </button>
                  )}
                  {setting?.printing_enabled && selected === p.id && (
                    <div className="package-print">
                      <h2>{p.code}</h2>
                      <p>
                        {label.device} / {label.cycle} / {label.date} /{" "}
                        {label.expiry || "—"}
                      </p>
                      <p>
                        {t(
                          "لا تستخدم نسخة هذا الملصق لكيس آخر. تحقق من توافق الملصق والطابعة.",
                          "Never use copies for other packages. Verify label/printer compatibility.",
                        )}
                      </p>
                      <img
                        src={printQr}
                        alt={t("رمز الكيس", "Package QR")}
                        onLoad={() => window.print()}
                      />
                    </div>
                  )}
                </article>
              );
            })}
        </div>
      )}
      {page === "duties" && (
        <>
          {simpleForm(
            t("تكليف تغطية / مساعدة", "Coverage / assistance assignment"),
            "assignment",
            <>
              {select("user_id", t("الموظفة", "Staff member"), personOptions)}
              {select("kind", t("نوع التكليف", "Assignment type"), [
                ["coverage", t("تغطية الأوف", "Off-day coverage")],
                ["assistance", t("مساعدة وقت الضغط", "Pressure assistance")],
              ])}
              {field(
                "starts_at",
                t("من • توقيت الجهاز", "From • device local time"),
                "datetime-local",
              )}
              {field(
                "ends_at",
                t("إلى • توقيت الجهاز", "Until • device local time"),
                "datetime-local",
              )}
              {select("zone", t("المنطقة", "Zone"), [
                ["dirty", t("متسخة", "Dirty")],
                ["clean", t("نظيفة", "Clean")],
                ["sterilizer", t("أجهزة التعقيم", "Sterilizers")],
                [
                  "all",
                  t(
                    "تغطية جميع المناطق بالتتابع",
                    "Coverage across zones in sequence",
                  ),
                ],
              ])}
              <label>
                {t(
                  "المهام — يمكن اختيار أكثر من مهمة",
                  "Tasks — select one or more",
                )}
                <select name="tasks" multiple required>
                  {Object.entries(tasks).map(([v, l]) => (
                    <option key={v} value={v}>
                      {t(...l)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input type="checkbox" name="exclusive_duty" />
                {t(
                  "متفرغة حصريًا — إلزامي للتغطية",
                  "Exclusive duty — required for coverage",
                )}
              </label>
            </>,
            (v, fd) => ({
              ...v,
              starts_at: new Date(v.starts_at).toISOString(),
              ends_at: new Date(v.ends_at).toISOString(),
              tasks: fd.getAll("tasks"),
              exclusive_duty: v.exclusive_duty === "on",
            }),
          )}
          <p>
            {t(
              "التكليف لا يمنح صلاحيات؛ يلزم تدريب وتخويل ساريان لكل مهمة.",
              "Assignments do not grant permissions. Each task requires valid qualification.",
            )}
          </p>
          {data.assignments.map((a) => (
            <article className="panel" key={a.id}>
              <b>
                {data.people.find((p) => p.id === a.user_id)?.full_name ||
                  a.user_id}
              </b>
              <p>
                {a.kind === "coverage"
                  ? t("تغطية", "Coverage")
                  : t("مساعدة", "Assistance")}{" "}
                • {a.zone}
              </p>
              <p>
                {new Date(a.starts_at).toLocaleString()} —{" "}
                {new Date(a.ends_at).toLocaleString()}
              </p>
              <p>{a.tasks.map((x) => t(...tasks[x])).join("، ")}</p>
            </article>
          ))}
          {simpleForm(
            t("تسليم مهام غير مكتملة", "Handover unfinished work"),
            "handover",
            <>
              {select("to_id", t("إلى الموظفة", "To staff"), personOptions)}
              <label>
                {t(
                  "الأكياس ذات المهام المتبقية",
                  "Packages with unfinished work",
                )}
                <select name="package_ids" multiple required>
                  {data.packages
                    .filter((p) => p.stage !== "collected")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} • {t(...stages[p.stage])}
                      </option>
                    ))}
                </select>
              </label>
              {field(
                "note",
                t("المهام المتبقية والملاحظات", "Remaining tasks and notes"),
              )}
            </>,
            (v, fd) => ({
              ...v,
              package_ids: fd.getAll("package_ids"),
            }),
          )}
          {data.handovers.map((h) => (
            <article className="panel" key={h.id}>
              <p>{h.note}</p>
              <p>
                {h.package_ids
                  .map(
                    (id) => data.packages.find((p) => p.id === id)?.code || id,
                  )
                  .join("، ")}
              </p>
              {h.to_id === profile.id && !h.accepted_at && (
                <button onClick={() => run("accept_handover", { id: h.id })}>
                  {t("تأكيد استلام المهام", "Accept handover")}
                </button>
              )}
            </article>
          ))}
        </>
      )}
      {page === "setup" && (
        <>
          <p>
            {t(
              "الواقع المعتمد: بريدة ٤ أجهزة، عنيزة جهازان. لا تُوزع الأجهزة ذات السجل تلقائيًا.",
              "Inventory target: 4 Buraydah, 2 Unayzah. Devices with history are never automatically reassigned.",
            )}
          </p>
          {(admin || supervisor) && (
            <>
              {simpleForm(
                t("إضافة عيادة وطبيب", "Add clinic & doctor"),
                "clinic",
                <>
                  {field("name", t("العيادة", "Clinic"))}
                  {field("doctor", t("الطبيب", "Doctor"))}
                </>,
              )}
              {simpleForm(
                t("ربط ممرضة بالعيادة", "Link nurse to clinic"),
                "link_nurse",
                <>
                  {select("user_id", t("الموظفة", "Staff"), personOptions)}
                  {select(
                    "clinic_id",
                    t("العيادة", "Clinic"),
                    data.clinics.map((c) => [c.id, c.name + " • " + c.doctor]),
                  )}
                </>,
              )}
              {simpleForm(
                t("تعريف حافظة ثابتة", "Register fixed box"),
                "box",
                <>
                  {field("code", t("رقم الحافظة", "Box code"))}
                  {select(
                    "clinic_id",
                    t("العيادة", "Clinic"),
                    data.clinics.map((c) => [c.id, c.name]),
                  )}
                </>,
              )}
              {simpleForm(
                t("حفظ قائمة أطقم", "Save a set list"),
                "template",
                <>
                  {field("name", t("اسم القائمة", "List name"))}
                  <label>
                    {t(
                      "الصنف والعدد: سطر لكل صنف، مثال: طقم فحص,10",
                      "Item,count per line, e.g. Examination set,10",
                    )}
                    <textarea name="lines" required />
                  </label>
                </>,
                (v) => ({
                  name: v.name,
                  items: v.lines
                    .split("\n")
                    .filter(Boolean)
                    .map((l) => {
                      const [name, sent] = l.split(",");
                      return { name: name.trim(), sent: Number(sent) };
                    }),
                }),
              )}
            </>
          )}
          {admin && (
            <>
              {simpleForm(
                t(
                  "توثيق التدريب والتخويل — منفصل عن إدارة النظام",
                  "Record qualification — separate from system administration",
                ),
                "grant",
                <>
                  {select("user_id", t("الموظفة", "Staff"), personOptions)}
                  {select(
                    "task",
                    t("التخويل", "Authorization"),
                    Object.entries(tasks).map(([v, l]) => [v, t(...l)]),
                  )}
                  {field(
                    "training_ref",
                    t(
                      "مرجع التدريب واعتماد المخوّل",
                      "Training and authorization reference",
                    ),
                  )}
                  {field(
                    "valid_until",
                    t(
                      "ساري حتى • توقيت الجهاز",
                      "Valid until • device local time",
                    ),
                    "datetime-local",
                  )}
                </>,
                (v) => ({
                  ...v,
                  valid_until: new Date(v.valid_until).toISOString(),
                }),
              )}
              <button
                disabled={busy}
                onClick={() =>
                  run("settings", {
                    printing_enabled: !setting?.printing_enabled,
                  })
                }
              >
                {setting?.printing_enabled
                  ? t("تعطيل الطباعة", "Disable printing")
                  : t("تفعيل الطباعة الاختيارية", "Enable optional printing")}
              </button>
              <p>
                {t(
                  "الطباعة من المتصفح؛ توافق طابعة أو ملصق تعقيم فعلي لم يُختبر.",
                  "Browser printing only. Physical printer and sterilization-label compatibility are untested.",
                )}
              </p>
              {data.grants.map((g) => (
                <p key={g.id}>
                  {data.people.find((p) => p.id === g.user_id)?.full_name ||
                    g.user_id}{" "}
                  • {t(...tasks[g.task])} • {g.training_ref} •{" "}
                  {g.active ? t("فعّال", "Active") : t("ملغى", "Revoked")}{" "}
                  {g.active && (
                    <button
                      disabled={busy}
                      onClick={() => run("revoke_grant", { id: g.id })}
                    >
                      {t("إلغاء التخويل", "Revoke")}
                    </button>
                  )}
                </p>
              ))}
            </>
          )}
        </>
      )}
      {page === "history" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  t("الوقت", "Time"),
                  t("المنفذ", "Actor"),
                  t("الإجراء", "Action"),
                  t("المرجع والتفاصيل", "Reference & detail"),
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.events
                .slice()
                .reverse()
                .map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.created_at).toLocaleString()}</td>
                    <td>{e.actor_name}</td>
                    <td>{e.action}</td>
                    <td>
                      <details>
                        <summary>
                          {data.packages.find((p) => p.id === e.entity_id)
                            ?.code ||
                            data.shipments.find((s) => s.id === e.entity_id)
                              ?.code ||
                            e.entity_id}
                        </summary>
                        <pre dir="ltr">{JSON.stringify(e.detail, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

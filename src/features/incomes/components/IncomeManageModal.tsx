import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Pencil, Trash2, Lock, Info, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Timestamp, doc, getDoc, deleteDoc } from "firebase/firestore";
import { fbDb } from "../../../lib/firebase";

import type {
  IncomeFrequency,
  IncomeScope,
  IncomeRow,
} from "../api/incomes.service";

import { ConfirmModal } from "../../shared/components/ConfirmModal";
import { Popover } from "../../shared/components/Popover";
import { IncomeCreateModal } from "./IncomeCreateModal";
import type { IncomeInitial } from "./IncomeCreateModal";

import "./IncomeManageModal.css";

type UserLite = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  homeId: string | null;
};

type YtdLine = {
  incomeId: string;
  source: string;
  frequency: IncomeFrequency;
  amountCents: number;
  count: number;
  subtotalCents: number;
};

function toDate(ts: Timestamp) {
  return ts.toDate();
}

function freqLabel(freq: IncomeFrequency, t: (k: string) => string) {
  switch (freq) {
    case "once":
      return t("incomes.create.freq.once.label");
    case "monthly":
      return t("incomes.create.freq.monthly.label");
    case "quarterly":
      return t("incomes.create.freq.quarterly.label");
    case "yearly":
      return t("incomes.create.freq.yearly.label");
    default:
      return freq;
  }
}

function scopeLabel(scope: IncomeScope, t: (k: string) => string) {
  return scope === "shared"
    ? t("incomes.create.scope.shared")
    : t("incomes.create.scope.personal");
}

function formatEUR(cents: number, locale: string) {
  const resolved = locale.startsWith("en") ? "en-IE" : "es-ES";
  return (cents / 100).toLocaleString(resolved, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  });
}

function formatDateShort(d: Date, locale: string) {
  const resolved = locale.startsWith("en") ? "en-IE" : "es-ES";
  return d.toLocaleDateString(resolved, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

async function fetchUsersByUids(uids: string[]) {
  const unique = Array.from(new Set(uids)).filter(Boolean);
  const users = new Map<string, UserLite>();
  if (unique.length === 0) return users;

  await Promise.allSettled(
    unique.map(async (id) => {
      const ref = doc(fbDb, "users", id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;

      const data = snap.data() as Partial<UserLite>;
      users.set(id, {
        uid: id,
        displayName: data.displayName ?? null,
        email: data.email ?? null,
        photoURL: data.photoURL ?? null,
        homeId: (data.homeId as string | null | undefined) ?? null,
      });
    }),
  );

  return users;
}

function incomeDocRef(homeId: string, incomeId: string) {
  return doc(fbDb, "homes", homeId, "incomes", incomeId);
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function addMonthsClamped(d: Date, monthsToAdd: number) {
  const y0 = d.getFullYear();
  const m0 = d.getMonth();
  const target = new Date(y0, m0 + monthsToAdd, 1);

  const ty = target.getFullYear();
  const tm = target.getMonth();
  const day = Math.min(d.getDate(), daysInMonth(ty, tm));

  return new Date(ty, tm, day);
}

function nextOccurrence(d: Date, freq: IncomeFrequency) {
  switch (freq) {
    case "monthly":
      return addMonthsClamped(d, 1);
    case "quarterly":
      return addMonthsClamped(d, 3);
    case "yearly":
      return addMonthsClamped(d, 12);
    default:
      return d;
  }
}

function firstOnOrAfter(start: Date, target: Date, freq: IncomeFrequency) {
  if (start >= target) return start;

  const stepMonths =
    freq === "monthly"
      ? 1
      : freq === "quarterly"
        ? 3
        : freq === "yearly"
          ? 12
          : 0;
  if (stepMonths === 0) return start;

  const startY = start.getFullYear();
  const startM = start.getMonth();
  const targetY = target.getFullYear();
  const targetM = target.getMonth();

  const diffMonths = (targetY - startY) * 12 + (targetM - startM);
  const k = Math.floor(diffMonths / stepMonths) * stepMonths;
  let cur = addMonthsClamped(start, k);

  while (cur < target) {
    const next = addMonthsClamped(cur, stepMonths);
    if (next.getTime() === cur.getTime()) break;
    cur = next;
  }

  return cur;
}

export function IncomeManageModal(props: {
  open: boolean;
  onClose: () => void;
  homeId: string | null;
  currentUid: string;
  rows: IncomeRow[];
}) {
  const { open, onClose, homeId, currentUid, rows } = props;
  const { t, i18n } = useTranslation();

  const [usersMap, setUsersMap] = useState<Map<string, UserLite>>(new Map());
  const [usersLoading, setUsersLoading] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<IncomeRow | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editIncome, setEditIncome] = useState<IncomeInitial | null>(null);
  const [openEdit, setOpenEdit] = useState(false);

  const [openYtdInfo, setOpenYtdInfo] = useState(false);
  const [showYtdLines, setShowYtdLines] = useState(false);
  const ytdInfoBtnRef = useRef<HTMLButtonElement | null>(null);

  const uidsKey = useMemo(() => {
    const uids = rows.map((r) => r.createdByUid).filter(Boolean);
    uids.sort();
    return uids.join("|");
  }, [rows]);

  useEffect(() => {
    if (!open) {
      setOpenYtdInfo(false);
      setShowYtdLines(false);
    }
  }, [open]);

  useEffect(() => {
    if (!openYtdInfo) setShowYtdLines(false);
  }, [openYtdInfo]);

  useEffect(() => {
    if (!open) return;

    const scrollY = window.scrollY;

    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevWidth = document.body.style.width;

    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = prevWidth;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!homeId) return;

    const uids = uidsKey ? uidsKey.split("|") : [];
    let cancelled = false;

    setUsersMap(new Map());
    fetchUsersByUids(uids)
      .then((m) => {
        if (cancelled) return;
        setUsersMap(m);
      })
      .catch(() => {
        if (cancelled) return;
        setUsersMap(new Map());
      })
      .finally(() => {
        if (cancelled) return;
        setUsersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, homeId, uidsKey]);

  useLayoutEffect(() => {
    if (!open || !homeId) return;
    setUsersLoading(true);
  }, [open, homeId, uidsKey]);

  const oneOff = useMemo(
    () => rows.filter((r) => r.frequency === "once"),
    [rows],
  );

  const recurrentActive = useMemo(() => {
    const now = new Date();

    return rows.filter((r) => {
      if (r.frequency === "once") return false;

      const start = toDate(r.date);
      if (start > now) return false;

      if (!r.endDate) return true;
      const end = toDate(r.endDate);
      return end >= now;
    });
  }, [rows]);

  const recurrentSorted = useMemo(() => {
    const order: Record<IncomeFrequency, number> = {
      monthly: 0,
      quarterly: 1,
      yearly: 2,
      once: 99,
    };

    return [...recurrentActive].sort((a, b) => {
      const ao = order[a.frequency] ?? 50;
      const bo = order[b.frequency] ?? 50;
      if (ao !== bo) return ao - bo;

      const as = (a.source ?? "").toLowerCase();
      const bs = (b.source ?? "").toLowerCase();
      return as.localeCompare(bs);
    });
  }, [recurrentActive]);

  const year = new Date().getFullYear();

  const {
    ytdCents,
    runRateMonthlyCents,
    onceYtdCents,
    recurrentYtdCents,
    ytdLines,
  } = useMemo(() => {
    const now = new Date();
    const yearStart = new Date(year, 0, 1);

    let once = 0;
    let recurrentYtd = 0;
    let runRateMonthly = 0;

    const breakdown = new Map<string, YtdLine>();

    for (const r of rows) {
      const cents = r.amountCents ?? 0;
      if (cents <= 0) continue;

      if (r.frequency === "once") {
        const d = toDate(r.date);
        if (d.getFullYear() === year && d <= now) once += cents;
        continue;
      }

      const start = toDate(r.date);
      if (start > now) continue;

      const endLive = r.endDate ? toDate(r.endDate) : null;
      const isActiveNow = start <= now && (!endLive || endLive >= now);

      if (isActiveNow) {
        if (r.frequency === "monthly") runRateMonthly += cents;
        if (r.frequency === "quarterly")
          runRateMonthly += Math.round(cents / 3);
        if (r.frequency === "yearly") runRateMonthly += Math.round(cents / 12);
      }

      const end = endLive ?? now;
      const effectiveEnd = end < now ? end : now;

      let cur = firstOnOrAfter(start, yearStart, r.frequency);
      let guard = 0;

      while (cur <= effectiveEnd && guard < 500) {
        if (cur.getFullYear() === year) {
          recurrentYtd += cents;

          const prev = breakdown.get(r.id);
          if (!prev) {
            breakdown.set(r.id, {
              incomeId: r.id,
              source: r.source ?? "",
              frequency: r.frequency,
              amountCents: cents,
              count: 1,
              subtotalCents: cents,
            });
          } else {
            breakdown.set(r.id, {
              ...prev,
              count: prev.count + 1,
              subtotalCents: prev.subtotalCents + cents,
            });
          }
        }

        const nxt = nextOccurrence(cur, r.frequency);
        if (nxt.getTime() === cur.getTime()) break;
        cur = nxt;
        guard += 1;
      }
    }

    const ytdLines = Array.from(breakdown.values()).sort(
      (a, b) => b.subtotalCents - a.subtotalCents,
    );

    return {
      ytdCents: once + recurrentYtd,
      runRateMonthlyCents: runRateMonthly,
      onceYtdCents: once,
      recurrentYtdCents: recurrentYtd,
      ytdLines,
    };
  }, [rows, year]);

  function ownerText(uid: string) {
    if (uid === currentUid) return t("incomes.manage.you");
    const u = usersMap.get(uid);
    return u?.displayName || u?.email || uid.slice(0, 6);
  }

  function canEdit(r: IncomeRow) {
    return r.createdByUid === currentUid;
  }

  async function onDeleteConfirmed() {
    if (!confirmDelete || !homeId) return;

    try {
      setBusyDelete(true);
      setError(null);
      await deleteDoc(incomeDocRef(homeId, confirmDelete.id));
      setConfirmDelete(null);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : t("incomes.manage.deleteError"),
      );
    } finally {
      setBusyDelete(false);
    }
  }

  function closeAll() {
    setOpenYtdInfo(false);
    setShowYtdLines(false);
    onClose();
  }

  function closeYtdInfo() {
    setOpenYtdInfo(false);
    setShowYtdLines(false);
  }

  if (!open) return null;

  return (
    <div
      className="hmodal__backdrop hmodal__backdrop--income"
      role="dialog"
      aria-modal="true"
    >
      <div className="hmodal__panel imgr__panel">
        <div className="imgr__head">
          <div>
            <div className="imgr__title">
              {t("dashboard.cards.incomes.title")}
            </div>
            <div className="imgr__sub">
              {homeId && (usersLoading || usersMap.size === 0)
                ? t("incomes.manage.loadingUsers")
                : t("incomes.manage.subtitle")}
            </div>
          </div>

          <button
            className="imgr__close"
            onClick={closeAll}
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </div>

        <div className="imgr__body">
          {error && <div className="imgr__error">{error}</div>}

          <section
            className="imgr__summary"
            aria-label={t("incomes.manage.summary", "Resumen")}
          >
            <div className="imgr__summaryTitle">
              {t("incomes.manage.insights", "Resumen")}
            </div>

            <div className="imgr__stat imgr__stat--ytd">
              <div className="imgr__statTop">
                <div className="imgr__statLabel">
                  {t("incomes.manage.ytd", "Ganado en {{year}}", { year })}
                </div>

                <div className="imgr__statRight">
                  <div className="imgr__statHint">
                    {t("incomes.manage.prorated", "YTD real")}
                  </div>

                  <button
                    ref={ytdInfoBtnRef}
                    type="button"
                    className="imgr__infoBtn"
                    aria-label={t("common.info", "Info")}
                    title={t("common.info", "Info")}
                    aria-expanded={openYtdInfo}
                    onClick={() => setOpenYtdInfo((v) => !v)}
                  >
                    <Info
                      className="imgr__icon imgr__icon--info"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>

              <div className="imgr__statValue">
                {formatEUR(ytdCents, i18n.language)}
              </div>

              <div className="imgr__statBreakdown">
                <span>
                  {t("incomes.manage.recurrent", "Recurrente")}:{" "}
                  {formatEUR(recurrentYtdCents, i18n.language)}
                </span>
                <span className="imgr__dotSep">•</span>
                <span>
                  {t("incomes.manage.once", "Puntual")}:{" "}
                  {formatEUR(onceYtdCents, i18n.language)}
                </span>
              </div>
            </div>

            <div className="imgr__stat imgr__stat--runrate">
              <div className="imgr__statTop">
                <div className="imgr__statLabel">
                  {t("incomes.manage.runRate", "Ingreso recurrente")}
                </div>
                <div className="imgr__statHint">
                  {t("incomes.manage.perMonth", "/ mes")}
                </div>
              </div>

              <div className="imgr__statValue">
                {formatEUR(runRateMonthlyCents, i18n.language)}
              </div>

              <div className="imgr__statBreakdown">
                {t(
                  "incomes.manage.runRateHelp",
                  "Mensual + (Trimestral/3) + (Anual/12)",
                )}
              </div>
            </div>
          </section>

          {/* ===================== Recurrentes ===================== */}
          <section className="imgr__section">
            <div className="imgr__sectionTop">
              <div className="imgr__sectionTitle">
                {t("incomes.manage.recurrentTitle")}
              </div>
              <span className="imgr__count">{recurrentSorted.length}</span>
            </div>

            {recurrentSorted.length === 0 ? (
              <div className="imgr__empty">
                {t("incomes.manage.emptyRecurrent")}
              </div>
            ) : (
              <div className="imgr__list">
                {recurrentSorted.map((r) => (
                  <div key={r.id} className="imgr__row">
                    <div className="imgr__left">
                      <div className="imgr__source">{r.source}</div>

                      <div className="imgr__meta">
                        <span className="imgr__chip">
                          {freqLabel(r.frequency, (k) => t(k))}
                        </span>

                        <span className={`imgr__chip ${r.scope}`}>
                          {scopeLabel(r.scope, (k) => t(k))}
                        </span>

                        <span
                          className={`imgr__owner ${canEdit(r) ? "me" : "other"}`}
                        >
                          {canEdit(r) ? (
                            <>
                              <span
                                className="imgr__dot me"
                                aria-hidden="true"
                              />
                              <span className="imgr__ownerName">
                                {t("incomes.manage.you")}
                              </span>
                            </>
                          ) : (
                            <>
                              <span
                                className="imgr__dot other"
                                aria-hidden="true"
                              />
                              <span className="imgr__ownerName">
                                {ownerText(r.createdByUid)}
                              </span>
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="imgr__right">
                      <div className="imgr__amount">
                        {formatEUR(r.amountCents, i18n.language)}
                      </div>

                      {canEdit(r) ? (
                        <div
                          className="imgr__actions"
                          aria-label={t("incomes.manage.actions")}
                        >
                          <button
                            type="button"
                            className="imgr__iconBtn"
                            title={t("incomes.manage.edit")}
                            onClick={() => {
                              closeYtdInfo();
                              setEditIncome({
                                id: r.id,
                                amountCents: r.amountCents,
                                source: r.source,
                                frequency: r.frequency,
                                scope: r.scope,
                                date: r.date,
                                endDate: r.endDate,
                                groupId: r.groupId,
                                createdByUid: r.createdByUid,
                              });
                              setOpenEdit(true);
                            }}
                          >
                            <Pencil className="imgr__icon" aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            className="imgr__iconBtn danger"
                            title={t("incomes.manage.delete")}
                            onClick={() => {
                              closeYtdInfo();
                              setConfirmDelete(r);
                            }}
                          >
                            <Trash2 className="imgr__icon" aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <div
                          className="imgr__lockedHint"
                          title={t("incomes.manage.onlyYours")}
                        >
                          <Lock className="imgr__icon" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ===================== Puntuales ===================== */}
          <section className="imgr__section">
            <div className="imgr__sectionTop">
              <div className="imgr__sectionTitle">
                {t("incomes.manage.oneOffTitle")}
              </div>
              <span className="imgr__count">{oneOff.length}</span>
            </div>

            {oneOff.length === 0 ? (
              <div className="imgr__empty">
                {t("incomes.manage.emptyOneOff")}
              </div>
            ) : (
              <div className="imgr__list">
                {oneOff.map((r) => {
                  const d = toDate(r.date);
                  return (
                    <div key={r.id} className="imgr__row">
                      <div className="imgr__left">
                        <div className="imgr__source">{r.source}</div>

                        <div className="imgr__meta">
                          <span className={`imgr__chip ${r.scope}`}>
                            {scopeLabel(r.scope, (k) => t(k))}
                          </span>

                          <span className="imgr__dateText">
                            {formatDateShort(d, i18n.language)}
                          </span>

                          <span
                            className={`imgr__owner ${canEdit(r) ? "me" : "other"}`}
                          >
                            {canEdit(r) ? (
                              <>
                                <span
                                  className="imgr__dot me"
                                  aria-hidden="true"
                                />
                                <span className="imgr__ownerName">
                                  {t("incomes.manage.you")}
                                </span>
                              </>
                            ) : (
                              <>
                                <span
                                  className="imgr__dot other"
                                  aria-hidden="true"
                                />
                                <span className="imgr__ownerName">
                                  {ownerText(r.createdByUid)}
                                </span>
                              </>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="imgr__right">
                        <div className="imgr__amount">
                          {formatEUR(r.amountCents, i18n.language)}
                        </div>

                        {canEdit(r) ? (
                          <div
                            className="imgr__actions"
                            aria-label={t("incomes.manage.actions")}
                          >
                            <button
                              type="button"
                              className="imgr__iconBtn"
                              title={t("incomes.manage.edit")}
                              onClick={() => {
                                closeYtdInfo();
                                setEditIncome({
                                  id: r.id,
                                  amountCents: r.amountCents,
                                  source: r.source,
                                  frequency: r.frequency,
                                  scope: r.scope,
                                  date: r.date,
                                  endDate: r.endDate ?? null,
                                  groupId: r.groupId ?? null,
                                  createdByUid: r.createdByUid,
                                });
                                setOpenEdit(true);
                              }}
                            >
                              <Pencil
                                className="imgr__icon"
                                aria-hidden="true"
                              />
                            </button>

                            <button
                              type="button"
                              className="imgr__iconBtn danger"
                              title={t("incomes.manage.delete")}
                              onClick={() => {
                                closeYtdInfo();
                                setConfirmDelete(r);
                              }}
                            >
                              <Trash2
                                className="imgr__icon"
                                aria-hidden="true"
                              />
                            </button>
                          </div>
                        ) : (
                          <div
                            className="imgr__lockedHint"
                            title={t("incomes.manage.onlyYours")}
                          >
                            <Lock className="imgr__icon" aria-hidden="true" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ===================== YTD Popover ===================== */}
          <Popover
            open={openYtdInfo}
            anchorEl={ytdInfoBtnRef.current}
            onClose={closeYtdInfo}
            title={t("incomes.manage.ytdInfoTitle")}
            placement="top"
            align="end"
          >
            <div>
              <div>
                <b>{t("incomes.manage.ytdInfoWhat", { year })}</b>{" "}
                {t("incomes.manage.ytdInfoDesc")}
              </div>

              <div className="pop__hr" />

              <div>
                <b>{t("incomes.manage.ytdInfoOnceTitle")}</b>
                <div>{t("incomes.manage.ytdInfoOnceText", { year })}</div>

                <div className="pop__list" style={{ marginTop: 10 }}>
                  <div className="pop__row">
                    <span className="pop__k">
                      {t("incomes.manage.ytdInfoOnceSum")}
                    </span>
                    <span className="pop__v">
                      {formatEUR(onceYtdCents, i18n.language)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pop__hr" />

              <div>
                <b>{t("incomes.manage.ytdInfoRecTitle")}</b>
                <div style={{ marginTop: 6, opacity: 0.85 }}>
                  {t("incomes.manage.ytdInfoRecText")}
                </div>

                {ytdLines.length === 0 ? (
                  <div style={{ marginTop: 8, opacity: 0.75 }}>
                    {t("incomes.manage.ytdInfoNoRec")}
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="pop__toggle"
                      aria-expanded={showYtdLines}
                      onClick={() => setShowYtdLines((v) => !v)}
                      style={{ marginTop: 10 }}
                    >
                      <span className="pop__toggleLabel">
                        {t("incomes.manage.ytdInfoShowLines")}
                      </span>
                      <ChevronDown
                        className={`pop__chev ${showYtdLines ? "on" : ""}`}
                        aria-hidden="true"
                      />
                    </button>

                    {showYtdLines && (
                      <div className="pop__list" style={{ marginTop: 10 }}>
                        {ytdLines.map((x) => (
                          <div
                            key={x.incomeId}
                            className="pop__row pop__row--line"
                          >
                            <div className="pop__left">
                              <div className="pop__name">{x.source || "—"}</div>
                              <div className="pop__meta">
                                {freqLabel(x.frequency, (k) => t(k))} ·{" "}
                                {x.count} ×{" "}
                                {formatEUR(x.amountCents, i18n.language)}
                              </div>
                            </div>
                            <div className="pop__v">
                              {formatEUR(x.subtotalCents, i18n.language)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <div className="pop__list" style={{ marginTop: 10 }}>
                  <div className="pop__row">
                    <span className="pop__k">
                      {t("incomes.manage.ytdInfoRecSum")}
                    </span>
                    <span className="pop__v">
                      {formatEUR(recurrentYtdCents, i18n.language)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pop__hr" />

              <div className="pop__list">
                <div className="pop__row">
                  <span className="pop__k">
                    {t("incomes.manage.ytdInfoTotal")}
                  </span>
                  <span className="pop__v">
                    {formatEUR(ytdCents, i18n.language)}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 8, opacity: 0.75 }}>
                <code>{t("incomes.manage.ytdInfoFormula")}</code>
              </div>
            </div>
          </Popover>
        </div>

        <div className="imgr__footer">
          <button className="imgr__btn ghost imgr__btnClose" onClick={closeAll}>
            {t("common.close")}
          </button>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          open={!!confirmDelete}
          title={t("incomes.manage.deleteTitle")}
          description={
            <div>
              {t("incomes.manage.deleteDesc")}{" "}
              <strong>{confirmDelete.source}</strong> ·{" "}
              <strong>
                {formatEUR(confirmDelete.amountCents, i18n.language)}
              </strong>
            </div>
          }
          confirmText={t("incomes.manage.delete")}
          cancelText={t("common.cancel")}
          danger
          busy={busyDelete}
          onClose={() => setConfirmDelete(null)}
          onConfirm={onDeleteConfirmed}
        />
      )}

      {/* Edit */}
      {openEdit && editIncome && (
        <IncomeCreateModal
          open={openEdit}
          onClose={() => {
            setOpenEdit(false);
            setEditIncome(null);
          }}
          homeId={homeId}
          currentUid={currentUid}
          initialIncome={editIncome}
        />
      )}
    </div>
  );
}

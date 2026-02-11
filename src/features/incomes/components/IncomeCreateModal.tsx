import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { IncomeFrequency, IncomeScope } from "../api/incomes.service";
import { addIncome, updateIncome } from "../api/incomes.service";

import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { es } from "date-fns/locale";
import { format, parseISO } from "date-fns";

import type { Timestamp } from "firebase/firestore";

import "./IncomeCreateModal.css";

type TimestampLike = { toDate: () => Date };
function isTimestampLike(v: unknown): v is TimestampLike {
  return (
    typeof v === "object" &&
    v !== null &&
    "toDate" in v &&
    typeof (v as { toDate?: unknown }).toDate === "function"
  );
}

function toISODate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function dateFromIncomeDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (isTimestampLike(v)) return v.toDate();
  if (typeof v === "string" || typeof v === "number") {
    const parsed = new Date(v);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export type IncomeInitial = {
  id: string;
  amountCents: number;
  source: string;
  frequency: IncomeFrequency;
  scope: IncomeScope;
  date: Timestamp | Date | string;
  createdByUid: string;
};

export function IncomeCreateModal(props: {
  open: boolean;
  onClose: () => void;
  homeId: string | null;
  currentUid: string;
  initialIncome?: IncomeInitial | null;
}) {
  const { open, onClose, homeId, currentUid, initialIncome } = props;
  const { t } = useTranslation();

  const isEdit = !!initialIncome;

  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("");
  const [frequency, setFrequency] = useState<IncomeFrequency>("monthly");
  const [scope, setScope] = useState<IncomeScope>("shared");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- custom select state ---
  const freqBtnRef = useRef<HTMLButtonElement | null>(null);
  const freqWrapRef = useRef<HTMLDivElement | null>(null);
  const [freqOpen, setFreqOpen] = useState(false);

  // --- custom date state ---
  const [dateOpen, setDateOpen] = useState(false);
  const dateWrapRef = useRef<HTMLDivElement | null>(null);
  const datePopRef = useRef<HTMLDivElement | null>(null);
  const [datePopStyle, setDatePopStyle] = useState<React.CSSProperties>({});

  // --- scope attention (flash + focus) ---
  const scopeRef = useRef<HTMLDivElement | null>(null);
  const [scopeFlash, setScopeFlash] = useState(false);

  // --- mobile detection ---
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 560px)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 560px)");
    const onChange = (e?: MediaQueryListEvent) => {
      setIsMobile(e?.matches ?? mq.matches);
    };
    onChange();
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  const frequencyOptions: Array<{ value: IncomeFrequency; label: string; sub?: string }> = [
    { value: "once", label: t("incomes.create.freq.once.label"), sub: t("incomes.create.freq.once.sub") },
    { value: "monthly", label: t("incomes.create.freq.monthly.label"), sub: t("incomes.create.freq.monthly.sub") },
    { value: "quarterly", label: t("incomes.create.freq.quarterly.label"), sub: t("incomes.create.freq.quarterly.sub") },
    { value: "yearly", label: t("incomes.create.freq.yearly.label"), sub: t("incomes.create.freq.yearly.sub") },
  ];

  const selectedFreq =
    frequencyOptions.find((o) => o.value === frequency) ?? frequencyOptions[1];

  useEffect(() => {
    if (!open) return;

    setBusy(false);
    setError(null);
    setFreqOpen(false);
    setDateOpen(false);

    if (initialIncome) {
      const d = dateFromIncomeDate(initialIncome.date) ?? new Date();
      setAmount(String((initialIncome.amountCents ?? 0) / 100).replace(".", ","));
      setSource(initialIncome.source ?? "");
      setFrequency(initialIncome.frequency ?? "monthly");
      setScope(initialIncome.scope ?? "shared");
      setDate(toISODate(d));
      return;
    }

    setAmount("");
    setSource("");
    setFrequency("monthly");
    setScope("shared");
    setDate(new Date().toISOString().slice(0, 10));
  }, [open, initialIncome]);

  useEffect(() => {
    if (!freqOpen) return;

    function onDocDown(e: PointerEvent) {
      const tNode = e.target as Node;
      if (freqWrapRef.current?.contains(tNode)) return;
      setFreqOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setFreqOpen(false);
    }

    document.addEventListener("pointerdown", onDocDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("pointerdown", onDocDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [freqOpen]);

  useEffect(() => {
    if (!dateOpen) return;
    if (isMobile) return;

    function place() {
      const wrap = dateWrapRef.current;
      const pop = datePopRef.current;
      if (!wrap || !pop) return;

      const rect = wrap.getBoundingClientRect();
      const margin = 12;
      const gap = 8;
      const targetW = Math.min(rect.width, 360);

      let style: React.CSSProperties = {
        position: "absolute",
        right: 0,
        width: targetW,
        top: `calc(100% + ${gap}px)`,
      };

      const popH = pop.offsetHeight;
      const wouldBottomCut = rect.bottom + gap + popH > window.innerHeight - margin;
      if (wouldBottomCut) {
        style = {
          position: "absolute",
          right: 0,
          width: targetW,
          bottom: `calc(100% + ${gap}px)`,
        };
      }

      setDatePopStyle(style);
    }

    function onDocDown(e: PointerEvent) {
      const target = e.target as Node;
      if (dateWrapRef.current?.contains(target)) return;
      if (datePopRef.current?.contains(target)) return;
      setDateOpen(false);
    }

    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setDateOpen(false);
    }

    requestAnimationFrame(place);
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", onDocDown);
    document.addEventListener("keydown", onEsc);

    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", onDocDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [dateOpen, isMobile]);

  useEffect(() => {
    if (frequency !== "once") setScope("shared");
  }, [frequency]);

  useEffect(() => {
    if (frequency !== "once") return;

    setScopeFlash(true);
    const tid = window.setTimeout(() => setScopeFlash(false), 700);

    requestAnimationFrame(() => {
      scopeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      scopeRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    });

    return () => window.clearTimeout(tid);
  }, [frequency]);

  const selectedDateObj = useMemo(() => parseISO(date), [date]);
  const dateLabel = useMemo(() => format(selectedDateObj, "dd/MM/yyyy"), [selectedDateObj]);

  const [month, setMonth] = useState<Date>(() => selectedDateObj);
  useEffect(() => {
    if (!dateOpen) return;
    setMonth(selectedDateObj);
  }, [dateOpen, selectedDateObj]);

  const amountCents = useMemo(() => {
    const normalized = amount.replace(",", ".").trim();
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round(value * 100);
  }, [amount]);

  const canEditThis = useMemo(() => {
    if (!initialIncome) return true;
    return initialIncome.createdByUid === currentUid;
  }, [initialIncome, currentUid]);

   useEffect(() => {
    if (!canEditThis) {
      setFreqOpen(false);
      setDateOpen(false);
    }
  }, [canEditThis]);

  const canSave =
    !!homeId && !!amountCents && source.trim().length >= 2 && !busy && canEditThis;

  const scopeLabel =
    scope === "shared" ? t("incomes.create.scope.shared") : t("incomes.create.scope.personal");

  const saveLabel = busy
    ? t("incomes.create.saving")
    : frequency === "once"
      ? `${isEdit ? t("incomes.edit.save") : t("incomes.create.save")} · ${scopeLabel}`
      : isEdit
        ? t("incomes.edit.save")
        : t("incomes.create.save");

  async function onSave() {
    if (!canSave || !homeId || !amountCents) return;
    if (initialIncome && !canEditThis) return;

    try {
      setBusy(true);
      setError(null);

      const payload = {
        homeId,
        amountCents,
        source,
        frequency,
        scope,
        date: new Date(date + "T00:00:00"),
      };

      if (initialIncome) {
        await updateIncome({
          ...payload,
          incomeId: initialIncome.id,
        });
      } else {
        await addIncome({
          ...payload,
          createdByUid: currentUid,
        });
      }

      onClose();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t("incomes.create.errors.saveFailed");
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="hmodal__backdrop hmodal__backdrop--incomeCreate" role="dialog" aria-modal="true">
      <div className="hmodal__panel">
        <div className="imodal__head">
          <div>
            <div className="imodal__title">
              {initialIncome ? t("incomes.edit.title") : t("incomes.create.title")}
            </div>
            <div className="imodal__sub">
              {initialIncome ? t("incomes.edit.subtitle") : t("incomes.create.subtitle")}
            </div>
          </div>
          <button className="imodal__close" onClick={onClose} aria-label={t("common.cancel")}>
            ✕
          </button>
        </div>

        <div className="imodal__body">
          {initialIncome && !canEditThis && (
            <div className="imodal__error">{t("incomes.edit.notAllowed")}</div>
          )}

          <label className="imodal__field">
            <span>{t("incomes.create.amountLabel")}</span>
            <input
              value={amount}
              disabled={!canEditThis}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder={t("incomes.create.amountPlaceholder")}
            />
          </label>

          <label className="imodal__field">
            <span>{t("incomes.create.sourceLabel")}</span>
            <input
              value={source}
              disabled={!canEditThis}
              onChange={(e) => setSource(e.target.value)}
              placeholder={t("incomes.create.sourcePlaceholder")}
            />
          </label>

          <div className="imodal__row">
            <label className="imodal__field">
              <span>{t("incomes.create.frequencyLabel")}</span>

              <div className="iselect" ref={freqWrapRef}>
                <button
                  ref={freqBtnRef}
                  type="button"
                  className="iselect__btn"
                  aria-haspopup="listbox"
                  disabled={!canEditThis}
                  aria-expanded={freqOpen}
                  onClick={() => {
                   if (!canEditThis) return;
                   setFreqOpen((v) => !v);
                  }}
                  onKeyDown={(e) => {
                    if (!canEditThis) return;
                    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setFreqOpen(true);
                    }
                  }}
                >
                  <div className="iselect__main">
                    <div className="iselect__label">{selectedFreq.label}</div>
                    {selectedFreq.sub && <div className="iselect__sub">{selectedFreq.sub}</div>}
                  </div>
                  <span className="iselect__chev" aria-hidden>
                    ▾
                  </span>
                </button>

                {freqOpen && (
                  <div className="iselect__menu" role="listbox" aria-label={t("incomes.create.frequencyLabel")}>
                    {frequencyOptions.map((opt) => {
                      const active = opt.value === frequency;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="option"
                          disabled={!canEditThis}
                          aria-selected={active}
                          className={`iselect__opt ${active ? "is-active" : ""}`}
                          onPointerDown={(e) => {
                            if (!canEditThis) return;
                            e.preventDefault();
                            e.stopPropagation();
                            setFrequency(opt.value);
                            setFreqOpen(false);
                            queueMicrotask(() => freqBtnRef.current?.focus());
                          }}
                        >
                          <div className="iselect__optTitle">{opt.label}</div>
                          {opt.sub && <div className="iselect__optSub">{opt.sub}</div>}
                          {active && <span className="iselect__tick">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </label>

            {/* Date picker */}
            <div className="imodal__field">
              <span>{t("incomes.create.dateLabel")}</span>

              <div className="idate" ref={dateWrapRef}>
                <button
                  type="button"
                  className="idate__btn"
                  aria-haspopup="dialog"
                  aria-expanded={dateOpen}
                  disabled={!canEditThis}
                  onClick={() => {
                    if (!canEditThis) return;
                    setDateOpen((v) => !v);
                  }}
                >
                  <span className="idate__value">{dateLabel}</span>
                  <span className="idate__icon" aria-hidden>
                    📅
                  </span>
                </button>

                {dateOpen &&
                  (isMobile ? (
                    <div
                      className="idateSheet__backdrop"
                      role="dialog"
                      aria-label={t("incomes.create.dateLabel")}
                      onClick={() => setDateOpen(false)}
                    >
                      <div className="idateSheet" onClick={(e) => e.stopPropagation()}>
                        <div className="idateSheet__head">
                          <div className="idateSheet__title">{t("incomes.create.dateLabel")}</div>
                          <button
                            type="button"
                            className="idateSheet__close"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDateOpen(false);
                            }}
                            aria-label={t("common.close")}
                          >
                            ✕
                          </button>
                        </div>

                        <DayPicker
                          mode="single"
                          selected={selectedDateObj}
                          month={month}
                          onMonthChange={setMonth}
                          onSelect={(d) => {
                            if (!canEditThis) return;
                            if (!d) return;
                            setDate(format(d, "yyyy-MM-dd"));
                            setMonth(d);
                            setDateOpen(false);
                          }}
                          locale={es}
                          weekStartsOn={1}
                          showOutsideDays
                        />

                        <div className="idateSheet__actions">
                          <button
                            type="button"
                            className="idate__action"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!canEditThis) return;
                              const today = new Date();
                              setDate(format(today, "yyyy-MM-dd"));
                              setMonth(today);
                              setDateOpen(false);
                            }}
                          >
                            {t("common.today")}
                          </button>

                          <button
                            type="button"
                            className="idate__action ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDateOpen(false);
                            }}
                          >
                            {t("common.close")}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      ref={datePopRef}
                      className="idate__pop"
                      style={datePopStyle}
                      role="dialog"
                      aria-label={t("incomes.create.dateLabel")}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <div className="idate__popHead">
                        <div className="idate__popTitle"></div>
                        <button
                          type="button"
                          className="idate__popClose"
                          onClick={() => setDateOpen(false)}
                          aria-label={t("common.close")}
                        >
                          ✕
                        </button>
                      </div>

                      <DayPicker
                        mode="single"
                        selected={selectedDateObj}
                        month={month}
                        onMonthChange={setMonth}
                        onSelect={(d) => {
                          if (!canEditThis) return;
                          if (!d) return;
                          setDate(format(d, "yyyy-MM-dd"));
                          setMonth(d);
                          setDateOpen(false);
                        }}
                        locale={es}
                        weekStartsOn={1}
                        showOutsideDays
                      />

                      <div className="idate__actions">
                        <button
                          type="button"
                          className="idate__action"
                          onClick={() => {
                            const today = new Date();
                            if (!canEditThis) return;
                            setDate(format(today, "yyyy-MM-dd"));
                            setMonth(today);
                            setDateOpen(false);
                          }}
                        >
                          {t("common.today")}
                        </button>
                        <button type="button" className="idate__action ghost" onClick={() => setDateOpen(false)}>
                          {t("common.close")}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {frequency === "once" && (
            <div
              ref={scopeRef}
              className={`iscope ${scopeFlash ? "is-flash" : ""}`}
              role="group"
              aria-label={t("incomes.create.scopeAria")}
            >
              <div className="iscope__top">
                <span className="iscope__label">{t("incomes.create.scopeLabel")}</span>
                <span className={`iscope__pill ${scope}`}>{scopeLabel}</span>
              </div>

              <div className="itoggle">
                <button
                  type="button"
                  className={`itoggle__opt ${scope === "shared" ? "is-active" : ""}`}
                  disabled={!canEditThis}
                  onClick={() => setScope("shared")}
                >
                  {t("incomes.create.scope.shared")}
                </button>

                <button
                  type="button"
                  className={`itoggle__opt ${scope === "personal" ? "is-active" : ""}`}
                  disabled={!canEditThis}
                  onClick={() => setScope("personal")}
                >
                  {t("incomes.create.scope.personal")}
                </button>
              </div>

              <div className="itoggle__hint">
                {scope === "shared" ? t("incomes.create.scope.sharedHint") : t("incomes.create.scope.personalHint")}
              </div>

              <div className="iscope__meta">{t("incomes.create.scopeMeta", { scope: scopeLabel })}</div>
            </div>
          )}

          {error && <div className="imodal__error">{error}</div>}
        </div>

        <div className="imodal__footer">
          <button className="imodal__btn ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button className="imodal__btn" onClick={onSave} disabled={!canSave}>
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

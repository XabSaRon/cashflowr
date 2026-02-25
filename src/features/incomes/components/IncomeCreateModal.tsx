import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { IncomeFrequency, IncomeScope } from "../api/incomes.service";
import {
  addIncome,
  overwriteIncome,
  splitIncomeChange,
} from "../api/incomes.service";

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

function normalizeAmountInput(raw: string) {
  return raw.replace(/\s/g, "").replace(",", ".");
}

function isValidAmountText(raw: string) {
  const v = normalizeAmountInput(raw);
  if (!v) return false;
  return /^(?:\d+)(?:\.\d{1,2})?$/.test(v);
}

function validateSource(source: string): "required" | "tooShort" | null {
  const s = source.trim();
  if (!s) return "required";
  if (s.length < 2) return "tooShort";
  return null;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function clampISODateMin(valueISO: string, minISO: string) {
  return valueISO < minISO ? minISO : valueISO;
}

export type IncomeInitial = {
  id: string;
  amountCents: number;
  source: string;
  frequency: IncomeFrequency;
  scope: IncomeScope;
  date: Timestamp | Date | string;
  endDate?: Timestamp | Date | string | null;
  groupId?: string | null;
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

  // --- custom date state (START date) ---
  const [dateOpen, setDateOpen] = useState(false);
  const dateWrapRef = useRef<HTMLDivElement | null>(null);
  const datePopRef = useRef<HTMLDivElement | null>(null);
  const [datePopStyle, setDatePopStyle] = useState<React.CSSProperties>({});

  // --- custom date state (END date) ---
  const [endOpen, setEndOpen] = useState(false);
  const endWrapRef = useRef<HTMLDivElement | null>(null);
  const endPopRef = useRef<HTMLDivElement | null>(null);
  const [endPopStyle, setEndPopStyle] = useState<React.CSSProperties>({});

  // --- scope attention (flash + focus) ---
  const scopeRef = useRef<HTMLDivElement | null>(null);
  const [scopeFlash, setScopeFlash] = useState(false);

  // --- mobile detection ---
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 560px)").matches;
  });

  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);

  const [stopEnabled, setStopEnabled] = useState(false);
  const [endDate, setEndDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const sourceErrHard = useMemo(() => validateSource(source), [source]);
  const [touched, setTouched] = useState<{ amount: boolean; source: boolean }>({
    amount: false,
    source: false,
  });

  const selectedDateObj = useMemo(() => parseISO(date), [date]);
  const dateLabel = useMemo(
    () => format(selectedDateObj, "dd/MM/yyyy"),
    [selectedDateObj],
  );

  const isRecurrent = frequency !== "once";
  const effectiveStartObj = useMemo(() => {
    return isRecurrent ? startOfMonth(selectedDateObj) : selectedDateObj;
  }, [isRecurrent, selectedDateObj]);

  const effectiveStartLabel = useMemo(
    () => format(effectiveStartObj, "dd/MM/yyyy"),
    [effectiveStartObj],
  );

  const minEndISO = useMemo(() => {
    // para recurrente, tu inicio efectivo es el 1 del mes
    return toISODate(effectiveStartObj);
  }, [effectiveStartObj]);

  const canEditThis = useMemo(() => {
    if (!initialIncome) return true;
    return initialIncome.createdByUid === currentUid;
  }, [initialIncome, currentUid]);

  const endDateISOClamped = useMemo(
    () => clampISODateMin(endDate, minEndISO),
    [endDate, minEndISO],
  );

  const selectedEndObj = useMemo(
    () => parseISO(endDateISOClamped),
    [endDateISOClamped],
  );
  const endDateLabel = useMemo(
    () => format(selectedEndObj, "dd/MM/yyyy"),
    [selectedEndObj],
  );

  // ✅ Helpers para que los botones del END date no “fallen” por propagación / cierre accidental
  const closeEnd = (e?: {
    preventDefault?: () => void;
    stopPropagation?: () => void;
  }) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setEndOpen(false);
  };

  const pickEndToday = (e?: {
    preventDefault?: () => void;
    stopPropagation?: () => void;
  }) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!canEditThis) return;

    const today = new Date();
    const iso = format(today, "yyyy-MM-dd");
    setEndDate(clampISODateMin(iso, minEndISO));
    setEndMonth(today);
    setEndOpen(false);
  };

  const endDateError = useMemo(() => {
    if (!isEdit) return null;
    if (!isRecurrent) return null;
    if (!stopEnabled) return null;
    if (!canEditThis) return null;

    const ed = parseISO(endDate);
    if (Number.isNaN(ed.getTime())) return t("common.invalidDate");
    if (endDate < minEndISO)
      return t("incomes.edit.endDateTooEarly", {
        date: format(parseISO(minEndISO), "dd/MM/yyyy"),
      });

    return null;
  }, [isEdit, isRecurrent, stopEnabled, canEditThis, endDate, minEndISO, t]);

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

  useEffect(() => {
    if (open) {
      setMounted(true);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => setShow(true));
      });
    } else {
      setShow(false);
      const tid = window.setTimeout(() => setMounted(false), 140);
      return () => window.clearTimeout(tid);
    }
  }, [open]);

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

  const frequencyOptions: Array<{
    value: IncomeFrequency;
    label: string;
    sub?: string;
  }> = [
    {
      value: "once",
      label: t("incomes.create.freq.once.label"),
      sub: t("incomes.create.freq.once.sub"),
    },
    {
      value: "monthly",
      label: t("incomes.create.freq.monthly.label"),
      sub: t("incomes.create.freq.monthly.sub"),
    },
    {
      value: "quarterly",
      label: t("incomes.create.freq.quarterly.label"),
      sub: t("incomes.create.freq.quarterly.sub"),
    },
    {
      value: "yearly",
      label: t("incomes.create.freq.yearly.label"),
      sub: t("incomes.create.freq.yearly.sub"),
    },
  ];

  const selectedFreq =
    frequencyOptions.find((o) => o.value === frequency) ?? frequencyOptions[1];

  useEffect(() => {
    if (!open) return;

    setBusy(false);
    setError(null);
    setFreqOpen(false);
    setDateOpen(false);
    setEndOpen(false);
    setTouched({ amount: false, source: false });

    if (initialIncome) {
      const d = dateFromIncomeDate(initialIncome.date) ?? new Date();
      setAmount(
        String((initialIncome.amountCents ?? 0) / 100).replace(".", ","),
      );
      setSource(initialIncome.source ?? "");
      setFrequency(initialIncome.frequency ?? "monthly");
      setScope(initialIncome.scope ?? "shared");
      setDate(toISODate(d));

      const ed = dateFromIncomeDate(initialIncome.endDate ?? null);
      if (ed) {
        setStopEnabled(true);
        setEndDate(toISODate(ed));
      } else {
        setStopEnabled(false);
        setEndDate(new Date().toISOString().slice(0, 10));
      }
      return;
    }

    setAmount("");
    setSource("");
    setFrequency("monthly");
    setScope("shared");
    setDate(new Date().toISOString().slice(0, 10));
    setStopEnabled(false);
    setEndDate(new Date().toISOString().slice(0, 10));
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

  // ---- Place START date popover (desktop)
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
      const wouldBottomCut =
        rect.bottom + gap + popH > window.innerHeight - margin;
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

  // ---- Place END date popover (desktop)
  useEffect(() => {
    if (!endOpen) return;
    if (isMobile) return;

    function place() {
      const wrap = endWrapRef.current;
      const pop = endPopRef.current;
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
      const wouldBottomCut =
        rect.bottom + gap + popH > window.innerHeight - margin;
      if (wouldBottomCut) {
        style = {
          position: "absolute",
          right: 0,
          width: targetW,
          bottom: `calc(100% + ${gap}px)`,
        };
      }

      setEndPopStyle(style);
    }

    function onDocDown(e: PointerEvent) {
      const target = e.target as Node;
      if (endWrapRef.current?.contains(target)) return;
      if (endPopRef.current?.contains(target)) return;
      setEndOpen(false);
    }

    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setEndOpen(false);
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
  }, [endOpen, isMobile]);

  useEffect(() => {
    if (frequency !== "once") setScope("shared");
  }, [frequency]);

  useEffect(() => {
    if (frequency === "once") {
      setStopEnabled(false);
      setEndDate(new Date().toISOString().slice(0, 10));
    }
  }, [frequency]);

  useEffect(() => {
    if (frequency !== "once") return;

    setScopeFlash(true);
    const tid = window.setTimeout(() => setScopeFlash(false), 700);

    requestAnimationFrame(() => {
      scopeRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
      scopeRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    });

    return () => window.clearTimeout(tid);
  }, [frequency]);

  const [month, setMonth] = useState<Date>(() => selectedDateObj);
  useEffect(() => {
    if (!dateOpen) return;
    setMonth(selectedDateObj);
  }, [dateOpen, selectedDateObj]);

  const [endMonth, setEndMonth] = useState<Date>(() => selectedEndObj);
  useEffect(() => {
    if (!endOpen) return;
    setEndMonth(selectedEndObj);
  }, [endOpen, selectedEndObj]);

  const amountCents = useMemo(() => {
    if (!isValidAmountText(amount)) return null;
    const n = Number(normalizeAmountInput(amount));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
  }, [amount]);

  const amountError = useMemo(() => {
    if (!canEditThis) return null;
    if (!touched.amount) return null;
    const raw = amount.trim();
    if (!raw) return t("incomes.create.errors.amountRequired");
    if (!isValidAmountText(raw))
      return t("incomes.create.errors.amountInvalid");
    const n = Number(normalizeAmountInput(raw));
    if (!Number.isFinite(n) || n <= 0)
      return t("incomes.create.errors.amountPositive");
    return null;
  }, [amount, touched.amount, t, canEditThis]);

  const sourceErrCode = useMemo(() => {
    if (!canEditThis) return null;
    if (!touched.source) return null;
    return validateSource(source);
  }, [source, touched.source, canEditThis]);

  const sourceError = useMemo(() => {
    if (!sourceErrCode) return null;
    if (sourceErrCode === "required")
      return t("incomes.create.errors.sourceRequired");
    return t("incomes.create.errors.sourceTooShort");
  }, [sourceErrCode, t]);

  useEffect(() => {
    if (!canEditThis) {
      setFreqOpen(false);
      setDateOpen(false);
      setEndOpen(false);
    }
  }, [canEditThis]);

  const canSave =
    !!homeId &&
    canEditThis &&
    !busy &&
    !!amountCents &&
    !amountError &&
    !sourceErrHard &&
    !endDateError;

  const scopeLabel =
    scope === "shared"
      ? t("incomes.create.scope.shared")
      : t("incomes.create.scope.personal");

  const saveLabel = busy
    ? t("incomes.create.saving")
    : frequency === "once"
      ? `${isEdit ? t("incomes.edit.save") : t("incomes.create.save")} · ${scopeLabel}`
      : isEdit
        ? t("incomes.edit.save")
        : t("incomes.create.save");

  async function onSave() {
    setTouched({ amount: true, source: true });

    if (!homeId || !canEditThis) return;

    if (validateSource(source)) return;
    if (!amountCents) return;

    if (!canSave) return;
    if (initialIncome && !canEditThis) return;

    try {
      setBusy(true);
      setError(null);

      let startDate = new Date(date + "T00:00:00");

      const endDateDate =
        stopEnabled && frequency !== "once"
          ? endOfDay(parseISO(clampISODateMin(endDate, minEndISO)))
          : null;

      if (initialIncome) {
        const isRec = frequency !== "once";
        const oldWasRec = initialIncome.frequency !== "once";

        const oldStartRaw = dateFromIncomeDate(initialIncome.date);

        if (isRec || oldWasRec) {
          startDate = startOfMonth(startDate);

          const oldStart = oldStartRaw ? startOfMonth(oldStartRaw) : null;

          const canSplit =
            !!oldStart && startDate.getTime() > oldStart.getTime();

          if (canSplit) {
            await splitIncomeChange({
              homeId,
              oldIncomeId: initialIncome.id,
              oldGroupId: initialIncome.groupId ?? null,
              newStartDate: startDate,
              amountCents,
              source,
              frequency,
              scope,
              currentUid,
              endDate: endDateDate,
            });
          } else {
            await overwriteIncome({
              homeId,
              incomeId: initialIncome.id,
              amountCents,
              source,
              frequency,
              scope,
              date: startDate,
              groupId: initialIncome.groupId ?? null,
              endDate: endDateDate,
            });
          }
        } else {
          await overwriteIncome({
            homeId,
            incomeId: initialIncome.id,
            amountCents,
            source,
            frequency,
            scope,
            date: startDate,
          });
        }
      } else {
        await addIncome({
          homeId,
          amountCents,
          source,
          frequency,
          scope,
          date: startDate,
          createdByUid: currentUid,
        });
      }

      onClose();
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : t("incomes.create.errors.saveFailed");
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return (
    <div
      className={`hmodal__backdrop hmodal__backdrop--incomeCreate ${show ? "is-open" : ""}`}
      role="dialog"
      aria-modal="true"
    >
      <div className="hmodal__panel">
        <div className="imodal__head">
          <div>
            <div className="imodal__title">
              {initialIncome
                ? t("incomes.edit.title")
                : t("incomes.create.title")}
            </div>
            <div className="imodal__sub">
              {initialIncome
                ? t("incomes.edit.subtitle")
                : t("incomes.create.subtitle")}
            </div>
          </div>
          <button
            className="imodal__close"
            onClick={onClose}
            aria-label={t("common.cancel")}
          >
            ✕
          </button>
        </div>

        <div className="imodal__body">
          {initialIncome && !canEditThis && (
            <div className="imodal__error">{t("incomes.edit.notAllowed")}</div>
          )}

          {/* AMOUNT */}
          <label className={`imodal__field ${amountError ? "is-invalid" : ""}`}>
            <span>{t("incomes.create.amountLabel")}</span>
            <input
              value={amount}
              disabled={!canEditThis}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => setTouched((p) => ({ ...p, amount: true }))}
              inputMode="decimal"
              placeholder={t("incomes.create.amountPlaceholder")}
              aria-invalid={!!amountError}
              aria-describedby={amountError ? "amount-error" : undefined}
            />
            {amountError && (
              <div id="amount-error" className="ifield__error">
                {amountError}
              </div>
            )}
          </label>

          {/* SOURCE */}
          <label className={`imodal__field ${sourceError ? "is-invalid" : ""}`}>
            <span>{t("incomes.create.sourceLabel")}</span>
            <input
              value={source}
              disabled={!canEditThis}
              onChange={(e) => setSource(e.target.value)}
              onBlur={() => setTouched((p) => ({ ...p, source: true }))}
              placeholder={t("incomes.create.sourcePlaceholder")}
              aria-invalid={!!sourceError}
              aria-describedby={sourceError ? "source-error" : undefined}
            />
            {sourceError && (
              <div id="source-error" className="ifield__error">
                {sourceError}
              </div>
            )}
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
                    if (
                      e.key === "ArrowDown" ||
                      e.key === "Enter" ||
                      e.key === " "
                    ) {
                      e.preventDefault();
                      setFreqOpen(true);
                    }
                  }}
                >
                  <div className="iselect__main">
                    <div className="iselect__label">{selectedFreq.label}</div>
                    {selectedFreq.sub && (
                      <div className="iselect__sub">{selectedFreq.sub}</div>
                    )}
                  </div>
                  <span className="iselect__chev" aria-hidden>
                    ▾
                  </span>
                </button>

                {freqOpen && (
                  <div
                    className="iselect__menu"
                    role="listbox"
                    aria-label={t("incomes.create.frequencyLabel")}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
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
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            if (!canEditThis) return;
                            setFrequency(opt.value);
                            setFreqOpen(false);
                            requestAnimationFrame(() =>
                              freqBtnRef.current?.focus(),
                            );
                          }}
                        >
                          <div className="iselect__optTitle">{opt.label}</div>
                          {opt.sub && (
                            <div className="iselect__optSub">{opt.sub}</div>
                          )}
                          {active && <span className="iselect__tick">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </label>

            {/* START Date picker */}
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
                      <div
                        className="idateSheet"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="idateSheet__head">
                          <div className="idateSheet__title">
                            {t("incomes.create.dateLabel")}
                          </div>
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
                        <button
                          type="button"
                          className="idate__action ghost"
                          onClick={() => setDateOpen(false)}
                        >
                          {t("common.close")}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {isRecurrent && selectedDateObj.getDate() !== 1 && (
            <div className="idate__hint">
              {t("incomes.create.recurrentAppliesFrom", {
                date: effectiveStartLabel,
              })}
              <span className="idate__hint2">
                {t("incomes.create.recurrentAppliesFromWhy")}
              </span>
            </div>
          )}

          {/* END DATE */}
          {isEdit && isRecurrent && canEditThis && (
            <div className="imodal__stop">
              <div className="imodal__stopTop">
                <div className="imodal__stopTitle">
                  {t("incomes.edit.stopTitle")}
                </div>

                <button
                  type="button"
                  className={`itoggle__opt ${stopEnabled ? "is-active" : ""}`}
                  disabled={!canEditThis}
                  onClick={() => setStopEnabled((v) => !v)}
                >
                  {stopEnabled ? t("common.on") : t("common.off")}
                </button>
              </div>

              <div className="imodal__stopSub">
                {t("incomes.edit.stopHelp")}
              </div>

              {stopEnabled && (
                <label
                  className={`imodal__field ${endDateError ? "is-invalid" : ""}`}
                >
                  <span>{t("incomes.edit.endDateLabel")}</span>

                  <div className="idate" ref={endWrapRef}>
                    <button
                      type="button"
                      className="idate__btn"
                      aria-haspopup="dialog"
                      aria-expanded={endOpen}
                      disabled={!canEditThis}
                      onClick={() => {
                        if (!canEditThis) return;
                        setEndOpen((v) => !v);
                      }}
                    >
                      <span className="idate__value">{endDateLabel}</span>
                      <span className="idate__icon" aria-hidden>
                        📅
                      </span>
                    </button>

                    {endOpen &&
                      (isMobile ? (
                        <div
                          className="idateSheet__backdrop"
                          role="dialog"
                          aria-label={t("incomes.edit.endDateLabel")}
                          onClick={() => setEndOpen(false)}
                        >
                          <div
                            className="idateSheet"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="idateSheet__head">
                              <div className="idateSheet__title">
                                {t("incomes.edit.endDateLabel")}
                              </div>
                              <button
                                type="button"
                                className="idateSheet__close"
                                onPointerDown={(e) => {
                                  closeEnd(e);
                                }}
                                onClick={(e) => {
                                  closeEnd(e);
                                }}
                                aria-label={t("common.close")}
                              >
                                ✕
                              </button>
                            </div>

                            <DayPicker
                              mode="single"
                              selected={selectedEndObj}
                              month={endMonth}
                              onMonthChange={setEndMonth}
                              disabled={(d) => d < parseISO(minEndISO)}
                              onSelect={(d) => {
                                if (!canEditThis) return;
                                if (!d) return;
                                const iso = format(d, "yyyy-MM-dd");
                                setEndDate(clampISODateMin(iso, minEndISO));
                                setEndMonth(d);
                                setEndOpen(false);
                              }}
                              locale={es}
                              weekStartsOn={1}
                              showOutsideDays
                            />

                            <div className="idateSheet__actions">
                              <button
                                type="button"
                                className="idate__action"
                                onPointerDown={(e) => {
                                  pickEndToday(e);
                                }}
                                onClick={(e) => {
                                  pickEndToday(e);
                                }}
                              >
                                {t("common.today")}
                              </button>

                              <button
                                type="button"
                                className="idate__action ghost"
                                onPointerDown={(e) => {
                                  closeEnd(e);
                                }}
                                onClick={(e) => {
                                  closeEnd(e);
                                }}
                              >
                                {t("common.close")}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          ref={endPopRef}
                          className="idate__pop"
                          style={endPopStyle}
                          role="dialog"
                          aria-label={t("incomes.edit.endDateLabel")}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <div className="idate__popHead">
                            <div className="idate__popTitle">
                              {t("incomes.edit.endDateLabel")}
                            </div>
                            <button
                              type="button"
                              className="idate__popClose"
                              onPointerDown={(e) => {
                                closeEnd(e);
                              }}
                              onClick={(e) => {
                                closeEnd(e);
                              }}
                              aria-label={t("common.close")}
                            >
                              ✕
                            </button>
                          </div>

                          <DayPicker
                            mode="single"
                            selected={selectedEndObj}
                            month={endMonth}
                            onMonthChange={setEndMonth}
                            disabled={(d) => d < parseISO(minEndISO)}
                            onSelect={(d) => {
                              if (!canEditThis) return;
                              if (!d) return;
                              const iso = format(d, "yyyy-MM-dd");
                              setEndDate(clampISODateMin(iso, minEndISO));
                              setEndMonth(d);
                              setEndOpen(false);
                            }}
                            locale={es}
                            weekStartsOn={1}
                            showOutsideDays
                          />

                          <div className="idate__actions">
                            <button
                              type="button"
                              className="idate__action"
                              onPointerDown={(e) => {
                                pickEndToday(e);
                              }}
                              onClick={(e) => {
                                pickEndToday(e);
                              }}
                            >
                              {t("common.today")}
                            </button>
                            <button
                              type="button"
                              className="idate__action ghost"
                              onPointerDown={(e) => {
                                closeEnd(e);
                              }}
                              onClick={(e) => {
                                closeEnd(e);
                              }}
                            >
                              {t("common.close")}
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>

                  {endDateError && (
                    <div id="enddate-error" className="ifield__error">
                      {endDateError}
                    </div>
                  )}
                </label>
              )}
            </div>
          )}

          {frequency === "once" && (
            <div
              ref={scopeRef}
              className={`iscope ${scopeFlash ? "is-flash" : ""}`}
              role="group"
              aria-label={t("incomes.create.scopeAria")}
            >
              <div className="iscope__top">
                <span className="iscope__label">
                  {t("incomes.create.scopeLabel")}
                </span>
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
                {scope === "shared"
                  ? t("incomes.create.scope.sharedHint")
                  : t("incomes.create.scope.personalHint")}
              </div>

              <div className="iscope__meta">
                {t("incomes.create.scopeMeta", { scope: scopeLabel })}
              </div>
            </div>
          )}

          {error && <div className="imodal__error">{error}</div>}
        </div>

        <div className="imodal__footer">
          <button
            className="imodal__btn ghost"
            onClick={onClose}
            disabled={busy}
          >
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

import { useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { useTranslation } from "react-i18next";

import { useMyHomeId } from "../../users/hooks/useMyHomeId";
import { useIncomes } from "../../incomes/hooks/useIncomes";
import { IncomeCreateModal } from "../../incomes/components/IncomeCreateModal";
import type { IncomeFrequency } from "../../incomes/api/incomes.service";
import { IncomeManageModal } from "../../incomes/components/IncomeManageModal";
import { CashflowChart } from "../components/CashflowChart";
import { CashflowDonut } from "../components/CashflowDonut";
import { buildMonthlyIncomeSeries, endOfMonth } from "../utils/cashflowSeries";

type TimestampLike = { toDate: () => Date };
type Dateish = Date | string | number | TimestampLike | null | undefined;

type IncomeRowLite = {
  amountCents?: number;
  frequency?: IncomeFrequency;
  scope?: "shared" | "personal";
  createdByUid?: string;
  date?: Dateish;
  endDate?: Dateish;
};

function isTimestampLike(v: unknown): v is TimestampLike {
  return (
    typeof v === "object" &&
    v !== null &&
    "toDate" in v &&
    typeof (v as { toDate?: unknown }).toDate === "function"
  );
}

function toDateSafe(d: Dateish): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (isTimestampLike(d)) return d.toDate();

  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isShared(r: IncomeRowLite) {
  return (r.scope ?? "shared") === "shared";
}
function isMyPersonal(r: IncomeRowLite, uid: string) {
  return (r.scope ?? "shared") === "personal" && r.createdByUid === uid;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function calcMonthlyEstimatedIncomeCentsShared(
  rows: IncomeRowLite[],
  now = new Date(),
) {
  const som = startOfMonth(now);
  let total = 0;

  for (const r of rows) {
    if (!isShared(r)) continue;

    const cents = r.amountCents ?? 0;
    if (cents <= 0) continue;

    const end = toDateSafe(r.endDate);
    if (end && endOfDay(end) < som) continue;

    switch (r.frequency) {
      case "monthly":
        total += cents;
        break;
      case "quarterly":
        total += Math.round(cents / 3);
        break;
      case "yearly":
        total += Math.round(cents / 12);
        break;
      default:
        break;
    }
  }

  return total;
}

function calcOneOffThisMonthCentsShared(
  rows: IncomeRowLite[],
  now = new Date(),
) {
  const y = now.getFullYear();
  const m = now.getMonth();
  let total = 0;

  for (const r of rows) {
    if (r.frequency !== "once") continue;
    if (!isShared(r)) continue;

    const d = toDateSafe(r.date);
    if (!d) continue;
    if (d.getFullYear() === y && d.getMonth() === m)
      total += r.amountCents ?? 0;
  }

  return total;
}

function calcOneOffThisMonthCentsMyPersonal(
  rows: IncomeRowLite[],
  uid: string,
  now = new Date(),
) {
  const y = now.getFullYear();
  const m = now.getMonth();
  let total = 0;

  for (const r of rows) {
    if (r.frequency !== "once") continue;
    if (!isMyPersonal(r, uid)) continue;

    const d = toDateSafe(r.date);
    if (!d) continue;
    if (d.getFullYear() === y && d.getMonth() === m)
      total += r.amountCents ?? 0;
  }

  return total;
}

function formatEUR(cents: number, locale: string) {
  const resolved = locale.startsWith("en") ? "en-IE" : "es-ES";
  return (cents / 100).toLocaleString(resolved, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  });
}

export function DashboardPage({ user }: { user: User }) {
  const { t, i18n } = useTranslation();
  const name = user.displayName ?? user.email ?? "";

  const { homeId } = useMyHomeId(user.uid);
  const { rows, loading } = useIncomes(homeId);
  const [openIncome, setOpenIncome] = useState(false);
  const [openManageIncomes, setOpenManageIncomes] = useState(false);

  const safeRows = rows as unknown as IncomeRowLite[];

  const monthlyEstimatedSharedCents = useMemo(
    () => calcMonthlyEstimatedIncomeCentsShared(safeRows, new Date()),
    [safeRows],
  );

  const oneOffSharedThisMonthCents = useMemo(
    () => calcOneOffThisMonthCentsShared(safeRows),
    [safeRows],
  );

  const myOneOffThisMonthCents = useMemo(
    () => calcOneOffThisMonthCentsMyPersonal(safeRows, user.uid),
    [safeRows, user.uid],
  );

  const [chartMode, setChartMode] = useState<"bar" | "donut">("bar");

  const bigValue = useMemo(() => {
    if (loading) return "—";
    return `${formatEUR(monthlyEstimatedSharedCents, i18n.language)} / ${t(
      "common.monthShort",
      "mes",
    )}`;
  }, [loading, monthlyEstimatedSharedCents, i18n.language, t]);

  const oneOffSharedLine = useMemo(() => {
    if (loading) return null;
    if (oneOffSharedThisMonthCents <= 0) return null;

    return t("dashboard.cards.incomes.oneOffThisMonthShared", {
      value: formatEUR(oneOffSharedThisMonthCents, i18n.language),
    });
  }, [loading, oneOffSharedThisMonthCents, i18n.language, t]);

  const oneOffPersonalLine = useMemo(() => {
    if (loading) return null;
    if (myOneOffThisMonthCents <= 0) return null;

    return t("dashboard.cards.incomes.oneOffThisMonthPersonal", {
      value: formatEUR(myOneOffThisMonthCents, i18n.language),
    });
  }, [loading, myOneOffThisMonthCents, i18n.language, t]);

  const hasNoIncomes = useMemo(() => {
    if (loading) return false;
    return (safeRows?.length ?? 0) === 0;
  }, [loading, safeRows]);

  const locale = i18n.language.startsWith("en") ? "en-IE" : "es-ES";

  const series = useMemo(() => {
    if (loading) return { labels: [], cents: [] };
    return buildMonthlyIncomeSeries(
      safeRows,
      endOfMonth(new Date()),
      12,
      locale,
    );
  }, [loading, safeRows, locale]);

  const monthIncomeCents = useMemo(() => {
    if (loading) return 0;

    const now = new Date();
    const plannedSeries = buildMonthlyIncomeSeries(
      safeRows,
      endOfMonth(now),
      12,
      locale,
    );

    return plannedSeries.cents[plannedSeries.cents.length - 1] ?? 0;
  }, [loading, safeRows, locale]);

  return (
    <div className="dash">
      <div className="dash__wrap">
        <section className="dash__mainGrid">
          {/* BLOQUE GRANDE: HEADER / DASHBOARD */}
          <header className="dash__header dash__glass dash__heroHeader">
            <h1 className="dash__title">{t("dashboard.title")}</h1>
            <p className="dash__sub">{t("dashboard.subtitle", { name })}</p>

            {!loading && series.labels.length > 0 && (
              <div className="dash__heroChart">
                <div className="dash__heroViz">
                  {chartMode === "bar" ? (
                    <CashflowChart
                      labels={series.labels}
                      valuesCents={series.cents}
                    />
                  ) : (
                    <CashflowDonut
                      incomeCents={monthIncomeCents}
                      locale={locale}
                    />
                  )}
                </div>

                <div
                  className="dash__chartToggle"
                  role="tablist"
                  aria-label={t("dashboard.chart.ariaLabel")}
                >
                  <button
                    type="button"
                    className={`dash__toggleBtn ${chartMode === "bar" ? "is-on" : ""}`}
                    onClick={() => setChartMode("bar")}
                  >
                    {t("dashboard.chart.historic")}
                  </button>

                  <button
                    type="button"
                    className={`dash__toggleBtn ${chartMode === "donut" ? "is-on" : ""}`}
                    onClick={() => setChartMode("donut")}
                  >
                    {t("dashboard.chart.currentMonth")}
                  </button>
                </div>
              </div>
            )}
          </header>

          {/* INGRESOS */}
          <div className="dash__card dash__glass dash__card--incomes">
            <div className="dash__cardTop">
              <div className="dash__cardTitle">
                {t("dashboard.cards.incomes.title")}
              </div>

              <div className="dash__iconGroup">
                {/* Ver / gestionar ingresos */}
                <button
                  className="dash__iconBtn ghost"
                  onClick={() => setOpenManageIncomes(true)}
                  aria-label={t("dashboard.cards.incomes.manageAriaLabel")}
                  title={t("dashboard.cards.incomes.manageTitle")}
                  type="button"
                  disabled={!homeId}
                >
                  {/* Icono lista (SVG) */}
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M8 6h13M8 12h13M8 18h13"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <path
                      d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>

                {/* Añadir ingreso */}
                <button
                  className="dash__iconBtn"
                  onClick={() => setOpenIncome(true)}
                  aria-label={t("dashboard.cards.incomes.addAriaLabel")}
                  disabled={!homeId}
                  title={
                    !homeId
                      ? t("dashboard.cards.incomes.needHomeTitle")
                      : t("dashboard.cards.incomes.addTitle")
                  }
                  type="button"
                >
                  +
                </button>
              </div>
            </div>

            <div className="dash__bigValue">{bigValue}</div>

            {hasNoIncomes && (
              <div className="dash__emptyHint">
                <span className="dash__emptyHintText">
                  {t("dashboard.cards.incomes.emptyHint")}
                </span>

                <button
                  type="button"
                  className="dash__emptyHintAction"
                  onClick={() => setOpenIncome(true)}
                  disabled={!homeId}
                  title={
                    !homeId
                      ? t("dashboard.cards.incomes.needHomeTitle")
                      : t("dashboard.cards.incomes.addTitle")
                  }
                >
                  {t("dashboard.cards.incomes.emptyHintCta")}
                </button>
              </div>
            )}

            {!hasNoIncomes &&
              !oneOffSharedLine &&
              !oneOffPersonalLine &&
              !loading && (
                <div
                  className="dash__quietMeta"
                  role="note"
                  aria-label={t("dashboard.cards.incomes.oneOffEmptyAria")}
                >
                  <span className="dash__quietDot" aria-hidden="true" />
                  <span className="dash__quietText">
                    {t("dashboard.cards.incomes.oneOffEmptyThisMonth")}
                  </span>
                </div>
              )}

            <div className="dash__meta">
              {(oneOffSharedLine || oneOffPersonalLine) && (
                <div
                  className="dash__metaPanel"
                  role="note"
                  aria-label={t("dashboard.cards.incomes.oneOffPanelAria")}
                >
                  <div className="dash__metaPanelTitle">
                    <span className="dash__metaPanelDot" />
                    {t("dashboard.cards.incomes.oneOffPanelTitle")}
                  </div>

                  <div className="dash__metaPanelRows">
                    {oneOffSharedLine && (
                      <div className="dash__metaRow">
                        <span className="dash__metaIcon" aria-hidden="true">
                          {/* Home/Shared SVG */}
                          <svg
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="none"
                          >
                            <path
                              d="M3.5 10.5 12 3.75 20.5 10.5V20a1.75 1.75 0 0 1-1.75 1.75H5.25A1.75 1.75 0 0 1 3.5 20v-9.5Z"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M9.25 21.75v-6.5A1.75 1.75 0 0 1 11 13.5h2A1.75 1.75 0 0 1 14.75 15.25v6.5"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>

                        <span className="dash__metaLabel">
                          {t("dashboard.cards.incomes.oneOffSharedLabel")}
                        </span>

                        <span className="dash__metaValue">
                          {formatEUR(oneOffSharedThisMonthCents, i18n.language)}
                        </span>
                      </div>
                    )}

                    {oneOffPersonalLine && (
                      <div className="dash__metaRow">
                        <span className="dash__metaIcon" aria-hidden="true">
                          {/* User/Personal SVG */}
                          <svg
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="none"
                          >
                            <path
                              d="M12 12.25a4.25 4.25 0 1 0-4.25-4.25A4.25 4.25 0 0 0 12 12.25Z"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            />
                            <path
                              d="M4.5 20.25c1.65-3.6 4.45-5.25 7.5-5.25s5.85 1.65 7.5 5.25"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                            />
                          </svg>
                        </span>

                        <span className="dash__metaLabel">
                          {t("dashboard.cards.incomes.oneOffPersonalLabel")}
                        </span>

                        <span className="dash__metaValue">
                          {formatEUR(myOneOffThisMonthCents, i18n.language)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* GASTOS */}
          <div className="dash__card dash__glass dash__card--expenses">
            <div className="dash__cardTop">
              <div className="dash__cardTitle">
                {t("dashboard.cards.expenses.title")}
              </div>
            </div>
            <div className="dash__muted">
              {t("dashboard.cards.expenses.desc")}
            </div>
          </div>

          {/* AHORRO / INVERSIÓN */}
          <div className="dash__card dash__glass dash__card--savings dash__card--accent">
            <div className="dash__cardTop">
              <div className="dash__cardTitle">
                {t("dashboard.cards.savings.title")}
              </div>
              <span className="dash__chip is-savings">
                {t("dashboard.cards.savings.chip")}
              </span>
            </div>

            <div className="dash__muted">
              {t("dashboard.cards.savings.desc")}
            </div>

            <div className="dash__kpis">
              <div className="dash__kpi">
                <div className="dash__kpiLabel">
                  {t("dashboard.cards.savings.kpiSaved")}
                </div>
                <div className="dash__kpiValue">—</div>
              </div>
              <div className="dash__kpi">
                <div className="dash__kpiLabel">
                  {t("dashboard.cards.savings.kpiInvested")}
                </div>
                <div className="dash__kpiValue">—</div>
              </div>
            </div>
          </div>
        </section>

        <IncomeCreateModal
          open={openIncome}
          onClose={() => setOpenIncome(false)}
          homeId={homeId}
          currentUid={user.uid}
        />

        <IncomeManageModal
          open={openManageIncomes}
          onClose={() => setOpenManageIncomes(false)}
          homeId={homeId}
          currentUid={user.uid}
          rows={rows}
        />
      </div>
    </div>
  );
}

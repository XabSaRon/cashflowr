import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Chart,
  DoughnutController,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import type { Chart as ChartJS } from "chart.js";

Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

type Props = {
  incomeCents: number;
  label?: string;
  locale?: string;
};

function formatEUR(value: number, locale: string) {
  return value.toLocaleString(locale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  });
}

export function CashflowDonut({ incomeCents, label, locale = "es-ES" }: Props) {
  const { t } = useTranslation();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<ChartJS<"doughnut"> | null>(null);

  const income = useMemo(() => incomeCents / 100, [incomeCents]);
  const remainder = useMemo(() => 1, []);

  const seriesLabel = label ?? t("dashboard.chart.incomeLabel");
  const restLabel = t("dashboard.chart.restLabel");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    chartRef.current?.destroy();

    chartRef.current = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: [seriesLabel, restLabel],
        datasets: [
          {
            data: [income > 0 ? income : 0.0001, remainder],
            borderWidth: 0,
            spacing: 2,
            hoverOffset: 2,
            backgroundColor: [
              "rgba(34, 197, 94, 0.55)",
              "rgba(255, 255, 255, 0.06)",
            ],
            hoverBackgroundColor: [
              "rgba(34, 197, 94, 0.75)",
              "rgba(255, 255, 255, 0.09)",
            ],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed;
                if (typeof v !== "number") return "—";
                if (ctx.dataIndex === 1) return "";
                return formatEUR(v, locale);
              },
            },
            filter: (ctx) => ctx.dataIndex === 0,
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [income, remainder, locale, seriesLabel, restLabel]);

  return (
    <div className="dash__donut">
      <div className="dash__donutCanvas">
        <canvas ref={canvasRef} />
        <div className="dash__donutCenter">
          <div className="dash__donutValue">{formatEUR(income, locale)}</div>
          <div className="dash__donutLabel">
            {t("dashboard.chart.thisMonth")}
          </div>
        </div>
      </div>
    </div>
  );
}

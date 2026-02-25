import { useEffect, useMemo, useRef } from "react";
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  type Chart as ChartJS,
} from "chart.js";

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);

type BarChart = ChartJS<"bar", number[], string>;

type Props = {
  labels: string[];
  valuesCents: number[];
};

export function CashflowChart({ labels, valuesCents }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<BarChart | null>(null);

  const values = useMemo(() => valuesCents.map((c) => c / 100), [valuesCents]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    chartRef.current?.destroy();

    const chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Ingresos",
            data: values,
            borderWidth: 0,
            borderRadius: 10,
            backgroundColor: "rgba(34, 197, 94, 0.35)",
            hoverBackgroundColor: "rgba(34, 197, 94, 0.55)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const y = ctx.parsed?.y;
                if (typeof y !== "number") return "—";
                return `${y.toFixed(2)} €`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            offset: true,
            ticks: {
              padding: 10,
              maxRotation: window.matchMedia("(max-width: 520px)").matches
                ? 35
                : 0,
              minRotation: window.matchMedia("(max-width: 520px)").matches
                ? 35
                : 0,
              font: () => {
                const isMobile =
                  window.matchMedia("(max-width: 520px)").matches;
                return {
                  size: isMobile ? 10 : 12,
                  weight: 600,
                };
              },
            },
            afterBuildTicks: (scale) => {
              const isMobile = window.matchMedia("(max-width: 520px)").matches;
              if (!isMobile) return;

              const ticks = scale.ticks;
              const last = ticks.length - 1;
              scale.ticks = ticks.filter(
                (_, i) => i % 2 === 0 || i === last || i === last - 1,
              );
            },
          },
          y: {
            beginAtZero: true,
            grid: { display: true },
            ticks: { callback: (v) => `${v}€` },
          },
        },
      },
    });

    chartRef.current = chart;

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [labels, values]);

  return (
    <div style={{ height: 220 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

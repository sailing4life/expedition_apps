"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

import type { Config, Data, Layout } from "plotly.js";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export type AgreementPlotLine = {
  label: string;
  values: Array<number | null>;
  color: string;
  dashed?: boolean;
  showLabels?: boolean;
};

export type AgreementPlotBand = {
  label: string;
  lower: Array<number | null>;
  upper: Array<number | null>;
  color: string;
};

type ModelAgreementPlotProps = {
  title: string;
  timestamps: string[];
  lines: AgreementPlotLine[];
  selectedTimestamp?: string | null;
  yAxisLabel: string;
  yDomain?: [number, number];
  valueDecimals?: number;
  valueSuffix?: string;
  height?: number;
  band?: AgreementPlotBand | null;
};

function sanitizeFilename(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "chart";
}

function labelStep(size: number, maxLabels = 14): number {
  if (size <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(size / maxLabels));
}

function formatPointLabel(value: number | null, decimals: number): string {
  if (value === null) {
    return "";
  }
  return value.toFixed(decimals);
}

function buildSampledLabels(
  values: Array<number | null>,
  decimals: number,
  step: number,
  focusedIndex: number | null,
): string[] {
  return values.map((value, index) => {
    if (value === null) {
      return "";
    }
    if (index === 0 || index === values.length - 1 || index % step === 0 || index === focusedIndex) {
      return formatPointLabel(value, decimals);
    }
    return "";
  });
}

export function ModelAgreementPlot({
  title,
  timestamps,
  lines,
  selectedTimestamp = null,
  yAxisLabel,
  yDomain,
  valueDecimals = 1,
  valueSuffix = "",
  height = 520,
  band = null,
}: ModelAgreementPlotProps) {
  const xValues = useMemo(() => timestamps.map((value) => new Date(value)), [timestamps]);
  const focusedIndex = selectedTimestamp ? timestamps.indexOf(selectedTimestamp) : -1;
  const sampledStep = labelStep(timestamps.length);

  const data = useMemo<Data[]>(() => {
    const traces: Data[] = [];

    if (band) {
      traces.push({
        type: "scatter",
        mode: "lines",
        name: `${band.label} lower`,
        x: xValues,
        y: band.lower,
        line: { width: 0, color: band.color },
        hoverinfo: "skip",
        showlegend: false,
      });
      traces.push({
        type: "scatter",
        mode: "lines",
        name: band.label,
        x: xValues,
        y: band.upper,
        line: { width: 0, color: band.color },
        fill: "tonexty",
        fillcolor: band.color,
        hoverinfo: "skip",
      });
    }

    lines.forEach((line) => {
      const text = line.showLabels
        ? buildSampledLabels(line.values, valueDecimals, sampledStep, focusedIndex >= 0 ? focusedIndex : null)
        : undefined;
      traces.push({
        type: "scatter",
        mode: line.showLabels ? "text+lines+markers" : "lines+markers",
        name: line.label,
        x: xValues,
        y: line.values,
        marker: { color: line.color, size: line.dashed ? 6 : 7, symbol: "circle" },
        line: { color: line.color, width: line.dashed ? 2.2 : 2.5, dash: line.dashed ? "dash" : "solid" },
        text,
        textposition: "top center",
        textfont: { color: line.color, size: 11 },
        hovertemplate: `%{x|%d %b %Y %H:%M}<br>${line.label}: %{y:.${valueDecimals}f}${valueSuffix ? ` ${valueSuffix}` : ""}<extra></extra>`,
      });
    });

    return traces;
  }, [band, focusedIndex, lines, sampledStep, valueDecimals, valueSuffix, xValues]);

  const layout = useMemo<Partial<Layout>>(
    () => ({
      title: {
        text: title,
        x: 0.02,
        y: 0.98,
        xanchor: "left",
        yanchor: "top",
        pad: { t: 6, b: 18 },
        font: { size: 20, color: "#1f1711" },
      },
      autosize: true,
      height,
      margin: { t: 126, r: 58, b: 72, l: 86 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "#ffffff",
      hovermode: "x unified",
      dragmode: "pan",
      legend: {
        orientation: "h",
        x: 0,
        xanchor: "left",
        y: 1.045,
        yanchor: "bottom",
        bgcolor: "rgba(255,255,255,0.72)",
        bordercolor: "rgba(48,37,28,0.08)",
        borderwidth: 1,
      },
      xaxis: {
        title: { text: "Time" },
        type: "date",
        tickformat: "%d %b<br>%H:%M",
        showgrid: true,
        gridcolor: "rgba(48,37,28,0.08)",
        linecolor: "rgba(48,37,28,0.22)",
        linewidth: 1.2,
        showline: true,
        ticks: "outside",
        ticklen: 6,
        tickfont: { size: 11, color: "#625247" },
      },
      yaxis: {
        title: { text: yAxisLabel },
        showgrid: true,
        gridcolor: "rgba(48,37,28,0.08)",
        linecolor: "rgba(48,37,28,0.22)",
        linewidth: 1.2,
        showline: true,
        tickfont: { size: 11, color: "#625247" },
        zeroline: false,
        range: yDomain,
      },
      shapes: selectedTimestamp
        ? [
            {
              type: "line",
              x0: selectedTimestamp,
              x1: selectedTimestamp,
              y0: 0,
              y1: 1,
              xref: "x",
              yref: "paper",
              line: {
                color: "rgba(31,23,17,0.45)",
                width: 2,
                dash: "dot",
              },
            },
          ]
        : [],
      annotations: selectedTimestamp
        ? [
            {
              x: selectedTimestamp,
              y: 1.015,
              xref: "x",
              yref: "paper",
              text: "Focus",
              showarrow: false,
              font: { size: 11, color: "#1f1711" },
              bgcolor: "rgba(255,255,255,0.8)",
              bordercolor: "rgba(48,37,28,0.08)",
              borderpad: 4,
            },
          ]
        : [],
    }),
    [height, selectedTimestamp, title, yAxisLabel, yDomain],
  );

  const config = useMemo<Partial<Config>>(
    () => ({
      responsive: true,
      displaylogo: false,
      displayModeBar: true,
      toImageButtonOptions: {
        format: "png",
        filename: sanitizeFilename(title),
        height: 900,
        width: 1600,
        scale: 2,
      },
      modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d", "resetScale2d", "toggleSpikelines"],
    }),
    [title],
  );

  return (
    <div className="agreement-plot-card">
      <Plot
        config={config}
        data={data}
        layout={layout}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
      />
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

import type { Config, Data, Layout } from "plotly.js";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

type WeatherMeteogramPlotProps = {
  title: string;
  timestamps: string[];
  tws: Array<number | null>;
  gust: Array<number | null>;
  twd: Array<number | null>;
  selectedTimestamp?: string | null;
  speedUnit: string;
  directionUnit: string;
};

function sanitizeFilename(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "chart";
}

function formatPointLabel(value: number | null, decimals: number): string {
  if (value === null) {
    return "";
  }
  return value.toFixed(decimals);
}

function labelStep(size: number, maxLabels = 18): number {
  if (size <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(size / maxLabels));
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

export function WeatherMeteogramPlot({
  title,
  timestamps,
  tws,
  gust,
  twd,
  selectedTimestamp = null,
  speedUnit,
  directionUnit,
}: WeatherMeteogramPlotProps) {
  const xValues = useMemo(() => timestamps.map((value) => new Date(value)), [timestamps]);
  const focusedIndex = selectedTimestamp ? timestamps.indexOf(selectedTimestamp) : -1;
  const sampledLabelStep = labelStep(timestamps.length);
  const twsLabels = useMemo(
    () => buildSampledLabels(tws, 1, sampledLabelStep, focusedIndex >= 0 ? focusedIndex : null),
    [focusedIndex, sampledLabelStep, tws],
  );
  const gustLabels = useMemo(
    () => buildSampledLabels(gust, 1, sampledLabelStep, focusedIndex >= 0 ? focusedIndex : null),
    [focusedIndex, gust, sampledLabelStep],
  );
  const twdLabels = useMemo(
    () => buildSampledLabels(twd, 0, sampledLabelStep, focusedIndex >= 0 ? focusedIndex : null),
    [focusedIndex, sampledLabelStep, twd],
  );

  const data = useMemo<Data[]>(
    () => [
      {
        type: "scatter",
        mode: "text+lines+markers",
        name: "TWS",
        x: xValues,
        y: tws,
        marker: { color: "#2563eb", size: 7, symbol: "circle" },
        line: { color: "#2563eb", width: 2.5 },
        text: twsLabels,
        textposition: "top center",
        textfont: { color: "#2563eb", size: 11 },
        hovertemplate: "%{x|%d %b %Y %H:%M}<br>TWS: %{y:.1f} " + speedUnit + "<extra></extra>",
        yaxis: "y",
      },
      {
        type: "scatter",
        mode: "text+lines+markers",
        name: "Gust",
        x: xValues,
        y: gust,
        marker: { color: "#93c5fd", size: 8, symbol: "x" },
        line: { color: "#93c5fd", width: 2.5, dash: "dash" },
        text: gustLabels,
        textposition: "top center",
        textfont: { color: "#60a5fa", size: 11 },
        hovertemplate: "%{x|%d %b %Y %H:%M}<br>Gust: %{y:.1f} " + speedUnit + "<extra></extra>",
        yaxis: "y",
      },
      {
        type: "scatter",
        mode: "text+lines+markers",
        name: "TWD",
        x: xValues,
        y: twd,
        marker: { color: "#dc2626", size: 7, symbol: "circle" },
        line: { color: "#dc2626", width: 2.4 },
        text: twdLabels,
        textposition: "top center",
        textfont: { color: "#dc2626", size: 11 },
        hovertemplate: "%{x|%d %b %Y %H:%M}<br>TWD: %{y:.0f} " + directionUnit + "<extra></extra>",
        yaxis: "y2",
      },
    ],
    [directionUnit, gust, gustLabels, speedUnit, twd, twdLabels, tws, twsLabels, xValues],
  );

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
      height: 620,
      margin: { t: 128, r: 86, b: 84, l: 78 },
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
        traceorder: "normal",
        itemclick: "toggleothers",
        itemdoubleclick: "toggle",
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
        rangeslider: {
          visible: true,
          thickness: 0.12,
          bgcolor: "rgba(244,239,231,0.9)",
          bordercolor: "rgba(48,37,28,0.08)",
          borderwidth: 1,
        },
      },
      yaxis: {
        title: { text: `TWS / Gust (${speedUnit})` },
        showgrid: true,
        gridcolor: "rgba(48,37,28,0.08)",
        linecolor: "rgba(48,37,28,0.22)",
        linewidth: 1.2,
        showline: true,
        tickfont: { size: 11, color: "#625247" },
        zeroline: false,
      },
      yaxis2: {
        title: { text: `TWD (${directionUnit})` },
        overlaying: "y",
        side: "right",
        range: [0, 360],
        dtick: 45,
        showgrid: false,
        linecolor: "rgba(48,37,28,0.22)",
        linewidth: 1.2,
        showline: true,
        tickfont: { size: 11, color: "#625247" },
        zeroline: false,
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
    [directionUnit, selectedTimestamp, speedUnit, title],
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
    <div className="weather-plot-card">
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

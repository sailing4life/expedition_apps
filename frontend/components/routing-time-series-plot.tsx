"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

import type { Config, Data, Layout } from "plotly.js";

import { TimeSeriesLineOutput } from "@/lib/types";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

type RoutingTimeSeriesPlotProps = {
  title: string;
  timestamps: string[];
  speedLines: TimeSeriesLineOutput[];
  directionLines: TimeSeriesLineOutput[];
  temperatureLines: TimeSeriesLineOutput[];
  markLines: Array<{ timestamp: string; label: string }>;
  speedUnit: string;
  directionUnit: string;
  temperatureUnit: string;
  labelEvery: number;
};

const SPEED_COLORS = ["#2563eb", "#0f766e", "#7c3aed", "#ea580c"];
const DIRECTION_COLORS = ["#dc2626", "#be123c"];
const TEMPERATURE_COLORS = ["#f97316", "#f59e0b", "#ef4444"];

function sanitizeFilename(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "chart";
}

function buildLabels(values: Array<number | null>, step: number, decimals: number): string[] {
  const safeStep = Math.max(1, step);
  return values.map((value, index) => {
    if (value === null) {
      return "";
    }
    if (index === 0 || index === values.length - 1 || index % safeStep === 0) {
      return value.toFixed(decimals);
    }
    return "";
  });
}

export function RoutingTimeSeriesPlot({
  title,
  timestamps,
  speedLines,
  directionLines,
  temperatureLines,
  markLines,
  speedUnit,
  directionUnit,
  temperatureUnit,
  labelEvery,
}: RoutingTimeSeriesPlotProps) {
  const xValues = useMemo(() => timestamps.map((value) => new Date(value)), [timestamps]);

  const data = useMemo<Data[]>(() => {
    const traces: Data[] = [];

    speedLines.forEach((line, index) => {
      traces.push({
        type: "scatter",
        mode: "text+lines+markers",
        name: line.label,
        x: xValues,
        y: line.values,
        yaxis: "y",
        marker: { color: SPEED_COLORS[index % SPEED_COLORS.length], size: 6, symbol: "circle" },
        line: { color: SPEED_COLORS[index % SPEED_COLORS.length], width: 2.4 },
        text: buildLabels(line.values, labelEvery, 1),
        textposition: "top center",
        textfont: { color: SPEED_COLORS[index % SPEED_COLORS.length], size: 10 },
        hovertemplate: `%{x|%d %b %Y %H:%M}<br>${line.label}: %{y:.1f} ${speedUnit}<extra></extra>`,
      });
    });

    directionLines.forEach((line, index) => {
      traces.push({
        type: "scatter",
        mode: "text+lines+markers",
        name: line.label,
        x: xValues,
        y: line.values,
        yaxis: "y2",
        marker: { color: DIRECTION_COLORS[index % DIRECTION_COLORS.length], size: 6, symbol: "circle" },
        line: { color: DIRECTION_COLORS[index % DIRECTION_COLORS.length], width: 2.4 },
        text: buildLabels(line.values, labelEvery, 0),
        textposition: "bottom center",
        textfont: { color: DIRECTION_COLORS[index % DIRECTION_COLORS.length], size: 10 },
        hovertemplate: `%{x|%d %b %Y %H:%M}<br>${line.label}: %{y:.0f} ${directionUnit}<extra></extra>`,
      });
    });

    temperatureLines.forEach((line, index) => {
      traces.push({
        type: "scatter",
        mode: "text+lines+markers",
        name: line.label,
        x: xValues,
        y: line.values,
        yaxis: "y",
        marker: { color: TEMPERATURE_COLORS[index % TEMPERATURE_COLORS.length], size: 5, symbol: "diamond" },
        line: { color: TEMPERATURE_COLORS[index % TEMPERATURE_COLORS.length], width: 2, dash: "dash" },
        text: buildLabels(line.values, labelEvery, 1),
        textposition: "top left",
        textfont: { color: TEMPERATURE_COLORS[index % TEMPERATURE_COLORS.length], size: 10 },
        hovertemplate: `%{x|%d %b %Y %H:%M}<br>${line.label}: %{y:.1f} ${temperatureUnit}<extra></extra>`,
      });
    });

    return traces;
  }, [directionLines, directionUnit, labelEvery, speedLines, speedUnit, temperatureLines, temperatureUnit, xValues]);

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
      height: 700,
      margin: { t: 130, r: 92, b: 88, l: 78 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "#ffffff",
      hovermode: "x unified",
      dragmode: "pan",
      legend: {
        orientation: "h",
        x: 0,
        xanchor: "left",
        y: 1.05,
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
        rangeslider: {
          visible: true,
          thickness: 0.12,
          bgcolor: "rgba(244,239,231,0.9)",
          bordercolor: "rgba(48,37,28,0.08)",
          borderwidth: 1,
        },
      },
      yaxis: {
        title: { text: `Wind Speed (${speedUnit})` },
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
      shapes: markLines.map((mark) => ({
        type: "line",
        x0: mark.timestamp,
        x1: mark.timestamp,
        y0: 0,
        y1: 1,
        xref: "x",
        yref: "paper",
        line: {
          color: "rgba(31,23,17,0.3)",
          width: 1.6,
          dash: "dash",
        },
      })),
      annotations: markLines.map((mark) => ({
        x: mark.timestamp,
        y: 1.01,
        xref: "x",
        yref: "paper",
        text: mark.label,
        showarrow: false,
        textangle: "-90",
        font: { size: 10, color: "#625247" },
        bgcolor: "rgba(255,255,255,0.75)",
        bordercolor: "rgba(48,37,28,0.08)",
        borderpad: 2,
      })),
    }),
    [directionUnit, markLines, speedUnit, title],
  );

  const config = useMemo<Partial<Config>>(
    () => ({
      responsive: true,
      displaylogo: false,
      displayModeBar: true,
      toImageButtonOptions: {
        format: "png",
        filename: sanitizeFilename(title),
        height: 1100,
        width: 1800,
        scale: 2,
      },
      modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d", "resetScale2d", "toggleSpikelines"],
    }),
    [title],
  );

  return (
    <div className="routing-plot-card">
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

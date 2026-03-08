"use client";

import { useMemo, useRef } from "react";

type ChartLine = {
  label: string;
  values: Array<number | null>;
  color: string;
  dashed?: boolean;
  marker?: "circle" | "cross";
  labelColor?: string;
};

type ChartBand = {
  label: string;
  lower: Array<number | null>;
  upper: Array<number | null>;
  color: string;
};

type TimeSeriesChartProps = {
  title: string;
  timestamps: string[];
  lines: ChartLine[];
  selectedIndex: number;
  valueSuffix?: string;
  valueDecimals?: number;
  yDomain?: [number, number];
  height?: number;
  band?: ChartBand | null;
  showPointLabels?: boolean;
  pointLabelOffset?: number;
  maxLabeledPoints?: number;
  xAxisLabel?: string;
  yAxisLabel?: string;
};

const CHART_WIDTH = 960;

function clamp(index: number, size: number): number {
  if (size <= 0) {
    return 0;
  }
  return Math.min(Math.max(index, 0), size - 1);
}

function formatNumber(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

function formatTimeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildTickIndices(size: number, maxTicks = 6): number[] {
  if (size <= 1) {
    return [0];
  }
  const steps = Math.min(size, maxTicks);
  const ticks = new Set<number>();
  for (let index = 0; index < steps; index += 1) {
    ticks.add(Math.round((index * (size - 1)) / (steps - 1)));
  }
  return Array.from(ticks).sort((left, right) => left - right);
}

function buildLinePath(
  values: Array<number | null>,
  xAt: (index: number) => number,
  yAt: (value: number) => number,
): string {
  let path = "";
  let open = false;

  values.forEach((value, index) => {
    if (value === null) {
      open = false;
      return;
    }

    const command = open ? "L" : "M";
    path += `${command}${xAt(index)},${yAt(value)} `;
    open = true;
  });

  return path.trim();
}

function buildBandPath(
  lower: Array<number | null>,
  upper: Array<number | null>,
  xAt: (index: number) => number,
  yAt: (value: number) => number,
): string {
  const validIndices = lower
    .map((value, index) => (value !== null && upper[index] !== null ? index : null))
    .filter((value): value is number => value !== null);

  if (validIndices.length < 2) {
    return "";
  }

  const lowerPath = validIndices
    .map((index, position) => `${position === 0 ? "M" : "L"}${xAt(index)},${yAt(lower[index] as number)}`)
    .join(" ");
  const upperPath = [...validIndices]
    .reverse()
    .map((index) => `L${xAt(index)},${yAt(upper[index] as number)}`)
    .join(" ");

  return `${lowerPath} ${upperPath} Z`;
}

function pointLabelStep(size: number, maxLabeledPoints: number): number {
  if (size <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(size / Math.max(1, maxLabeledPoints)));
}

function sanitizeFilename(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "chart";
}

function legendRows(
  items: Array<{ label: string; color: string; dashed?: boolean; marker?: "circle" | "cross"; band?: boolean }>,
  maxWidth: number,
): Array<Array<{ label: string; color: string; dashed?: boolean; marker?: "circle" | "cross"; band?: boolean }>> {
  const rows: Array<Array<{ label: string; color: string; dashed?: boolean; marker?: "circle" | "cross"; band?: boolean }>> = [];
  let currentRow: Array<{ label: string; color: string; dashed?: boolean; marker?: "circle" | "cross"; band?: boolean }> = [];
  let currentWidth = 0;

  items.forEach((item) => {
    const estimatedWidth = 38 + item.label.length * 7;
    if (currentRow.length > 0 && currentWidth + estimatedWidth > maxWidth) {
      rows.push(currentRow);
      currentRow = [];
      currentWidth = 0;
    }
    currentRow.push(item);
    currentWidth += estimatedWidth + 12;
  });

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

function exportSvgStyles(): string {
  return `
    text {
      font-family: Arial, sans-serif;
    }
    .time-series-chart__plot-frame {
      fill: rgba(255, 255, 255, 0.92);
      stroke: rgba(48, 37, 28, 0.1);
      stroke-width: 1;
    }
    .time-series-chart__grid {
      stroke: rgba(48, 37, 28, 0.1);
      stroke-width: 1;
    }
    .time-series-chart__grid--vertical {
      stroke-dasharray: 4 8;
    }
    .time-series-chart__axis-line {
      stroke: rgba(48, 37, 28, 0.22);
      stroke-width: 1.2;
    }
    .time-series-chart__axis-label {
      fill: #6b5d52;
      font-size: 11px;
    }
    .time-series-chart__axis-title {
      fill: #1f1711;
      font-size: 12px;
      font-weight: 700;
    }
    .time-series-chart__band {
      stroke: none;
    }
    .time-series-chart__line {
      stroke-width: 2.4;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .time-series-chart__marker {
      stroke: white;
      stroke-width: 1.5;
    }
    .time-series-chart__marker-cross {
      stroke-width: 1.8;
      stroke-linecap: round;
    }
    .time-series-chart__value-label {
      font-size: 11px;
      font-weight: 700;
      paint-order: stroke;
      stroke: rgba(255, 255, 255, 0.92);
      stroke-width: 4px;
      stroke-linejoin: round;
    }
    .time-series-chart__cursor {
      stroke: rgba(31, 23, 17, 0.45);
      stroke-width: 2;
      stroke-dasharray: 6 8;
    }
    .time-series-chart__point {
      stroke: white;
      stroke-width: 2;
    }
  `;
}

export function TimeSeriesChart({
  title,
  timestamps,
  lines,
  selectedIndex,
  valueSuffix = "",
  valueDecimals = 1,
  yDomain,
  height = 340,
  band = null,
  showPointLabels = false,
  pointLabelOffset = 14,
  maxLabeledPoints = 20,
  xAxisLabel,
  yAxisLabel,
}: TimeSeriesChartProps) {
  const margins = {
    top: 22,
    right: 20,
    bottom: xAxisLabel ? 60 : 44,
    left: yAxisLabel ? 84 : 64,
  };
  const innerWidth = CHART_WIDTH - margins.left - margins.right;
  const innerHeight = height - margins.top - margins.bottom;
  const safeSelectedIndex = clamp(selectedIndex, timestamps.length);
  const subtitle = timestamps[safeSelectedIndex] ? formatTimeLabel(timestamps[safeSelectedIndex]) : "";

  const computedDomain = useMemo<[number, number]>(() => {
    if (yDomain) {
      return yDomain;
    }

    const values = lines.flatMap((line) => line.values.filter((value): value is number => value !== null));
    if (band) {
      values.push(...band.lower.filter((value): value is number => value !== null));
      values.push(...band.upper.filter((value): value is number => value !== null));
    }

    if (values.length === 0) {
      return [0, 1];
    }

    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);
    if (minValue === maxValue) {
      const padding = Math.abs(minValue) > 0 ? Math.abs(minValue) * 0.1 : 1;
      return [minValue - padding, maxValue + padding];
    }

    const padding = (maxValue - minValue) * 0.08;
    minValue -= padding;
    maxValue += padding;
    return [minValue, maxValue];
  }, [band, lines, yDomain]);

  const [minValue, maxValue] = computedDomain;
  const yScale = (value: number) => margins.top + ((maxValue - value) / (maxValue - minValue || 1)) * innerHeight;
  const xScale = (index: number) => {
    if (timestamps.length <= 1) {
      return margins.left + innerWidth / 2;
    }
    return margins.left + (index / (timestamps.length - 1)) * innerWidth;
  };

  const tickIndices = buildTickIndices(timestamps.length);
  const yTicks = Array.from({ length: 5 }, (_, index) => minValue + ((maxValue - minValue) / 4) * index);
  const selectedX = xScale(safeSelectedIndex);
  const labelStep = pointLabelStep(timestamps.length, maxLabeledPoints);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const legendItems = [
    ...lines.map((line) => ({
      label: line.label,
      color: line.color,
      dashed: line.dashed,
      marker: line.marker,
    })),
    ...(band ? [{ label: band.label, color: band.color, band: true as const }] : []),
  ];

  async function handleExportPng() {
    if (!svgRef.current) {
      return;
    }

    const svgNode = svgRef.current.cloneNode(true) as SVGSVGElement;
    const styleNode = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styleNode.textContent = exportSvgStyles();
    svgNode.insertBefore(styleNode, svgNode.firstChild);

    const serializer = new XMLSerializer();
    const svgMarkup = serializer.serializeToString(svgNode);
    const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      const image = new Image();
      image.decoding = "async";

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Could not render chart export."));
        image.src = svgUrl;
      });

      const scale = 2;
      const headerHeight = 64;
      const exportPadding = 24;
      const legendLineHeight = 24;
      const legendRowsOutput = legendRows(legendItems, CHART_WIDTH - exportPadding * 2);
      const legendHeight = legendRowsOutput.length > 0 ? 24 + legendRowsOutput.length * legendLineHeight : 0;
      const canvas = document.createElement("canvas");
      canvas.width = CHART_WIDTH * scale;
      canvas.height = (height + headerHeight + legendHeight + exportPadding) * scale;

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas export is not available in this browser.");
      }

      context.scale(scale, scale);
      context.fillStyle = "#efe7da";
      context.fillRect(0, 0, CHART_WIDTH, height + headerHeight + legendHeight + exportPadding);
      context.fillStyle = "#fffdf9";
      context.strokeStyle = "rgba(48, 37, 28, 0.12)";
      context.lineWidth = 1;
      context.beginPath();
      context.roundRect(12, 12, CHART_WIDTH - 24, height + headerHeight + legendHeight, 22);
      context.fill();
      context.stroke();

      context.fillStyle = "#1f1711";
      context.font = "700 20px Arial";
      context.fillText(title, 28, 34);
      if (subtitle) {
        context.fillStyle = "#625247";
        context.font = "14px Arial";
        context.fillText(subtitle, 28, 56);
      }

      context.drawImage(image, 0, headerHeight + 8, CHART_WIDTH, height);

      if (legendRowsOutput.length > 0) {
        let y = headerHeight + height + 22;
        legendRowsOutput.forEach((row) => {
          let x = exportPadding + 4;
          row.forEach((item) => {
            if (item.band) {
              context.fillStyle = item.color;
              context.fillRect(x, y - 9, 18, 10);
              context.strokeStyle = "rgba(48, 37, 28, 0.12)";
              context.strokeRect(x, y - 9, 18, 10);
            } else {
              context.strokeStyle = item.color;
              context.lineWidth = 2.4;
              if (item.dashed) {
                context.setLineDash([8, 6]);
              } else {
                context.setLineDash([]);
              }
              context.beginPath();
              context.moveTo(x, y - 4);
              context.lineTo(x + 20, y - 4);
              context.stroke();
              context.setLineDash([]);
              if (item.marker === "cross") {
                context.beginPath();
                context.moveTo(x + 10 - 4, y - 4 - 4);
                context.lineTo(x + 10 + 4, y - 4 + 4);
                context.moveTo(x + 10 - 4, y - 4 + 4);
                context.lineTo(x + 10 + 4, y - 4 - 4);
                context.stroke();
              } else {
                context.fillStyle = item.color;
                context.beginPath();
                context.arc(x + 10, y - 4, 3.5, 0, Math.PI * 2);
                context.fill();
              }
            }

            context.fillStyle = "#1f1711";
            context.font = "13px Arial";
            context.fillText(item.label, x + 28, y);
            x += 38 + item.label.length * 7;
          });
          y += legendLineHeight;
        });
      }

      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
            return;
          }
          reject(new Error("PNG export failed."));
        }, "image/png");
      });

      const downloadUrl = URL.createObjectURL(pngBlob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = `${sanitizeFilename(title)}.png`;
      anchor.click();
      URL.revokeObjectURL(downloadUrl);
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  return (
    <div className="time-series-chart">
      <div className="time-series-chart__header">
        <div className="time-series-chart__heading">
          <h3>{title}</h3>
          {timestamps[safeSelectedIndex] ? <span>{formatTimeLabel(timestamps[safeSelectedIndex])}</span> : null}
        </div>
        <button className="chart-export-button" type="button" onClick={handleExportPng}>
          Export PNG
        </button>
      </div>
      <svg ref={svgRef} className="time-series-chart__svg" viewBox={`0 0 ${CHART_WIDTH} ${height}`} role="img">
        <rect height={height} rx="20" ry="20" width={CHART_WIDTH} x="0" y="0" fill="rgba(255,255,255,0.5)" />
        <rect
          className="time-series-chart__plot-frame"
          height={innerHeight}
          rx="12"
          ry="12"
          width={innerWidth}
          x={margins.left}
          y={margins.top}
        />

        {yTicks.map((tick) => (
          <g key={`tick-${tick}`}>
            <line
              className="time-series-chart__grid"
              x1={margins.left}
              x2={CHART_WIDTH - margins.right}
              y1={yScale(tick)}
              y2={yScale(tick)}
            />
            <text className="time-series-chart__axis-label" textAnchor="end" x={margins.left - 12} y={yScale(tick) + 4}>
              {formatNumber(tick, valueDecimals)}
              {valueSuffix}
            </text>
          </g>
        ))}

        {tickIndices.map((tick) => (
          <g key={`time-${tick}`}>
            <line
              className="time-series-chart__grid time-series-chart__grid--vertical"
              x1={xScale(tick)}
              x2={xScale(tick)}
              y1={margins.top}
              y2={height - margins.bottom}
            />
            <text className="time-series-chart__axis-label" textAnchor="middle" x={xScale(tick)} y={height - (xAxisLabel ? 28 : 14)}>
              {formatTimeLabel(timestamps[tick] ?? "")}
            </text>
          </g>
        ))}

        {band ? <path className="time-series-chart__band" d={buildBandPath(band.lower, band.upper, xScale, yScale)} fill={band.color} /> : null}

        {lines.map((line) => (
          <path
            key={line.label}
            className="time-series-chart__line"
            d={buildLinePath(line.values, xScale, yScale)}
            fill="none"
            stroke={line.color}
            strokeDasharray={line.dashed ? "8 6" : undefined}
          />
        ))}

        {lines.map((line) =>
          line.values.map((value, index) => {
            if (value === null) {
              return null;
            }

            const x = xScale(index);
            const y = yScale(value);

            if (line.marker === "cross") {
              return (
                <g key={`${line.label}-marker-${index}`}>
                  <line className="time-series-chart__marker-cross" stroke={line.color} x1={x - 4} x2={x + 4} y1={y - 4} y2={y + 4} />
                  <line className="time-series-chart__marker-cross" stroke={line.color} x1={x - 4} x2={x + 4} y1={y + 4} y2={y - 4} />
                </g>
              );
            }

            return <circle key={`${line.label}-marker-${index}`} className="time-series-chart__marker" cx={x} cy={y} fill={line.color} r="3.5" />;
          }),
        )}

        {showPointLabels
          ? lines.map((line) =>
              line.values.map((value, index) => {
                if (value === null || index % labelStep !== 0) {
                  return null;
                }

                return (
                  <text
                    key={`${line.label}-label-${index}`}
                    className="time-series-chart__value-label"
                    fill={line.labelColor ?? line.color}
                    textAnchor="middle"
                    x={xScale(index)}
                    y={yScale(value) - pointLabelOffset}
                  >
                    {formatNumber(value, valueDecimals)}
                  </text>
                );
              }),
            )
          : null}

        <line
          className="time-series-chart__axis-line"
          x1={margins.left}
          x2={margins.left}
          y1={margins.top}
          y2={height - margins.bottom}
        />
        <line
          className="time-series-chart__axis-line"
          x1={margins.left}
          x2={CHART_WIDTH - margins.right}
          y1={height - margins.bottom}
          y2={height - margins.bottom}
        />

        <line
          className="time-series-chart__cursor"
          x1={selectedX}
          x2={selectedX}
          y1={margins.top}
          y2={height - margins.bottom}
        />

        {lines.map((line) => {
          const value = line.values[safeSelectedIndex];
          if (value === null) {
            return null;
          }
          return (
            <circle
              key={`${line.label}-point`}
              className="time-series-chart__point"
              cx={selectedX}
              cy={yScale(value)}
              fill={line.color}
              r="4.5"
            />
          );
        })}

        {xAxisLabel ? (
          <text className="time-series-chart__axis-title" textAnchor="middle" x={CHART_WIDTH / 2} y={height - 6}>
            {xAxisLabel}
          </text>
        ) : null}

        {yAxisLabel ? (
          <text
            className="time-series-chart__axis-title"
            textAnchor="middle"
            transform={`rotate(-90 22 ${height / 2})`}
            x={22}
            y={height / 2}
          >
            {yAxisLabel}
          </text>
        ) : null}
      </svg>

      <div className="time-series-chart__legend">
        {lines.map((line) => (
          <span className="legend-chip" key={line.label}>
            <i style={{ background: line.color }} />
            {line.label}
          </span>
        ))}
        {band ? (
          <span className="legend-chip">
            <i style={{ background: band.color }} />
            {band.label}
          </span>
        ) : null}
      </div>
    </div>
  );
}

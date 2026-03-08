"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { ModelAgreementPlot } from "@/components/model-agreement-plot";
import { ModelAgreementTimeSeriesOutput, ToolAppDetail, ToolAppField, ToolRunResponse } from "@/lib/types";

type ModelAgreementWorkspaceProps = {
  apiBaseUrl: string;
  app: ToolAppDetail;
};

type PrimitiveValue = string | boolean;
type AgreementTab = "speed" | "direction" | "preview" | "download";

const MODEL_COLORS = ["#0f766e", "#dc2626", "#1d4ed8", "#ea580c", "#7c3aed", "#0f172a"];
const AGREEMENT_COLORS = ["#0f766e", "#b45309", "#0f172a"];

function isCheckboxField(field: ToolAppField): boolean {
  return field.type === "checkbox";
}

function isFileField(field: ToolAppField): boolean {
  return field.type === "file";
}

function buildInitialValues(fields: ToolAppField[]): Record<string, PrimitiveValue> {
  return fields.reduce<Record<string, PrimitiveValue>>((accumulator, field) => {
    if (isCheckboxField(field)) {
      accumulator[field.key] = field.default === 1 || field.default === "1" || field.default === "true";
      return accumulator;
    }

    accumulator[field.key] = field.default === null || field.default === undefined ? "" : String(field.default);
    return accumulator;
  }, {});
}

function buildFormData(
  values: Record<string, PrimitiveValue>,
  files: Record<string, File[]>,
  fields: ToolAppField[],
): FormData {
  const formData = new FormData();

  for (const field of fields) {
    if (isFileField(field)) {
      for (const file of files[field.key] ?? []) {
        formData.append(field.key, file);
      }
      continue;
    }

    const rawValue = values[field.key];
    if (rawValue === "" || rawValue === undefined) {
      continue;
    }
    formData.append(field.key, String(rawValue));
  }

  return formData;
}

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { detail?: string };
    if (payload.detail) {
      return payload.detail;
    }
  }

  const text = await response.text();
  return text || `The backend returned ${response.status}.`;
}

function fileCount(files: Record<string, File[]>, key: string): number {
  return files[key]?.length ?? 0;
}

function isModelAgreementTimeseries(value: ToolRunResponse["outputs"]["timeseries"]): value is ModelAgreementTimeSeriesOutput {
  return Boolean(value && ("speed" in value || "direction" in value));
}

function clampIndex(index: number, size: number): number {
  if (size <= 0) {
    return 0;
  }
  return Math.min(Math.max(index, 0), size - 1);
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "No time selected";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatSnapshotValue(value: string | number | null | undefined, suffix = "", decimals = 1): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "number") {
    return `${value.toFixed(decimals)}${suffix ? ` ${suffix}` : ""}`;
  }

  return String(value);
}

function sliceSeries<T>(values: T[], startIndex: number, endIndex: number): T[] {
  return values.slice(startIndex, endIndex + 1);
}

function rangeRows(timeseries: ModelAgreementTimeSeriesOutput | null, startIndex: number, endIndex: number, selectedIndex: number) {
  if (!timeseries || timeseries.rows.length === 0) {
    return [];
  }

  return timeseries.rows.slice(startIndex, endIndex + 1).map((row, index) => ({
    isSelected: startIndex + index === selectedIndex,
    row,
  }));
}

function renderField(
  field: ToolAppField,
  values: Record<string, PrimitiveValue>,
  files: Record<string, File[]>,
  setValues: Dispatch<SetStateAction<Record<string, PrimitiveValue>>>,
  setFiles: Dispatch<SetStateAction<Record<string, File[]>>>,
) {
  const commonLabel = (
    <span className="field__label">
      {field.label}
      {field.required ? " *" : ""}
    </span>
  );

  if (field.type === "file") {
    const count = fileCount(files, field.key);
    const selectedFiles = files[field.key] ?? [];
    return (
      <label className="field field--file agreement-upload" key={field.key}>
        {commonLabel}
        <input
          accept={field.accept ?? undefined}
          multiple={field.multiple}
          name={field.key}
          required={field.required}
          type="file"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setFiles((current) => ({
              ...current,
              [field.key]: Array.from(event.target.files ?? []),
            }))
          }
        />
        <div className="agreement-upload__meta">
          <strong>{count > 0 ? `${count} file${count === 1 ? "" : "s"} selected` : "Drop or choose files"}</strong>
          <span>{field.help_text ?? (field.multiple ? "Upload multiple files." : "Upload a single file.")}</span>
        </div>
        {selectedFiles.length > 0 ? (
          <div className="agreement-upload__files">
            {selectedFiles.map((file) => (
              <span className="agreement-upload__file" key={`${file.name}-${file.lastModified}`}>
                {file.name}
              </span>
            ))}
          </div>
        ) : null}
      </label>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="checkbox-field" key={field.key}>
        <input
          checked={Boolean(values[field.key])}
          name={field.key}
          type="checkbox"
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              [field.key]: event.target.checked,
            }))
          }
        />
        <div>
          {commonLabel}
          {field.help_text ? <small>{field.help_text}</small> : null}
        </div>
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="field" key={field.key}>
        {commonLabel}
        <select
          name={field.key}
          value={String(values[field.key] ?? "")}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              [field.key]: event.target.value,
            }))
          }
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {field.help_text ? <small>{field.help_text}</small> : null}
      </label>
    );
  }

  return (
    <label className="field" key={field.key}>
      {commonLabel}
      <input
        max={field.max_value ?? undefined}
        min={field.min_value ?? undefined}
        name={field.key}
        required={field.required}
        step={field.step ?? undefined}
        type={field.type === "number" ? "number" : field.type}
        value={String(values[field.key] ?? "")}
        onChange={(event) =>
          setValues((current) => ({
            ...current,
            [field.key]: event.target.value,
          }))
        }
      />
      {field.help_text ? <small>{field.help_text}</small> : null}
    </label>
  );
}

export function ModelAgreementWorkspace({ apiBaseUrl, app }: ModelAgreementWorkspaceProps) {
  const [values, setValues] = useState<Record<string, PrimitiveValue>>(() => buildInitialValues(app.fields));
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [result, setResult] = useState<ToolRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInputs, setShowInputs] = useState(true);
  const [activeTab, setActiveTab] = useState<AgreementTab>("speed");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);

  const uploadField = app.fields.find((field) => field.key === "csv_files");
  const primaryFields = app.fields.filter((field) => ["speed_unit", "band_val"].includes(field.key));
  const toggleFields = app.fields.filter(
    (field) => field.type === "checkbox" && field.key !== "csv_files",
  );
  const selectedCsvFiles = files.csv_files ?? [];

  const speedFigure = useMemo(
    () => result?.outputs.figures?.find((figure) => figure.title.toLowerCase().includes("speed")) ?? null,
    [result],
  );
  const directionFigure = useMemo(
    () => result?.outputs.figures?.find((figure) => figure.title.toLowerCase().includes("direction")) ?? null,
    [result],
  );
  const timeseries = isModelAgreementTimeseries(result?.outputs.timeseries) ? result.outputs.timeseries : null;
  const timestamps = timeseries?.timestamps ?? [];
  const previewTable = result?.outputs.tables?.[0] ?? null;
  const download = result?.outputs.downloads?.[0] ?? null;
  const speedSeries = timeseries?.speed ?? null;
  const directionSeries = timeseries?.direction ?? null;
  const hasSpeedView = Boolean(speedSeries || speedFigure);
  const hasDirectionView = Boolean(directionSeries || directionFigure);

  useEffect(() => {
    if (timestamps.length === 0) {
      setSelectedIndex(0);
      setRangeStart(0);
      setRangeEnd(0);
      return;
    }
    setRangeStart(0);
    setRangeEnd(timestamps.length - 1);
    setSelectedIndex(Math.floor((timestamps.length - 1) / 2));
  }, [result, timestamps.length]);

  useEffect(() => {
    if (timestamps.length === 0) {
      return;
    }
    setSelectedIndex((current) => clampIndex(Math.min(Math.max(current, rangeStart), rangeEnd), timestamps.length));
  }, [rangeEnd, rangeStart, timestamps.length]);

  const speedLines = useMemo(
    () =>
      speedSeries
        ? [
            ...speedSeries.models.map((series, index) => ({
              label: series.label,
              values: series.values,
              color: MODEL_COLORS[index % MODEL_COLORS.length],
            })),
            ...(speedSeries.mean
              ? [
                  {
                    label: speedSeries.mean.label,
                    values: speedSeries.mean.values,
                    color: "#111827",
                    dashed: true,
                  },
                ]
              : []),
          ]
        : [],
    [speedSeries],
  );

  const speedAgreementLines = useMemo(
    () =>
      speedSeries?.agreement.map((series, index) => ({
        label: series.label,
        values: series.values,
        color: AGREEMENT_COLORS[index % AGREEMENT_COLORS.length],
      })) ?? [],
    [speedSeries],
  );

  const directionLines = useMemo(
    () =>
      directionSeries
        ? [
            ...directionSeries.models.map((series, index) => ({
              label: series.label,
              values: series.values,
              color: MODEL_COLORS[index % MODEL_COLORS.length],
            })),
            ...(directionSeries.mean
              ? [
                  {
                    label: directionSeries.mean.label,
                    values: directionSeries.mean.values,
                    color: "#111827",
                    dashed: true,
                  },
                ]
              : []),
          ]
        : [],
    [directionSeries],
  );

  const directionAgreementLines = useMemo(
    () =>
      directionSeries?.agreement.map((series, index) => ({
        label: series.label,
        values: series.values,
        color: AGREEMENT_COLORS[index % AGREEMENT_COLORS.length],
      })) ?? [],
    [directionSeries],
  );

  const safeRangeStart = clampIndex(Math.min(rangeStart, rangeEnd), timestamps.length);
  const safeRangeEnd = clampIndex(Math.max(rangeStart, rangeEnd), timestamps.length);
  const visibleTimestamps = useMemo(
    () => sliceSeries(timestamps, safeRangeStart, safeRangeEnd),
    [timestamps, safeRangeEnd, safeRangeStart],
  );
  const visibleSelectedIndex = clampIndex(selectedIndex - safeRangeStart, visibleTimestamps.length);
  const focusedRows = useMemo(
    () => rangeRows(timeseries, safeRangeStart, safeRangeEnd, selectedIndex),
    [timeseries, safeRangeStart, safeRangeEnd, selectedIndex],
  );
  const selectedRow = timeseries?.rows[selectedIndex] ?? null;
  const selectedTimestamp = timestamps[selectedIndex] ?? null;
  const visiblePointCount = visibleTimestamps.length;
  const focusedModelCards = useMemo(() => {
    if (!timeseries) {
      return [];
    }

    const cards = new Map<string, { label: string; speed: string; direction: string }>();
    speedSeries?.models.forEach((series) => {
      const rawValue = selectedRow?.[series.column_key ?? ""];
      cards.set(series.label, {
        label: series.label,
        speed: formatSnapshotValue(rawValue, speedSeries.unit, 1),
        direction: cards.get(series.label)?.direction ?? "—",
      });
    });

    directionSeries?.models.forEach((series) => {
      const rawValue = selectedRow?.[series.column_key ?? ""];
      cards.set(series.label, {
        label: series.label,
        speed: cards.get(series.label)?.speed ?? "—",
        direction: formatSnapshotValue(rawValue, directionSeries.unit, 0),
      });
    });

    return Array.from(cards.values());
  }, [directionSeries, selectedRow, speedSeries, timeseries]);

  const focusedAgreementCards = useMemo(() => {
    if (!selectedRow) {
      return [];
    }

    return [
      speedSeries?.agreement[0]
        ? {
            label: speedSeries.agreement[0].label,
            value: formatSnapshotValue(selectedRow[speedSeries.agreement[0].column_key ?? ""], "%", 1),
          }
        : null,
      speedSeries?.agreement[1]
        ? {
            label: speedSeries.agreement[1].label,
            value: formatSnapshotValue(selectedRow[speedSeries.agreement[1].column_key ?? ""], "%", 1),
          }
        : null,
      directionSeries?.agreement[0]
        ? {
            label: directionSeries.agreement[0].label,
            value: formatSnapshotValue(selectedRow[directionSeries.agreement[0].column_key ?? ""], "%", 1),
          }
        : null,
    ].filter((item): item is { label: string; value: string } => item !== null);
  }, [directionSeries, selectedRow, speedSeries]);

  const visibleSpeedLines = useMemo(
    () =>
      speedLines.map((line) => ({
        ...line,
        values: sliceSeries(line.values, safeRangeStart, safeRangeEnd),
        showLabels: ("dashed" in line && Boolean(line.dashed)) || visibleTimestamps.length <= 8,
      })),
    [safeRangeEnd, safeRangeStart, speedLines, visibleTimestamps.length],
  );

  const visibleSpeedAgreementLines = useMemo(
    () =>
      speedAgreementLines.map((line) => ({
        ...line,
        values: sliceSeries(line.values, safeRangeStart, safeRangeEnd),
        showLabels: true,
      })),
    [safeRangeEnd, safeRangeStart, speedAgreementLines],
  );

  const visibleSpeedBand = useMemo(
    () =>
      speedSeries?.spread
        ? {
            label: speedSeries.spread.label,
            lower: sliceSeries(speedSeries.spread.lower, safeRangeStart, safeRangeEnd),
            upper: sliceSeries(speedSeries.spread.upper, safeRangeStart, safeRangeEnd),
            color: "rgba(15, 118, 110, 0.14)",
          }
        : null,
    [safeRangeEnd, safeRangeStart, speedSeries],
  );

  const visibleDirectionLines = useMemo(
    () =>
      directionLines.map((line) => ({
        ...line,
        values: sliceSeries(line.values, safeRangeStart, safeRangeEnd),
        showLabels: ("dashed" in line && Boolean(line.dashed)) || visibleTimestamps.length <= 8,
      })),
    [directionLines, safeRangeEnd, safeRangeStart, visibleTimestamps.length],
  );

  const visibleDirectionAgreementLines = useMemo(
    () =>
      directionAgreementLines.map((line) => ({
        ...line,
        values: sliceSeries(line.values, safeRangeStart, safeRangeEnd),
        showLabels: true,
      })),
    [directionAgreementLines, safeRangeEnd, safeRangeStart],
  );

  const visibleDirectionBand = useMemo(
    () =>
      directionSeries?.spread
        ? {
            label: directionSeries.spread.label,
            lower: sliceSeries(directionSeries.spread.lower, safeRangeStart, safeRangeEnd),
            upper: sliceSeries(directionSeries.spread.upper, safeRangeStart, safeRangeEnd),
            color: "rgba(29, 78, 216, 0.14)",
          }
        : null,
    [directionSeries, safeRangeEnd, safeRangeStart],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/apps/${app.slug}/run`, {
        method: "POST",
        body: buildFormData(values, files, app.fields),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as ToolRunResponse;
      const payloadTimeseries = isModelAgreementTimeseries(payload.outputs.timeseries) ? payload.outputs.timeseries : null;
      const nextTab: AgreementTab = payloadTimeseries?.speed || payload.outputs.figures?.find((figure) => figure.title.toLowerCase().includes("speed"))
        ? "speed"
        : payloadTimeseries?.direction || payload.outputs.figures?.find((figure) => figure.title.toLowerCase().includes("direction"))
          ? "direction"
          : payload.outputs.tables?.length
            ? "preview"
            : "download";
      setResult(payload);
      setShowInputs(false);
      setActiveTab(nextTab);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "The request failed before the processor returned a result.",
      );
      setResult(null);
      setShowInputs(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="agreement-shell">
      <section className="panel agreement-control">
        <div className="agreement-control__header">
          <div>
            <p className="eyebrow">Model Inputs</p>
            <h2>Compare Meteograms</h2>
            <p>{app.description}</p>
          </div>
          {result ? (
            <button className="secondary-button" type="button" onClick={() => setShowInputs((current) => !current)}>
              {showInputs ? "Hide setup" : "Edit setup"}
            </button>
          ) : null}
        </div>

        {showInputs ? (
          <form className="agreement-form" onSubmit={handleSubmit}>
            {uploadField ? renderField(uploadField, values, files, setValues, setFiles) : null}

            <div className="agreement-settings">
              <div className="agreement-settings__group">
                <p className="eyebrow">Core Settings</p>
                <div className="agreement-settings__grid">
                  {primaryFields.map((field) => renderField(field, values, files, setValues, setFiles))}
                </div>
              </div>

              <div className="agreement-settings__group">
                <p className="eyebrow">Display Options</p>
                <div className="agreement-toggle-grid">
                  {toggleFields.map((field) => renderField(field, values, files, setValues, setFiles))}
                </div>
              </div>
            </div>

            <div className="agreement-actions">
              <button className="primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Processing..." : result ? "Run again" : "Generate comparison"}
              </button>
              <p className="form-actions__hint">Upload at least two model files. The output opens in full-width analysis tabs below.</p>
            </div>
          </form>
        ) : (
          <div className="agreement-summary">
            <div className="agreement-summary__chips">
              <div className="summary-chip">
                <span>Files</span>
                <strong>{fileCount(files, "csv_files")}</strong>
              </div>
              <div className="summary-chip">
                <span>Speed Unit</span>
                <strong>{String(values.speed_unit ?? "kt")}</strong>
              </div>
              <div className="summary-chip">
                <span>Band</span>
                <strong>{String(values.band_val ?? "2")}</strong>
              </div>
            </div>
            {selectedCsvFiles.length > 0 ? (
              <div className="agreement-summary__files">
                {selectedCsvFiles.map((file) => (
                  <span className="agreement-upload__file" key={`${file.name}-${file.lastModified}`}>
                    {file.name}
                  </span>
                ))}
              </div>
            ) : null}
            <button className="primary-button" type="button" onClick={() => setShowInputs(true)}>
              Edit inputs
            </button>
          </div>
        )}
      </section>

      <section className="panel agreement-results">
        <div className="agreement-results__header">
          <div>
            <p className="eyebrow">Analysis</p>
            <h2>Result Workspace</h2>
            <p>Speed and direction plots are separated into dedicated tabs so the figures can stay large.</p>
          </div>
          {result?.outputs.metrics && result.outputs.metrics.length > 0 ? (
            <div className="metric-grid agreement-metric-grid">
              {result.outputs.metrics.map((metric) => (
                <div className="metric-card" key={`${metric.label}-${metric.value}`}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {error ? <p className="result-panel__error">{error}</p> : null}

        {result ? (
          <div className="agreement-results__body">
            <div className="agreement-tabs">
              <button
                className={`agreement-tab${activeTab === "speed" ? " agreement-tab--active" : ""}`}
                disabled={!hasSpeedView}
                type="button"
                onClick={() => setActiveTab("speed")}
              >
                Speed
              </button>
              <button
                className={`agreement-tab${activeTab === "direction" ? " agreement-tab--active" : ""}`}
                disabled={!hasDirectionView}
                type="button"
                onClick={() => setActiveTab("direction")}
              >
                Direction
              </button>
              <button
                className={`agreement-tab${activeTab === "preview" ? " agreement-tab--active" : ""}`}
                type="button"
                onClick={() => setActiveTab("preview")}
              >
                Preview
              </button>
              <button
                className={`agreement-tab${activeTab === "download" ? " agreement-tab--active" : ""}`}
                type="button"
                onClick={() => setActiveTab("download")}
              >
                Download
              </button>
            </div>

            {timestamps.length > 0 ? (
              <div className="agreement-timeline">
                <div className="agreement-timeline__header">
                  <div>
                    <p className="eyebrow">Range And Focus</p>
                    <h3>{formatTimestamp(timestamps[safeRangeStart])} to {formatTimestamp(timestamps[safeRangeEnd])}</h3>
                  </div>
                  <div className="agreement-timeline__actions">
                    <button
                      className="secondary-button"
                      disabled={selectedIndex <= safeRangeStart}
                      type="button"
                      onClick={() => setSelectedIndex((current) => Math.max(safeRangeStart, current - 1))}
                    >
                      Previous
                    </button>
                    <button
                      className="secondary-button"
                      disabled={selectedIndex >= safeRangeEnd}
                      type="button"
                      onClick={() => setSelectedIndex((current) => Math.min(safeRangeEnd, current + 1))}
                    >
                      Next
                    </button>
                  </div>
                </div>
                <div className="agreement-range-grid">
                  <label className="agreement-range-control">
                    <span>Range start</span>
                    <strong>{formatTimestamp(timestamps[safeRangeStart])}</strong>
                    <input
                      className="agreement-slider"
                      max={Math.max(0, timestamps.length - 1)}
                      min={0}
                      step={1}
                      type="range"
                      value={safeRangeStart}
                      onChange={(event) => {
                        const nextStart = Number(event.target.value);
                        setRangeStart(Math.min(nextStart, safeRangeEnd));
                      }}
                    />
                  </label>
                  <label className="agreement-range-control">
                    <span>Range end</span>
                    <strong>{formatTimestamp(timestamps[safeRangeEnd])}</strong>
                    <input
                      className="agreement-slider"
                      max={Math.max(0, timestamps.length - 1)}
                      min={0}
                      step={1}
                      type="range"
                      value={safeRangeEnd}
                      onChange={(event) => {
                        const nextEnd = Number(event.target.value);
                        setRangeEnd(Math.max(nextEnd, safeRangeStart));
                      }}
                    />
                  </label>
                </div>
                <label className="agreement-range-control agreement-range-control--focus">
                  <span>Focused time inside range</span>
                  <strong>{formatTimestamp(selectedTimestamp)}</strong>
                  <input
                    className="agreement-slider"
                    max={safeRangeEnd}
                    min={safeRangeStart}
                    step={1}
                    type="range"
                    value={selectedIndex}
                    onChange={(event) => setSelectedIndex(Number(event.target.value))}
                  />
                </label>
                <div className="agreement-slider__meta">
                  <span>{formatTimestamp(timestamps[0])}</span>
                  <strong>
                    Showing {visiblePointCount} point{visiblePointCount === 1 ? "" : "s"}
                  </strong>
                  <span>{formatTimestamp(timestamps[timestamps.length - 1])}</span>
                </div>

                {(focusedModelCards.length > 0 || focusedAgreementCards.length > 0) && selectedRow ? (
                  <div className="agreement-focus-grid">
                    {focusedModelCards.map((card) => (
                      <article className="agreement-focus-card" key={card.label}>
                        <span>{card.label}</span>
                        <strong>{card.speed}</strong>
                        <small>{card.direction}</small>
                      </article>
                    ))}
                    {focusedAgreementCards.map((card) => (
                      <article className="agreement-focus-card agreement-focus-card--accent" key={card.label}>
                        <span>{card.label}</span>
                        <strong>{card.value}</strong>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="agreement-stage">
              {activeTab === "speed" && speedSeries ? (
                <div className="agreement-chart-stack">
                  <div className="agreement-figure-card">
                    <ModelAgreementPlot
                      band={visibleSpeedBand}
                      height={560}
                      lines={visibleSpeedLines}
                      selectedTimestamp={selectedTimestamp}
                      timestamps={visibleTimestamps}
                      title="Wind speed"
                      valueDecimals={1}
                      valueSuffix={speedSeries.unit}
                      yAxisLabel={`Wind speed (${speedSeries.unit})`}
                    />
                  </div>
                  {speedAgreementLines.length > 0 ? (
                    <div className="agreement-figure-card">
                      <ModelAgreementPlot
                        height={280}
                        lines={visibleSpeedAgreementLines}
                        selectedTimestamp={selectedTimestamp}
                        timestamps={visibleTimestamps}
                        title="Speed agreement"
                        valueDecimals={0}
                        valueSuffix="%"
                        yDomain={[0, 100]}
                        yAxisLabel="Agreement (%)"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeTab === "speed" && !speedSeries && speedFigure ? (
                <div className="agreement-figure-stage">
                  <div className="figure-card agreement-figure-card">
                    <div className="figure-card__header">
                      <p className="eyebrow">Speed</p>
                      <h3>{speedFigure.title}</h3>
                    </div>
                    <img alt={speedFigure.title} className="result-image agreement-result-image" src={speedFigure.image_data_url} />
                  </div>
                </div>
              ) : null}

              {activeTab === "direction" && directionSeries ? (
                <div className="agreement-chart-stack">
                  <div className="agreement-figure-card">
                    <ModelAgreementPlot
                      band={visibleDirectionBand}
                      height={560}
                      lines={visibleDirectionLines}
                      selectedTimestamp={selectedTimestamp}
                      timestamps={visibleTimestamps}
                      title="Wind direction"
                      valueDecimals={0}
                      valueSuffix="deg"
                      yDomain={directionSeries.wrap_display ? [0, 360] : undefined}
                      yAxisLabel="Wind direction (deg)"
                    />
                  </div>
                  {directionAgreementLines.length > 0 ? (
                    <div className="agreement-figure-card">
                      <ModelAgreementPlot
                        height={280}
                        lines={visibleDirectionAgreementLines}
                        selectedTimestamp={selectedTimestamp}
                        timestamps={visibleTimestamps}
                        title="Directional agreement"
                        valueDecimals={0}
                        valueSuffix="%"
                        yDomain={[0, 100]}
                        yAxisLabel="Agreement (%)"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeTab === "direction" && !directionSeries && directionFigure ? (
                <div className="agreement-figure-stage">
                  <div className="figure-card agreement-figure-card">
                    <div className="figure-card__header">
                      <p className="eyebrow">Direction</p>
                      <h3>{directionFigure.title}</h3>
                    </div>
                    <img
                      alt={directionFigure.title}
                      className="result-image agreement-result-image"
                      src={directionFigure.image_data_url}
                    />
                  </div>
                </div>
              ) : null}

              {activeTab === "preview" && timeseries ? (
                <div className="result-panel__content agreement-data-card">
                  <div className="figure-card__header">
                    <div>
                      <p className="eyebrow">Focused Window</p>
                      <h3>Merged values around the selected time</h3>
                    </div>
                    <span className="agreement-preview-note">{formatTimestamp(selectedTimestamp)}</span>
                  </div>
                  <div className="table-wrap">
                    <table className="result-table">
                      <thead>
                        <tr>
                          {timeseries.columns.map((column) => (
                            <th key={column}>{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {focusedRows.map(({ row, isSelected }, index) => (
                          <tr className={isSelected ? "agreement-row--selected" : ""} key={`preview-${index}`}>
                            {timeseries.columns.map((column) => (
                              <td key={`${column}-${index}`}>{row[column] === undefined || row[column] === null ? "" : String(row[column])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {activeTab === "preview" && !timeseries && previewTable ? (
                <div className="result-panel__content agreement-data-card">
                  <div className="figure-card__header">
                    <p className="eyebrow">Merged Preview</p>
                    <h3>{previewTable.title}</h3>
                  </div>
                  <div className="table-wrap">
                    <table className="result-table">
                      <thead>
                        <tr>
                          {previewTable.columns.map((column) => (
                            <th key={column}>{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewTable.rows.map((row, index) => (
                          <tr key={`preview-${index}`}>
                            {previewTable.columns.map((column) => (
                              <td key={`${column}-${index}`}>{row[column] === undefined ? "" : String(row[column])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {activeTab === "download" ? (
                <div className="agreement-download-stage">
                  <div className="download-grid">
                    {download ? (
                      <a
                        className="download-card"
                        download={download.filename}
                        href={`data:${download.mime};base64,${download.data_base64}`}
                      >
                        <span>{download.label}</span>
                        <strong>{download.filename}</strong>
                      </a>
                    ) : (
                      <div className="result-panel__content agreement-data-card">
                        <p className="eyebrow">Download</p>
                        <p>No downloadable file was returned for this run.</p>
                      </div>
                    )}
                  </div>
                  {result.outputs.notes && result.outputs.notes.length > 0 ? (
                    <div className="result-panel__content agreement-data-card">
                      <p className="eyebrow">Notes</p>
                      <ul className="notes-list">
                        {result.outputs.notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="result-panel__empty agreement-empty">
            <p>Upload at least two meteogram files and generate a comparison to unlock the full analysis workspace.</p>
          </div>
        )}
      </section>
    </div>
  );
}

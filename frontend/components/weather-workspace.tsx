"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { WeatherMeteogramPlot } from "@/components/weather-meteogram-plot";
import { ToolAppDetail, ToolAppField, ToolRunResponse, WeatherTimeSeriesOutput } from "@/lib/types";

type WeatherWorkspaceProps = {
  apiBaseUrl: string;
  app: ToolAppDetail;
};

type PrimitiveValue = string | boolean;
type WeatherTab = "meteogram" | "table";

function isFileField(field: ToolAppField): boolean {
  return field.type === "file";
}

function buildInitialValues(fields: ToolAppField[]): Record<string, PrimitiveValue> {
  return fields.reduce<Record<string, PrimitiveValue>>((accumulator, field) => {
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

function clampIndex(index: number, size: number): number {
  if (size <= 0) {
    return 0;
  }
  return Math.min(Math.max(index, 0), size - 1);
}

function sliceSeries<T>(values: T[], startIndex: number, endIndex: number): T[] {
  return values.slice(startIndex, endIndex + 1);
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

function formatMetricValue(value: string | number | null | undefined, suffix = "", decimals = 1): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "number") {
    return `${value.toFixed(decimals)}${suffix ? ` ${suffix}` : ""}`;
  }

  return String(value);
}

function isWeatherTimeseries(value: ToolRunResponse["outputs"]["timeseries"]): value is WeatherTimeSeriesOutput {
  return Boolean(value && "weather" in value);
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
      <label className="field field--file weather-upload" key={field.key}>
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
        <div className="weather-upload__meta">
          <strong>{count > 0 ? `${count} file${count === 1 ? "" : "s"} selected` : "Drop or choose a weather CSV"}</strong>
          <span>{field.help_text ?? "Upload the Expedition weather export."}</span>
        </div>
        {selectedFiles.length > 0 ? (
          <div className="weather-upload__files">
            {selectedFiles.map((file) => (
              <span className="weather-upload__file" key={`${file.name}-${file.lastModified}`}>
                {file.name}
              </span>
            ))}
          </div>
        ) : null}
      </label>
    );
  }

  return (
    <label className="field" key={field.key}>
      {commonLabel}
      <input
        name={field.key}
        required={field.required}
        type={field.type}
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

export function WeatherWorkspace({ apiBaseUrl, app }: WeatherWorkspaceProps) {
  const [values, setValues] = useState<Record<string, PrimitiveValue>>(() => buildInitialValues(app.fields));
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [result, setResult] = useState<ToolRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInputs, setShowInputs] = useState(true);
  const [activeTab, setActiveTab] = useState<WeatherTab>("meteogram");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);

  const fileField = app.fields.find((field) => field.key === "csv_file");
  const infoFields = app.fields.filter((field) => field.key === "model_name");

  const figure = useMemo(
    () => result?.outputs.figures?.find((item) => item.title.toLowerCase().includes("tws")) ?? result?.outputs.figures?.[0] ?? null,
    [result],
  );
  const table = result?.outputs.tables?.[0] ?? null;
  const timeseries = isWeatherTimeseries(result?.outputs.timeseries) ? result.outputs.timeseries : null;
  const timestamps = timeseries?.timestamps ?? [];

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
  }, [rangeStart, rangeEnd, timestamps.length]);

  const safeRangeStart = clampIndex(Math.min(rangeStart, rangeEnd), timestamps.length);
  const safeRangeEnd = clampIndex(Math.max(rangeStart, rangeEnd), timestamps.length);
  const visibleTimestamps = useMemo(
    () => sliceSeries(timestamps, safeRangeStart, safeRangeEnd),
    [timestamps, safeRangeEnd, safeRangeStart],
  );
  const visibleSelectedIndex = clampIndex(selectedIndex - safeRangeStart, visibleTimestamps.length);
  const visibleRows = useMemo(
    () =>
      timeseries
        ? timeseries.rows.slice(safeRangeStart, safeRangeEnd + 1).map((row, index) => ({
            row,
            isSelected: safeRangeStart + index === selectedIndex,
          }))
        : [],
    [safeRangeEnd, safeRangeStart, selectedIndex, timeseries],
  );
  const selectedRow = timeseries?.rows[selectedIndex] ?? null;
  const selectedTimestamp = timestamps[selectedIndex] ?? null;

  const visibleTws = useMemo(
    () => sliceSeries(timeseries?.weather.speed_lines[0]?.values ?? [], safeRangeStart, safeRangeEnd),
    [safeRangeEnd, safeRangeStart, timeseries],
  );
  const visibleGust = useMemo(
    () => sliceSeries(timeseries?.weather.speed_lines[1]?.values ?? [], safeRangeStart, safeRangeEnd),
    [safeRangeEnd, safeRangeStart, timeseries],
  );
  const visibleTwd = useMemo(
    () => sliceSeries(timeseries?.weather.direction_lines[0]?.values ?? [], safeRangeStart, safeRangeEnd),
    [safeRangeEnd, safeRangeStart, timeseries],
  );

  const selectedMetrics = useMemo(
    () =>
      timeseries
        ? [
            {
              label: "TWS",
              value: formatMetricValue(selectedRow?.TWS, timeseries.weather.speed_unit, 1),
            },
            {
              label: "Gust",
              value: formatMetricValue(selectedRow?.Gust, timeseries.weather.speed_unit, 1),
            },
            {
              label: "TWD",
              value: formatMetricValue(selectedRow?.TWD, timeseries.weather.direction_unit, 0),
            },
          ]
        : [],
    [selectedRow, timeseries],
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
      setResult(payload);
      setShowInputs(false);
      setActiveTab("meteogram");
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
    <div className="weather-shell">
      <section className="panel weather-control">
        <div className="weather-control__header">
          <div>
            <p className="eyebrow">Weather Inputs</p>
            <h2>Single Meteogram Workspace</h2>
            <p>{app.description}</p>
          </div>
          {result ? (
            <button className="secondary-button" type="button" onClick={() => setShowInputs((current) => !current)}>
              {showInputs ? "Hide setup" : "Edit setup"}
            </button>
          ) : null}
        </div>

        {showInputs ? (
          <form className="weather-form" onSubmit={handleSubmit}>
            {fileField ? renderField(fileField, values, files, setValues, setFiles) : null}
            {infoFields.length > 0 ? <div className="weather-settings">{infoFields.map((field) => renderField(field, values, files, setValues, setFiles))}</div> : null}
            <div className="weather-actions">
              <button className="primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Processing..." : result ? "Run again" : "Generate meteogram"}
              </button>
              <p className="form-actions__hint">Upload one weather CSV, then zoom the returned meteogram with a visible time range.</p>
            </div>
          </form>
        ) : (
          <div className="weather-summary">
            <div className="weather-summary__chips">
              <div className="summary-chip">
                <span>Model</span>
                <strong>{String(values.model_name || "UM-Global")}</strong>
              </div>
              <div className="summary-chip">
                <span>Visible Window</span>
                <strong>{visibleTimestamps.length} points</strong>
              </div>
            </div>
            {(files.csv_file ?? []).length > 0 ? (
              <div className="weather-upload__files">
                {(files.csv_file ?? []).map((file) => (
                  <span className="weather-upload__file" key={`${file.name}-${file.lastModified}`}>
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

      <section className="panel weather-results">
        <div className="weather-results__header">
          <div>
            <p className="eyebrow">Meteogram</p>
            <h2>Weather Review</h2>
            <p>Zoom the filtered period, then inspect wind speed, gust, and direction inside the selected window.</p>
          </div>
          {result?.outputs.metrics && result.outputs.metrics.length > 0 ? (
            <div className="metric-grid weather-metric-grid">
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
          <div className="weather-results__body">
            <div className="weather-tabs">
              <button
                className={`weather-tab${activeTab === "meteogram" ? " weather-tab--active" : ""}`}
                type="button"
                onClick={() => setActiveTab("meteogram")}
              >
                Meteogram
              </button>
              <button
                className={`weather-tab${activeTab === "table" ? " weather-tab--active" : ""}`}
                type="button"
                onClick={() => setActiveTab("table")}
              >
                Table
              </button>
            </div>

            {timeseries ? (
              <div className="weather-timeline">
                <div className="weather-timeline__header">
                  <div>
                    <p className="eyebrow">Range And Focus</p>
                    <h3>{formatTimestamp(timestamps[safeRangeStart])} to {formatTimestamp(timestamps[safeRangeEnd])}</h3>
                  </div>
                  <div className="weather-timeline__actions">
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

                <div className="weather-range-grid">
                  <label className="weather-range-control">
                    <span>Range start</span>
                    <strong>{formatTimestamp(timestamps[safeRangeStart])}</strong>
                    <input
                      className="weather-slider"
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
                  <label className="weather-range-control">
                    <span>Range end</span>
                    <strong>{formatTimestamp(timestamps[safeRangeEnd])}</strong>
                    <input
                      className="weather-slider"
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

                <label className="weather-range-control weather-range-control--focus">
                  <span>Focused time inside range</span>
                  <strong>{formatTimestamp(selectedTimestamp)}</strong>
                  <input
                    className="weather-slider"
                    max={safeRangeEnd}
                    min={safeRangeStart}
                    step={1}
                    type="range"
                    value={selectedIndex}
                    onChange={(event) => setSelectedIndex(Number(event.target.value))}
                  />
                </label>

                <div className="weather-slider__meta">
                  <span>{formatTimestamp(timestamps[0])}</span>
                  <strong>
                    Showing {visibleTimestamps.length} point{visibleTimestamps.length === 1 ? "" : "s"}
                  </strong>
                  <span>{formatTimestamp(timestamps[timestamps.length - 1])}</span>
                </div>

                <div className="weather-focus-grid">
                  {selectedMetrics.map((metric) => (
                    <article className="weather-focus-card" key={metric.label}>
                      <span>{metric.label}</span>
                      <strong>{metric.value}</strong>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {activeTab === "meteogram" ? (
              <div className="weather-chart-stack">
                {timeseries ? (
                  <div className="weather-figure-card">
                    <WeatherMeteogramPlot
                      directionUnit={timeseries.weather.direction_unit}
                      gust={visibleGust}
                      selectedTimestamp={selectedTimestamp}
                      speedUnit={timeseries.weather.speed_unit}
                      timestamps={visibleTimestamps}
                      title={`${timeseries.weather.model_name} TWS / Gust / TWD`}
                      twd={visibleTwd}
                      tws={visibleTws}
                    />
                  </div>
                ) : null}

                {!timeseries && figure ? (
                  <div className="figure-card weather-figure-card">
                    <div className="figure-card__header">
                      <p className="eyebrow">Fallback Figure</p>
                      <h3>{figure.title}</h3>
                    </div>
                    <img alt={figure.title} className="result-image" src={figure.image_data_url} />
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTab === "table" && timeseries ? (
              <div className="result-panel__content weather-data-card">
                <div className="figure-card__header">
                  <div>
                    <p className="eyebrow">Filtered Window</p>
                    <h3>Weather rows in the visible range</h3>
                  </div>
                  <span className="weather-preview-note">{formatTimestamp(selectedTimestamp)}</span>
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
                      {visibleRows.map(({ row, isSelected }, index) => (
                        <tr className={isSelected ? "weather-row--selected" : ""} key={`weather-row-${index}`}>
                          {timeseries.columns.map((column) => (
                            <td key={`${column}-${index}`}>{row[column] === null || row[column] === undefined ? "" : String(row[column])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {activeTab === "table" && !timeseries && table ? (
              <div className="result-panel__content weather-data-card">
                <div className="figure-card__header">
                  <p className="eyebrow">Filtered Data</p>
                  <h3>{table.title}</h3>
                </div>
                <div className="table-wrap">
                  <table className="result-table">
                    <thead>
                      <tr>
                        {table.columns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, index) => (
                        <tr key={`table-${index}`}>
                          {table.columns.map((column) => (
                            <td key={`${column}-${index}`}>{row[column] === undefined ? "" : String(row[column])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="result-panel__empty weather-empty">
            <p>Upload one weather CSV to open the interactive meteogram workspace.</p>
          </div>
        )}
      </section>
    </div>
  );
}

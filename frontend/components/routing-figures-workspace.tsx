"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";

import { RoutingTimeSeriesPlot } from "@/components/routing-time-series-plot";
import { RoutingTimeSeriesOutput, ToolAppDetail, ToolRunResponse } from "@/lib/types";

type RoutingFiguresWorkspaceProps = {
  apiBaseUrl: string;
  app: ToolAppDetail;
};

type SettingValue = string | boolean;
type RoutingSetting = {
  key: string;
  label: string;
  type: "number" | "select" | "checkbox";
  default: string | boolean;
  helpText?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string }>;
  section: "Binning" | "Labels" | "Parsing";
};

const ROUTING_SETTINGS: RoutingSetting[] = [
  {
    key: "ws_max",
    label: "Max TWS bin",
    type: "number",
    default: "36",
    min: 8,
    max: 80,
    step: 4,
    section: "Binning",
  },
  {
    key: "ws_step",
    label: "TWS bin step",
    type: "number",
    default: "4",
    min: 2,
    max: 10,
    step: 1,
    section: "Binning",
  },
  {
    key: "dir_step",
    label: "Direction bin step",
    type: "number",
    default: "10",
    min: 5,
    max: 45,
    step: 5,
    section: "Binning",
  },
  {
    key: "xtick_step",
    label: "Angular tick step",
    type: "select",
    default: "45",
    options: [
      { label: "30", value: "30" },
      { label: "45", value: "45" },
      { label: "60", value: "60" },
      { label: "90", value: "90" },
    ],
    section: "Binning",
  },
  {
    key: "radial_max_percent",
    label: "Max radial ring (%)",
    type: "number",
    default: "0",
    min: 0,
    max: 100,
    step: 2,
    helpText: "Set to 0 to keep the polar plot auto-fit.",
    section: "Binning",
  },
  {
    key: "radial_step_percent",
    label: "Radial ring step (%)",
    type: "number",
    default: "2",
    min: 1,
    max: 20,
    step: 1,
    helpText: "Controls the ring spacing, for example 2 gives 2, 4, 6 and 5 gives 5, 10, 15.",
    section: "Binning",
  },
  {
    key: "show_bar_labels",
    label: "Show segment labels",
    type: "checkbox",
    default: true,
    section: "Labels",
  },
  {
    key: "segment_label_floor",
    label: "Segment label minimum percent",
    type: "number",
    default: "2",
    min: 0,
    max: 10,
    step: 1,
    section: "Labels",
  },
  {
    key: "show_total_labels",
    label: "Show ring total labels",
    type: "checkbox",
    default: true,
    section: "Labels",
  },
  {
    key: "ring_label_floor",
    label: "Ring total minimum percent",
    type: "number",
    default: "6",
    min: 0,
    max: 20,
    step: 1,
    section: "Labels",
  },
  {
    key: "label_every",
    label: "Annotate every Nth point",
    type: "number",
    default: "8",
    min: 1,
    max: 50,
    step: 1,
    section: "Labels",
  },
  {
    key: "gap_minutes",
    label: "Break line on gaps larger than minutes",
    type: "number",
    default: "0",
    min: 0,
    max: 360,
    step: 15,
    helpText: "Set to 0 to keep the full time-series line continuous.",
    section: "Labels",
  },
  {
    key: "dayfirst",
    label: "Date is day-first",
    type: "checkbox",
    default: true,
    helpText: "Toggle this if the uploaded CSV uses month-first dates.",
    section: "Parsing",
  },
];

function buildInitialSettings(): Record<string, SettingValue> {
  return ROUTING_SETTINGS.reduce<Record<string, SettingValue>>((accumulator, setting) => {
    accumulator[setting.key] = setting.default;
    return accumulator;
  }, {});
}

function fileCount(file: File | null): number {
  return file ? 1 : 0;
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

function buildFormData(file: File, settings: Record<string, SettingValue>): FormData {
  const formData = new FormData();
  formData.append("csv_file", file);

  for (const setting of ROUTING_SETTINGS) {
    formData.append(setting.key, String(settings[setting.key]));
  }

  return formData;
}

function renderMetricValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return String(value);
}

function isRoutingTimeseries(value: ToolRunResponse["outputs"]["timeseries"]): value is RoutingTimeSeriesOutput {
  return Boolean(value && "routing" in value);
}

function groupSettings() {
  return ROUTING_SETTINGS.reduce<Record<RoutingSetting["section"], RoutingSetting[]>>(
    (accumulator, setting) => {
      accumulator[setting.section].push(setting);
      return accumulator;
    },
    {
      Binning: [],
      Labels: [],
      Parsing: [],
    },
  );
}

const SETTINGS_BY_SECTION = groupSettings();

export function RoutingFiguresWorkspace({ apiBaseUrl, app }: RoutingFiguresWorkspaceProps) {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [settings, setSettings] = useState<Record<string, SettingValue>>(() => buildInitialSettings());
  const [result, setResult] = useState<ToolRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInputs, setShowInputs] = useState(true);

  const uploadField = app.fields.find((field) => field.key === "csv_file");
  const selectedFileName = csvFile?.name ?? "No file selected";
  const figures = result?.outputs.figures ?? [];
  const metrics = result?.outputs.metrics ?? [];
  const timeseries = isRoutingTimeseries(result?.outputs.timeseries) ? result.outputs.timeseries : null;
  const visibleFigures = useMemo(
    () =>
      timeseries
        ? figures.filter((figure) => !figure.title.toLowerCase().includes("time series"))
        : figures,
    [figures, timeseries],
  );

  const summaryMetrics = useMemo(
    () =>
      metrics.map((metric) => ({
        label: metric.label,
        value: renderMetricValue(metric.value),
      })),
    [metrics],
  );

  async function submitWithCurrentState(file: File) {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/apps/${app.slug}/run`, {
        method: "POST",
        body: buildFormData(file, settings),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as ToolRunResponse;
      setResult(payload);
      setShowInputs(false);
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : "The request failed before the processor returned a result.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleInitialSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csvFile) {
      setError("Upload a routing CSV file before processing.");
      return;
    }
    await submitWithCurrentState(csvFile);
  }

  async function handleApplySettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csvFile) {
      setError("The original routing CSV is no longer available. Choose the file again.");
      setShowInputs(true);
      return;
    }
    await submitWithCurrentState(csvFile);
  }

  function renderSetting(setting: RoutingSetting) {
    if (setting.type === "checkbox") {
      return (
        <label className="checkbox-field routing-checkbox" key={setting.key}>
          <input
            checked={Boolean(settings[setting.key])}
            name={setting.key}
            type="checkbox"
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                [setting.key]: event.target.checked,
              }))
            }
          />
          <div>
            <span className="field__label">{setting.label}</span>
            {setting.helpText ? <small>{setting.helpText}</small> : null}
          </div>
        </label>
      );
    }

    if (setting.type === "select") {
      return (
        <label className="field routing-setting" key={setting.key}>
          <span className="field__label">{setting.label}</span>
          <select
            name={setting.key}
            value={String(settings[setting.key] ?? "")}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                [setting.key]: event.target.value,
              }))
            }
          >
            {setting.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {setting.helpText ? <small>{setting.helpText}</small> : null}
        </label>
      );
    }

    return (
      <label className="field routing-setting" key={setting.key}>
        <span className="field__label">{setting.label}</span>
        <input
          max={setting.max}
          min={setting.min}
          name={setting.key}
          step={setting.step}
          type="number"
          value={String(settings[setting.key] ?? "")}
          onChange={(event) =>
            setSettings((current) => ({
              ...current,
              [setting.key]: event.target.value,
            }))
          }
        />
        {setting.helpText ? <small>{setting.helpText}</small> : null}
      </label>
    );
  }

  return (
    <div className="routing-shell">
      <section className="panel routing-control">
        <div className="routing-control__header">
          <div>
            <p className="eyebrow">Routing upload</p>
            <h2>Start with the routing CSV</h2>
            <p>
              Upload the Expedition routing export first. Wind-bin and labeling controls stay with the figures so you can
              refine the output after the first run.
            </p>
          </div>
          {!showInputs && result ? (
            <button className="secondary-button" type="button" onClick={() => setShowInputs(true)}>
              Change CSV
            </button>
          ) : null}
        </div>

        {showInputs || !result ? (
          <form className="routing-form" onSubmit={handleInitialSubmit}>
            <label className="field field--file routing-upload">
              <span className="field__label">
                {uploadField?.label ?? "Routing CSV file"}
                {uploadField?.required ? " *" : ""}
              </span>
              <input
                accept={uploadField?.accept ?? ".csv"}
                name="csv_file"
                required
                type="file"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const [nextFile] = Array.from(event.target.files ?? []);
                  setCsvFile(nextFile ?? null);
                }}
              />
              <div className="routing-upload__meta">
                <strong>
                  {fileCount(csvFile) > 0 ? "Routing CSV ready" : "Drop or choose a routing CSV"}
                </strong>
                <span>{uploadField?.help_text ?? "Upload the Expedition routing CSV export."}</span>
              </div>
              {csvFile ? <div className="routing-upload__file">{csvFile.name}</div> : null}
            </label>

            <div className="routing-actions">
              <p className="form-actions__hint">
                The first run uses the default routing figure settings. After that you can retune the charts from the results
                panel without filling the form again.
              </p>
              <button className="primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Processing routing figures..." : "Generate figures"}
              </button>
            </div>
          </form>
        ) : (
          <div className="routing-upload-summary">
            <div className="summary-chip">
              <span>Routing CSV</span>
              <strong>{selectedFileName}</strong>
            </div>
            <div className="summary-chip">
              <span>Status</span>
              <strong>Ready to re-run with new settings</strong>
            </div>
          </div>
        )}

        {error ? <div className="result-panel__error">{error}</div> : null}
      </section>

      <section className="panel routing-results">
        <div className="routing-results__header">
          <div>
            <p className="eyebrow">Routing analysis</p>
            <h2>{result ? "Tune and review the figures" : "Results will appear here"}</h2>
            <p>{result?.summary ?? "Run the routing file once and the figure controls will open next to the generated plots."}</p>
          </div>
        </div>

        {result ? (
          <div className="routing-results__body">
            <form className="routing-settings-card" onSubmit={handleApplySettings}>
              <div className="routing-settings-card__header">
                <div>
                  <h3>Figure settings</h3>
                  <p>These controls rerun the backend with the currently loaded CSV and redraw all routing figures.</p>
                </div>
                <div className="routing-settings-card__actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setSettings(buildInitialSettings())}
                  >
                    Reset defaults
                  </button>
                  <button className="primary-button" disabled={isSubmitting} type="submit">
                    {isSubmitting ? "Applying settings..." : "Apply settings"}
                  </button>
                </div>
              </div>

              {(["Binning", "Labels", "Parsing"] as const).map((section) => (
                <div className="routing-settings-group" key={section}>
                  <div className="routing-settings-group__title">
                    <span>{section}</span>
                  </div>
                  <div className="routing-settings-grid">{SETTINGS_BY_SECTION[section].map(renderSetting)}</div>
                </div>
              ))}
            </form>

            <div className="routing-outputs">
              {summaryMetrics.length > 0 ? (
                <div className="metric-grid routing-metric-grid">
                  {summaryMetrics.map((metric) => (
                    <article className="metric-card" key={metric.label}>
                      <span>{metric.label}</span>
                      <strong>{metric.value}</strong>
                    </article>
                  ))}
                </div>
              ) : null}

              {timeseries ? (
                <article className="figure-card routing-timeseries-card">
                  <div className="routing-figure-card__header">
                    <h3>Interactive routing time series</h3>
                    <p className="routing-timeseries-note">
                      Zoom directly in the chart or use the Plotly range slider. `gap_minutes` still controls where the line is
                      intentionally broken.
                    </p>
                  </div>
                  <RoutingTimeSeriesPlot
                    directionLines={timeseries.routing.direction_lines}
                    directionUnit={timeseries.routing.direction_unit}
                    labelEvery={Number(settings.label_every) || 8}
                    markLines={timeseries.routing.mark_lines}
                    speedLines={timeseries.routing.speed_lines}
                    speedUnit={timeseries.routing.speed_unit}
                    temperatureLines={timeseries.routing.temperature_lines}
                    temperatureUnit={timeseries.routing.temperature_unit}
                    timestamps={timeseries.timestamps}
                    title={
                      timeseries.routing.model_name
                        ? `Routing Time Series · ${timeseries.routing.model_name}`
                        : "Routing Time Series"
                    }
                  />
                </article>
              ) : null}

              <div className="routing-figure-stack">
                {visibleFigures.map((figure) => (
                  <article className="figure-card routing-figure-card" key={figure.title}>
                    <div className="routing-figure-card__header">
                      <h3>{figure.title}</h3>
                    </div>
                    <img alt={figure.title} className="routing-figure-card__image" src={figure.image_data_url} />
                  </article>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="result-panel__empty routing-empty">
            <p>The routing figure controls will appear after the first CSV run.</p>
          </div>
        )}
      </section>
    </div>
  );
}

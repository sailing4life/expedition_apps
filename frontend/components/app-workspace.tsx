"use client";

import { ChangeEvent, FormEvent, useState } from "react";

import { ToolAppDetail, ToolAppField, ToolRunResponse } from "@/lib/types";

type AppWorkspaceProps = {
  apiBaseUrl: string;
  app: ToolAppDetail;
};

type PrimitiveValue = string | boolean;
type SummaryItem = {
  label: string;
  value: string;
};

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

    const defaultValue = field.default;
    accumulator[field.key] = defaultValue === null || defaultValue === undefined ? "" : String(defaultValue);
    return accumulator;
  }, {});
}

function hasFileFields(fields: ToolAppField[]): boolean {
  return fields.some((field) => isFileField(field));
}

function buildJsonPayload(
  values: Record<string, PrimitiveValue>,
  fields: ToolAppField[],
): Record<string, string | number | boolean> {
  return fields.reduce<Record<string, string | number | boolean>>((accumulator, field) => {
    if (isFileField(field)) {
      return accumulator;
    }

    const rawValue = values[field.key];
    if (field.type === "number") {
      accumulator[field.key] = rawValue === "" ? "" : Number(rawValue);
      return accumulator;
    }

    accumulator[field.key] = rawValue;
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
      const selectedFiles = files[field.key] ?? [];
      for (const file of selectedFiles) {
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

function fieldDescription(field: ToolAppField, files: Record<string, File[]>): string | null {
  if (!isFileField(field)) {
    return field.help_text;
  }

  const selectedFiles = files[field.key] ?? [];
  if (selectedFiles.length === 0) {
    return field.help_text;
  }

  return selectedFiles.map((file) => file.name).join(", ");
}

function selectedFileCount(fieldKey: string, files: Record<string, File[]>): number {
  return files[fieldKey]?.length ?? 0;
}

function buildSummaryItems(
  fields: ToolAppField[],
  values: Record<string, PrimitiveValue>,
  files: Record<string, File[]>,
): SummaryItem[] {
  return fields
    .map((field) => {
      if (isFileField(field)) {
        const count = selectedFileCount(field.key, files);
        if (count === 0) {
          return null;
        }
        return {
          label: field.label,
          value: `${count} file${count === 1 ? "" : "s"}`,
        };
      }

      if (isCheckboxField(field)) {
        if (!values[field.key]) {
          return null;
        }
        return {
          label: field.label,
          value: "On",
        };
      }

      const rawValue = values[field.key];
      if (rawValue === "" || rawValue === undefined) {
        return null;
      }

      if (field.type === "select") {
        const option = field.options.find((item) => item.value === rawValue);
        return {
          label: field.label,
          value: option?.label ?? String(rawValue),
        };
      }

      return {
        label: field.label,
        value: String(rawValue),
      };
    })
    .filter((item): item is SummaryItem => item !== null);
}

function tableCellValue(value: string | number | undefined): string {
  return value === undefined ? "" : String(value);
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

export function AppWorkspace({ apiBaseUrl, app }: AppWorkspaceProps) {
  const [values, setValues] = useState<Record<string, PrimitiveValue>>(() => buildInitialValues(app.fields));
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [result, setResult] = useState<ToolRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInputs, setShowInputs] = useState(true);

  const summaryItems = buildSummaryItems(app.fields, values, files);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const useMultipart = hasFileFields(app.fields);
      const requestInit: RequestInit = useMultipart
        ? {
            method: "POST",
            body: buildFormData(values, files, app.fields),
          }
        : {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              values: buildJsonPayload(values, app.fields),
            }),
          };

      const response = await fetch(`${apiBaseUrl}/api/apps/${app.slug}/run`, requestInit);
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
      setResult(null);
      setShowInputs(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderField(field: ToolAppField) {
    const commonLabel = (
      <span className="field__label">
        {field.label}
        {field.required ? " *" : ""}
      </span>
    );

    if (field.type === "textarea") {
      return (
        <label className="field field--wide" key={field.key}>
          {commonLabel}
          <textarea
            name={field.key}
            placeholder={field.placeholder ?? ""}
            rows={6}
            value={String(values[field.key] ?? "")}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                [field.key]: event.target.value,
              }))
            }
          />
          {fieldDescription(field, files) ? <small>{fieldDescription(field, files)}</small> : null}
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
          {fieldDescription(field, files) ? <small>{fieldDescription(field, files)}</small> : null}
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
            {fieldDescription(field, files) ? <small>{fieldDescription(field, files)}</small> : null}
          </div>
        </label>
      );
    }

    if (field.type === "file") {
      const fileCount = selectedFileCount(field.key, files);
      return (
        <label className="field field--file field--wide" key={field.key}>
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
          <div className="file-drop-copy">
            <strong>{fileCount > 0 ? `${fileCount} file${fileCount === 1 ? "" : "s"} selected` : "Choose file"}</strong>
            <span>{field.multiple ? "You can upload multiple files here." : "Upload one file for this step."}</span>
          </div>
          {fieldDescription(field, files) ? <small>{fieldDescription(field, files)}</small> : null}
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
          placeholder={field.placeholder ?? ""}
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
        {fieldDescription(field, files) ? <small>{fieldDescription(field, files)}</small> : null}
      </label>
    );
  }

  return (
    <div className="workspace-shell">
      <section className={`panel workspace-panel${showInputs ? "" : " workspace-panel--collapsed"}`}>
        <div className="workspace-panel__header">
          <div className="workspace-panel__intro">
            <p className="eyebrow">Inputs</p>
            <h2>Workspace</h2>
            <p>{app.description}</p>
          </div>
          {result ? (
            <button className="secondary-button" type="button" onClick={() => setShowInputs((current) => !current)}>
              {showInputs ? "Collapse inputs" : "Edit inputs"}
            </button>
          ) : null}
        </div>

        {showInputs ? (
          <form className="tool-form" onSubmit={handleSubmit}>
            {app.fields.map((field) => renderField(field))}
            <div className="form-actions">
              <button className="primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Processing..." : result ? "Run again" : "Run processor"}
              </button>
              <p className="form-actions__hint">Large uploads can take a moment while the backend generates figures.</p>
            </div>
          </form>
        ) : (
          <div className="input-summary">
            <div className="input-summary__grid">
              {summaryItems.map((item) => (
                <div className="summary-chip" key={`${item.label}-${item.value}`}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <div className="input-summary__actions">
              <button className="primary-button" type="button" onClick={() => setShowInputs(true)}>
                Edit inputs
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="panel result-panel result-panel--wide">
        <div className="result-panel__header">
          <p className="eyebrow">Outputs</p>
          <h2>Result</h2>
          <p>Figures, tables, and downloads returned by the backend processor.</p>
        </div>
        {error ? <p className="result-panel__error">{error}</p> : null}
        {result ? (
          <div className="result-stack">
            <div className="result-panel__content">
              <div>
                <p className="eyebrow">Message</p>
                <h3>{result.message}</h3>
              </div>
              <p>{result.summary}</p>
            </div>

            {result.outputs.metrics && result.outputs.metrics.length > 0 ? (
              <div className="metric-grid">
                {result.outputs.metrics.map((metric) => (
                  <div className="metric-card" key={`${metric.label}-${metric.value}`}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </div>
                ))}
              </div>
            ) : null}

            {result.outputs.notes && result.outputs.notes.length > 0 ? (
              <div className="result-panel__content">
                <p className="eyebrow">Notes</p>
                <ul className="notes-list">
                  {result.outputs.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result.outputs.figures?.map((figure) => (
              <div className="figure-card" key={figure.title}>
                <div className="figure-card__header">
                  <p className="eyebrow">Figure</p>
                  <h3>{figure.title}</h3>
                </div>
                <img alt={figure.title} className="result-image" src={figure.image_data_url} />
              </div>
            ))}

            {result.outputs.tables?.map((table) => (
              <div className="result-panel__content" key={table.title}>
                <div className="figure-card__header">
                  <p className="eyebrow">Table</p>
                  <h3>{table.title}</h3>
                </div>
                {table.color_legend && table.color_legend.length > 0 ? (
                  <div className="legend-row">
                    {table.color_legend.map((item) => (
                      <span className="legend-chip" key={item.label}>
                        <i style={{ backgroundColor: item.color }} />
                        {item.label}
                      </span>
                    ))}
                  </div>
                ) : null}
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
                        <tr key={`${table.title}-${index}`}>
                          {table.columns.map((column) => (
                            <td key={`${column}-${index}`}>{tableCellValue(row[column])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {result.outputs.downloads && result.outputs.downloads.length > 0 ? (
              <div className="download-grid">
                {result.outputs.downloads.map((download) => (
                  <a
                    className="download-card"
                    download={download.filename}
                    href={`data:${download.mime};base64,${download.data_base64}`}
                    key={download.filename}
                  >
                    <span>{download.label}</span>
                    <strong>{download.filename}</strong>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="result-panel__empty">
            <p>Upload a CSV and run the processor to preview how the migrated webapp behaves.</p>
          </div>
        )}
      </section>
    </div>
  );
}

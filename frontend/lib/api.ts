import { ToolAppDetail, ToolAppSummary } from "@/lib/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

const fallbackApps: ToolAppSummary[] = [
  {
    slug: "model-agreement",
    title: "Meteogram Model Agreement",
    summary: "Upload multiple meteogram CSVs and compare wind speed and direction agreement across models.",
    status: "ready",
    tags: ["meteogram", "multi-model", "agreement"],
  },
  {
    slug: "weather-app",
    title: "Weather App",
    summary: "Generate expedition weather figures and a filtered data table from a single CSV export.",
    status: "ready",
    tags: ["weather", "meteogram", "table"],
  },
  {
    slug: "routing-figures",
    title: "Routing Figures",
    summary: "Create polar wind plots and time series from Expedition routing output.",
    status: "ready",
    tags: ["routing", "polar", "analysis"],
  },
  {
    slug: "sail-usage-overlay",
    title: "Sail Usage Overlay",
    summary: "Overlay sail crossover shapes and reef lines on top of a routing usage heatmap.",
    status: "ready",
    tags: ["routing", "sails", "xml"],
  },
];

const fallbackDetail: Record<string, ToolAppDetail> = {
  "model-agreement": {
    ...fallbackApps[0],
    description:
      "Upload at least two meteogram CSV files, compute agreement metrics, and return speed and direction comparison figures plus a merged CSV export.",
    fields: [
      {
        key: "csv_files",
        label: "Meteogram CSV files",
        type: "file",
        required: true,
        placeholder: null,
        help_text: "Upload at least two model output CSV files.",
        default: null,
        options: [],
        accept: ".csv",
        multiple: true,
      },
      {
        key: "speed_unit",
        label: "Wind speed unit",
        type: "select",
        required: true,
        placeholder: null,
        help_text: null,
        default: "kt",
        options: [
          { label: "Knots", value: "kt" },
          { label: "Meters per second", value: "m/s" },
        ],
      },
      {
        key: "band_val",
        label: "Agreement band (+/-)",
        type: "number",
        required: true,
        placeholder: null,
        help_text: null,
        default: 2,
        options: [],
        min_value: 0,
        max_value: 20,
        step: 0.5,
      },
      {
        key: "show_mean",
        label: "Show ensemble mean",
        type: "checkbox",
        required: false,
        placeholder: null,
        help_text: null,
        default: 1,
        options: [],
      },
      {
        key: "show_spread",
        label: "Shade speed spread",
        type: "checkbox",
        required: false,
        placeholder: null,
        help_text: null,
        default: 1,
        options: [],
      },
      {
        key: "show_dir_sigma",
        label: "Shade direction spread",
        type: "checkbox",
        required: false,
        placeholder: null,
        help_text: null,
        default: 1,
        options: [],
      },
      {
        key: "wrap_dir_display",
        label: "Wrap direction display to 0-360",
        type: "checkbox",
        required: false,
        placeholder: null,
        help_text: null,
        default: 1,
        options: [],
      },
      {
        key: "show_band_agreement",
        label: "Show band agreement metric",
        type: "checkbox",
        required: false,
        placeholder: null,
        help_text: null,
        default: 1,
        options: [],
      },
      {
        key: "smooth",
        label: "Apply mild smoothing",
        type: "checkbox",
        required: false,
        placeholder: null,
        help_text: null,
        default: 0,
        options: [],
      },
      {
        key: "auto_fit_dir_ylim",
        label: "Auto-fit direction axis",
        type: "checkbox",
        required: false,
        placeholder: null,
        help_text: null,
        default: 1,
        options: [],
      },
    ],
  },
  "weather-app": {
    ...fallbackApps[1],
    description:
      "Upload an Expedition weather CSV and inspect the full meteogram with interactive range controls for TWS, gust, and direction.",
    fields: [
      {
        key: "csv_file",
        label: "Weather CSV file",
        type: "file",
        required: true,
        placeholder: null,
        help_text: "Upload the Expedition weather CSV export.",
        default: null,
        options: [],
        accept: ".csv",
      },
      {
        key: "model_name",
        label: "Model name",
        type: "text",
        required: false,
        placeholder: "UM-Global",
        help_text: null,
        default: "UM-Global",
        options: [],
      },
    ],
  },
  "routing-figures": {
    ...fallbackApps[2],
    description:
      "Upload an Expedition routing CSV, generate the figures, and tune binning and labeling controls inside the results workspace.",
    fields: [
      {
        key: "csv_file",
        label: "Routing CSV file",
        type: "file",
        required: true,
        placeholder: null,
        help_text: "Upload the Expedition routing CSV export.",
        default: null,
        options: [],
        accept: ".csv",
      },
    ],
  },
  "sail-usage-overlay": {
    ...fallbackApps[3],
    description:
      "Upload the routing matrix CSV together with the sail-plan XML and render the heatmap plus sail crossover overlays as a proper app view.",
    fields: [
      {
        key: "matrix_csv",
        label: "Routing matrix CSV",
        type: "file",
        required: true,
        placeholder: null,
        help_text: "Upload the routing matrix CSV used by the original script.",
        default: null,
        options: [],
        accept: ".csv",
      },
      {
        key: "sail_xml",
        label: "Sail plan XML",
        type: "file",
        required: true,
        placeholder: null,
        help_text: "Upload the XML file containing sail shapes and reef lines.",
        default: null,
        options: [],
        accept: ".xml",
      },
      {
        key: "threshold",
        label: "Visibility threshold (%)",
        type: "number",
        required: true,
        placeholder: null,
        help_text: "Cells below this percentage are hidden to reduce visual noise.",
        default: 0.2,
        options: [],
        min_value: 0,
        max_value: 5,
        step: 0.1,
      },
    ],
  },
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchApps(): Promise<ToolAppSummary[]> {
  try {
    return await getJson<ToolAppSummary[]>("/api/apps");
  } catch {
    return fallbackApps;
  }
}

export async function fetchAppDetail(slug: string): Promise<ToolAppDetail | null> {
  try {
    return await getJson<ToolAppDetail>(`/api/apps/${slug}`);
  } catch {
    return fallbackDetail[slug] ?? null;
  }
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

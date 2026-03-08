export type ToolAppSummary = {
  slug: string;
  title: string;
  summary: string;
  status: "ready" | "migration" | "planned";
  tags: string[];
};

export type ToolAppFieldOption = {
  label: string;
  value: string;
};

export type ToolAppField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "checkbox" | "file" | "date" | "time";
  required: boolean;
  placeholder: string | null;
  help_text: string | null;
  default: string | number | null;
  options: ToolAppFieldOption[];
  accept?: string | null;
  multiple?: boolean;
  min_value?: number | null;
  max_value?: number | null;
  step?: number | null;
};

export type ToolAppDetail = ToolAppSummary & {
  description: string;
  fields: ToolAppField[];
};

export type Metric = {
  label: string;
  value: string;
};

export type FigureOutput = {
  title: string;
  image_data_url: string;
};

export type TableOutput = {
  title: string;
  columns: string[];
  rows: Record<string, string | number>[];
  color_legend?: Array<{ label: string; color: string }>;
};

export type DownloadOutput = {
  label: string;
  filename: string;
  mime: string;
  data_base64: string;
};

export type TimeSeriesLineOutput = {
  label: string;
  values: Array<number | null>;
  column_key?: string;
};

export type TimeSeriesBandOutput = {
  label: string;
  lower: Array<number | null>;
  upper: Array<number | null>;
};

export type ModelAgreementSeriesGroup = {
  unit: string;
  models: TimeSeriesLineOutput[];
  mean?: TimeSeriesLineOutput | null;
  spread?: TimeSeriesBandOutput | null;
  agreement: TimeSeriesLineOutput[];
  wrap_display?: boolean;
};

export type ModelAgreementTimeSeriesOutput = {
  timestamps: string[];
  columns: string[];
  rows: Record<string, string | number | null>[];
  speed?: ModelAgreementSeriesGroup;
  direction?: ModelAgreementSeriesGroup;
};

export type WeatherTimeSeriesOutput = {
  timestamps: string[];
  columns: string[];
  rows: Record<string, string | number | null>[];
  weather: {
    model_name: string;
    speed_unit: string;
    direction_unit: string;
    speed_lines: TimeSeriesLineOutput[];
    direction_lines: TimeSeriesLineOutput[];
  };
};

export type RoutingTimeSeriesOutput = {
  timestamps: string[];
  columns: string[];
  rows: Record<string, string | number | null>[];
  routing: {
    model_name: string;
    speed_unit: string;
    direction_unit: string;
    temperature_unit: string;
    speed_lines: TimeSeriesLineOutput[];
    direction_lines: TimeSeriesLineOutput[];
    temperature_lines: TimeSeriesLineOutput[];
    mark_lines: Array<{ timestamp: string; label: string }>;
  };
};

export type ToolRunResponse = {
  app_slug: string;
  app_title: string;
  status: "success";
  message: string;
  summary: string;
  outputs: {
    metrics?: Metric[];
    figures?: FigureOutput[];
    tables?: TableOutput[];
    downloads?: DownloadOutput[];
    notes?: string[];
    timeseries?: ModelAgreementTimeSeriesOutput | WeatherTimeSeriesOutput | RoutingTimeSeriesOutput;
  };
};

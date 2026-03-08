declare module "react-plotly.js" {
  import type { ComponentType } from "react";
  import type { Config, Data, Layout, PlotMouseEvent } from "plotly.js";

  type PlotProps = {
    data: Data[];
    layout?: Partial<Layout>;
    config?: Partial<Config>;
    style?: Record<string, string | number>;
    className?: string;
    useResizeHandler?: boolean;
    onRelayout?: (event: PlotMouseEvent) => void;
  };

  const Plot: ComponentType<PlotProps>;
  export default Plot;
}

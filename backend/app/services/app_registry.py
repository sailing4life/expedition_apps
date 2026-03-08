from __future__ import annotations

from app.models.apps import AppField, AppFieldOption, ToolAppDetail
from app.processors.base import RegisteredApp
from app.processors.model_agreement import run_model_agreement
from app.processors.routing_figures import run_routing_figures
from app.processors.sail_usage_overlay import run_sail_usage_overlay
from app.processors.weather_app import run_weather_app


APP_REGISTRY: dict[str, RegisteredApp] = {
    "model-agreement": RegisteredApp(
        detail=ToolAppDetail(
            slug="model-agreement",
            title="Meteogram Model Agreement",
            summary="Upload multiple meteogram CSVs and compare wind speed and direction agreement across models.",
            description=(
                "Migrated from the original Streamlit app. This workspace regrids uploaded meteograms onto a common "
                "timeline, computes agreement metrics, and returns comparison figures plus a merged CSV export."
            ),
            status="ready",
            tags=["meteogram", "multi-model", "agreement"],
            fields=[
                AppField(
                    key="csv_files",
                    label="Meteogram CSV files",
                    type="file",
                    accept=".csv",
                    multiple=True,
                    help_text="Upload at least two model output CSV files.",
                ),
                AppField(
                    key="speed_unit",
                    label="Wind speed unit",
                    type="select",
                    default="kt",
                    options=[
                        AppFieldOption(label="Knots", value="kt"),
                        AppFieldOption(label="Meters per second", value="m/s"),
                    ],
                ),
                AppField(
                    key="band_val",
                    label="Agreement band (+/-)",
                    type="number",
                    default=2.0,
                    min_value=0,
                    max_value=20,
                    step=0.5,
                ),
                AppField(key="show_mean", label="Show ensemble mean", type="checkbox", default=1, required=False),
                AppField(key="show_spread", label="Shade speed spread", type="checkbox", default=1, required=False),
                AppField(key="show_dir_sigma", label="Shade direction spread", type="checkbox", default=1, required=False),
                AppField(
                    key="wrap_dir_display",
                    label="Wrap direction display to 0-360",
                    type="checkbox",
                    default=1,
                    required=False,
                ),
                AppField(
                    key="show_band_agreement",
                    label="Show band agreement metric",
                    type="checkbox",
                    default=1,
                    required=False,
                ),
                AppField(key="smooth", label="Apply mild smoothing", type="checkbox", default=0, required=False),
                AppField(
                    key="auto_fit_dir_ylim",
                    label="Auto-fit direction axis",
                    type="checkbox",
                    default=1,
                    required=False,
                ),
            ],
        ),
        processor=run_model_agreement,
    ),
    "weather-app": RegisteredApp(
        detail=ToolAppDetail(
            slug="weather-app",
            title="Weather App",
            summary="Generate expedition weather figures and an interactive meteogram from a single CSV export.",
            description=(
                "Migrated from the original Streamlit weather app. Upload an Expedition weather CSV and inspect "
                "the full meteogram with interactive range controls for TWS, gust, and direction."
            ),
            status="ready",
            tags=["weather", "meteogram", "table"],
            fields=[
                AppField(
                    key="csv_file",
                    label="Weather CSV file",
                    type="file",
                    accept=".csv",
                    help_text="Upload the Expedition weather CSV export.",
                ),
                AppField(
                    key="model_name",
                    label="Model name",
                    type="text",
                    required=False,
                    default="UM-Global",
                    placeholder="UM-Global",
                ),
            ],
        ),
        processor=run_weather_app,
    ),
    "routing-figures": RegisteredApp(
        detail=ToolAppDetail(
            slug="routing-figures",
            title="Routing Figures",
            summary="Create polar wind plots and time series from Expedition routing output.",
            description=(
                "Migrated from the original Streamlit routing figures app. Upload an Expedition routing CSV, "
                "generate the figures, and tune binning and labeling controls inside the results workspace."
            ),
            status="ready",
            tags=["routing", "polar", "analysis"],
            fields=[
                AppField(
                    key="csv_file",
                    label="Routing CSV file",
                    type="file",
                    accept=".csv",
                    help_text="Upload the Expedition routing CSV export.",
                ),
            ],
        ),
        processor=run_routing_figures,
    ),
    "sail-usage-overlay": RegisteredApp(
        detail=ToolAppDetail(
            slug="sail-usage-overlay",
            title="Sail Usage Overlay",
            summary="Overlay sail crossover shapes and reef lines on top of a routing usage heatmap.",
            description=(
                "Built from the standalone script you provided. Upload the routing matrix CSV together with the sail "
                "definition XML and generate a cleaner visual overlay as a proper app workspace."
            ),
            status="ready",
            tags=["routing", "sails", "xml"],
            fields=[
                AppField(
                    key="matrix_csv",
                    label="Routing matrix CSV",
                    type="file",
                    accept=".csv",
                    help_text="Upload the routing matrix CSV used by the original script.",
                ),
                AppField(
                    key="sail_xml",
                    label="Sail plan XML",
                    type="file",
                    accept=".xml",
                    help_text="Upload the XML file containing sail shapes and reef lines.",
                ),
                AppField(
                    key="threshold",
                    label="Visibility threshold (%)",
                    type="number",
                    default=0.2,
                    min_value=0,
                    max_value=5,
                    step=0.1,
                    help_text="Cells below this percentage are hidden to reduce visual noise.",
                ),
            ],
        ),
        processor=run_sail_usage_overlay,
    ),
}


def list_apps() -> list[ToolAppDetail]:
    return [registered.detail for registered in APP_REGISTRY.values()]


def get_app(slug: str) -> RegisteredApp | None:
    return APP_REGISTRY.get(slug)

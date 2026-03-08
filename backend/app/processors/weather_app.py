from __future__ import annotations

from io import BytesIO
from typing import Any

import matplotlib.colors as mcolors
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import pandas as pd

from app.processors.base import UploadedInputFile
from app.processors.utils import figure_to_data_url


def _serialize_number(value: Any) -> float | int | None:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return round(value, 3)
    return value


def _as_uploaded_file(value: Any, key: str) -> UploadedInputFile:
    if isinstance(value, UploadedInputFile):
        return value
    raise ValueError(f"Expected uploaded file for '{key}'.")


def run_weather_app(values: dict[str, Any]) -> dict[str, Any]:
    upload = _as_uploaded_file(values.get("csv_file"), "csv_file")

    df = pd.read_csv(BytesIO(upload.data), encoding="latin1")
    df.columns = df.columns.str.replace("°", "deg")

    if "W. Europe Daylight Time" not in df.columns:
        raise ValueError("CSV must contain the 'W. Europe Daylight Time' column.")

    df["Time"] = pd.to_datetime(df["W. Europe Daylight Time"], errors="coerce")
    df = df.dropna(subset=["Time"])
    if df.empty:
        raise ValueError("The uploaded CSV did not contain any parseable timestamps.")

    model_name = str(values.get("model_name") or "UM-Global").strip() or "UM-Global"

    df_filtered = df.copy()

    if "kt" not in df_filtered.columns:
        raise ValueError("CSV must contain a 'kt' wind speed column.")

    df_filtered["TWS"] = pd.to_numeric(df_filtered["kt"], errors="coerce")
    if "Wind10m deg" in df_filtered.columns:
        df_filtered["TWD"] = pd.to_numeric(df_filtered["Wind10m deg"], errors="coerce")
    else:
        df_filtered["TWD"] = pd.to_numeric(df_filtered.get("Wind 10m"), errors="coerce")

    columns = df_filtered.columns
    if "Gust deg" in columns:
        gust_index = columns.get_loc("Gust deg")
    elif "Gust" in columns:
        gust_index = columns.get_loc("Gust")
    else:
        raise ValueError("Could not detect a gust column in the uploaded CSV.")

    next_col_index = gust_index + 1
    if next_col_index >= len(columns):
        raise ValueError("The gust value column could not be derived from the uploaded CSV.")

    df_filtered["Gust"] = pd.to_numeric(df_filtered.iloc[:, next_col_index], errors="coerce")
    df_filtered = df_filtered.dropna(subset=["TWS", "TWD", "Gust"])

    if df_filtered.empty:
        raise ValueError("No rows remained after applying the selected filters.")

    fig, ax1 = plt.subplots(figsize=(10, 6))
    ax1.set_title(f"TWS/Direction - Model: {model_name}", fontsize=14)
    ax1.set_xlabel("Time")
    ax1.set_ylabel("TWS / Gust (kt)", color="blue")
    ax1.plot(df_filtered["Time"], df_filtered["TWS"], "b-", marker=".", label="TWS")
    ax1.plot(df_filtered["Time"], df_filtered["Gust"], color="lightblue", linestyle="--", marker="x", label="Gust")
    ax1.tick_params(axis="y", labelcolor="blue")
    ax1.grid(True, which="both", axis="both", linestyle="--", linewidth=0.5)

    ax2 = ax1.twinx()
    ax2.set_ylabel("TWD (deg)", color="red")
    ax2.plot(df_filtered["Time"], df_filtered["TWD"], "r-", marker=".", label="TWD")
    ax2.tick_params(axis="y", labelcolor="red")

    ax1.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m-%d %H:%M"))
    fig.autofmt_xdate()

    display_df = df_filtered[["Time", "TWD", "TWS", "Gust"]].copy()
    display_df["Time"] = display_df["Time"].dt.strftime("%Y-%m-%d %H:%M")
    display_df["TWD"] = display_df["TWD"].map(lambda value: f"{value:.0f}")
    display_df["TWS"] = display_df["TWS"].map(lambda value: f"{value:.1f}")
    display_df["Gust"] = display_df["Gust"].map(lambda value: f"{value:.1f}")

    timeseries_rows = []
    for row in df_filtered[["Time", "TWD", "TWS", "Gust"]].to_dict(orient="records"):
        timeseries_rows.append(
            {
                "Time": row["Time"].isoformat(),
                "TWD": _serialize_number(row["TWD"]),
                "TWS": _serialize_number(row["TWS"]),
                "Gust": _serialize_number(row["Gust"]),
            }
        )

    cmap = mcolors.LinearSegmentedColormap.from_list("blue_green_red", ["blue", "green", "red"])
    legend_values = [5, 15, 25]
    legend_swatches = [
        {"label": f"{value} kt", "color": mcolors.to_hex(cmap((value - 5) / (25 - 5)))}
        for value in legend_values
    ]

    return {
        "message": "Weather meteogram generated.",
        "summary": f"Filtered {len(df_filtered)} rows for {model_name}.",
        "outputs": {
            "metrics": [
                {"label": "Rows", "value": str(len(df_filtered))},
                {"label": "Start", "value": str(display_df.iloc[0]["Time"])},
                {"label": "End", "value": str(display_df.iloc[-1]["Time"])},
            ],
            "figures": [
                {
                    "title": "TWS, Gust, and TWD",
                    "image_data_url": figure_to_data_url(fig),
                }
            ],
            "timeseries": {
                "timestamps": df_filtered["Time"].dt.strftime("%Y-%m-%dT%H:%M:%S").tolist(),
                "columns": ["Time", "TWD", "TWS", "Gust"],
                "rows": timeseries_rows,
                "weather": {
                    "model_name": model_name,
                    "speed_unit": "kt",
                    "direction_unit": "deg",
                    "speed_lines": [
                        {"label": "TWS", "column_key": "TWS", "values": [_serialize_number(value) for value in df_filtered["TWS"].tolist()]},
                        {"label": "Gust", "column_key": "Gust", "values": [_serialize_number(value) for value in df_filtered["Gust"].tolist()]},
                    ],
                    "direction_lines": [
                        {"label": "TWD", "column_key": "TWD", "values": [_serialize_number(value) for value in df_filtered["TWD"].tolist()]},
                    ],
                },
            },
            "tables": [
                {
                    "title": "Filtered Data",
                    "columns": ["Time", "TWD", "TWS", "Gust"],
                    "rows": display_df.to_dict(orient="records"),
                    "color_legend": legend_swatches,
                }
            ],
        },
    }

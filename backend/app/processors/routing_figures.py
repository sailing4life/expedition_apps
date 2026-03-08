from __future__ import annotations

import csv
import io
import re
from typing import Any

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from app.processors.base import UploadedInputFile
from app.processors.utils import figure_to_data_url


def _as_uploaded_file(value: Any, key: str) -> UploadedInputFile:
    if isinstance(value, UploadedInputFile):
        return value
    raise ValueError(f"Expected uploaded file for '{key}'.")


def _as_bool(value: Any, default: bool) -> bool:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _as_int(value: Any, default: int) -> int:
    if value is None or value == "":
        return default
    return int(value)


def read_csv_to_df(file_bytes: bytes) -> tuple[pd.DataFrame, list[list[str]]]:
    rows: list[list[str]] = []
    text = file_bytes.decode("utf-8", errors="ignore")
    reader = csv.reader(io.StringIO(text), delimiter=",", quotechar='"')
    for row in reader:
        rows.append(row)
    if not rows:
        return pd.DataFrame(), rows
    header = rows[0]
    data_rows = [row for row in rows[1:] if len(row) == len(header)]
    return pd.DataFrame(data_rows, columns=header), rows


def first_col_containing(df: pd.DataFrame, substrings: list[str], excludes: list[str] | None = None) -> str | None:
    lowered = [substring.lower() for substring in substrings]
    blocked = [substring.lower() for substring in excludes or []]
    for col in df.columns:
        col_lower = col.lower()
        if blocked and any(substring in col_lower for substring in blocked):
            continue
        if any(substring in col_lower for substring in lowered):
            return col
    return None


def detect_model(rows: list[list[str]]) -> str:
    for row in rows:
        cells = [cell.strip() for cell in row if cell and cell.strip()]
        if not cells:
            continue
        for index, cell in enumerate(cells[:-1]):
            if "model" in cell.lower():
                return cells[index + 1]
    return ""


def parse_numeric(df: pd.DataFrame, col: str) -> pd.Series:
    return pd.to_numeric(df.get(col, np.nan), errors="coerce")


def format_timerange(ts: pd.Series, dayfirst: bool) -> tuple[str, str]:
    if ts.isna().all():
        return "?", "?"
    start = pd.to_datetime(ts.min(), errors="coerce", dayfirst=dayfirst)
    end = pd.to_datetime(ts.max(), errors="coerce", dayfirst=dayfirst)
    if pd.isna(start) or pd.isna(end):
        return "?", "?"
    return start.strftime("%d-%b-%Y %H:%M"), end.strftime("%d-%b-%Y %H:%M")


def slugify_column_key(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", label.strip().lower()).strip("_")


def detect_optional_speed_columns(df: pd.DataFrame) -> list[tuple[str, str]]:
    series: list[tuple[str, str]] = []
    used: set[str] = {"Tws"}

    candidates = [
        ("TWG", ["twg", "true wind gust"]),
        ("Gust", ["gust value", "wind gust", "gust"]),
    ]

    for label, patterns in candidates:
        col = first_col_containing(df, patterns, excludes=["deg", "dir", "direction"])
        if col and col not in used:
            series.append((label, col))
            used.add(col)

    return series


def detect_temperature_columns(df: pd.DataFrame) -> list[tuple[str, str]]:
    series: list[tuple[str, str]] = []
    used: set[str] = set()

    candidates = [
        ("Air Temp", ["air temp", "air temperature"]),
        ("Sea Temp", ["sea temp", "sea temperature", "water temp", "water temperature"]),
        ("Temperature", ["temperature", "temp"]),
    ]

    for label, patterns in candidates:
        col = first_col_containing(df, patterns, excludes=["attempt", "target"])
        if col and col not in used:
            series.append((label, col))
            used.add(col)

    return series


def series_to_values(series: pd.Series) -> list[float | None]:
    return [None if pd.isna(value) else float(value) for value in series.tolist()]


def build_routing_timeseries_output(
    df: pd.DataFrame,
    time_col: str,
    model_name: str,
    gap_minutes: int,
    speed_series: list[tuple[str, str]],
    direction_series: list[tuple[str, str]],
    temperature_series: list[tuple[str, str]],
    mark_col: str | None,
) -> dict[str, Any]:
    dft_raw = df.sort_values(time_col).copy()
    dft_plot = dft_raw.copy()

    plot_columns = [column for _, column in speed_series + direction_series + temperature_series]
    if gap_minutes > 0 and plot_columns:
        dft_plot["_gap_s"] = dft_plot[time_col].diff().dt.total_seconds()
        gap_seconds = int(gap_minutes * 60)
        dft_plot.loc[dft_plot["_gap_s"] > gap_seconds, plot_columns] = np.nan

    row_columns = [("time", time_col)] + speed_series + direction_series + temperature_series
    rows: list[dict[str, str | float | None]] = []
    for _, row in dft_raw.iterrows():
        payload_row: dict[str, str | float | None] = {}
        for label, column in row_columns:
            key = "time" if column == time_col else slugify_column_key(label)
            value = row[column]
            if column == time_col:
                payload_row[key] = value.isoformat() if pd.notna(value) else None
            elif pd.isna(value):
                payload_row[key] = None
            else:
                payload_row[key] = float(value)
        rows.append(payload_row)

    mark_lines: list[dict[str, str]] = []
    if mark_col and mark_col in dft_raw.columns:
        last_time = None
        min_spacing = pd.Timedelta(minutes=max(15, gap_minutes // 4 if gap_minutes > 0 else 15))
        change = (dft_raw[mark_col] != dft_raw[mark_col].shift(1)) & dft_raw[mark_col].notna()
        for time_value, mark_value in zip(dft_raw.loc[change, time_col], dft_raw.loc[change, mark_col]):
            if pd.isna(time_value):
                continue
            if last_time is None or (time_value - last_time) > min_spacing:
                mark_lines.append({"timestamp": time_value.isoformat(), "label": str(mark_value)})
                last_time = time_value

    return {
        "timestamps": [value.isoformat() for value in dft_raw[time_col].tolist()],
        "columns": [label for label, _ in row_columns],
        "rows": rows,
        "routing": {
            "model_name": model_name,
            "speed_unit": "kt",
            "direction_unit": "deg",
            "temperature_unit": "C",
            "speed_lines": [
                {
                    "label": label,
                    "column_key": slugify_column_key(label),
                    "values": series_to_values(dft_plot[column]),
                }
                for label, column in speed_series
            ],
            "direction_lines": [
                {
                    "label": label,
                    "column_key": slugify_column_key(label),
                    "values": series_to_values(dft_plot[column]),
                }
                for label, column in direction_series
            ],
            "temperature_lines": [
                {
                    "label": label,
                    "column_key": slugify_column_key(label),
                    "values": series_to_values(dft_plot[column]),
                }
                for label, column in temperature_series
            ],
            "mark_lines": mark_lines,
        },
    }


def wind_polar(
    df: pd.DataFrame,
    angle_col: str,
    speed_col: str,
    angle_bins_deg: int,
    ws_max: int,
    ws_step: int,
    zero_at: str,
    theta_direction_ccw: bool,
    title_prefix: str,
    time_range: tuple[str, str],
    model_name: str,
    show_segment_labels: bool,
    seg_floor: float,
    show_total_labels: bool,
    total_floor: float,
    xtick_step_deg: int,
    radial_max_percent: int,
    radial_step_percent: int,
) -> plt.Figure:
    dir_bins = np.arange(0, 360 + angle_bins_deg, angle_bins_deg)
    if dir_bins[-1] != 360:
        dir_bins[-1] = 360
    angles = np.deg2rad((dir_bins[:-1] + dir_bins[1:]) / 2)

    tws_bins = np.arange(0, ws_max + ws_step, ws_step)
    tws_labels = [f"{tws_bins[index]}-{tws_bins[index + 1]} kt" for index in range(len(tws_bins) - 1)]

    dfx = df.copy()
    if angle_col == "Twa":
        dfx[angle_col] = ((dfx[angle_col] + 180) % 360) - 180
        dir_vals = (dfx[angle_col] + 180) % 360
    else:
        dir_vals = dfx[angle_col] % 360

    dfx["dir_bin"] = pd.cut(dir_vals, bins=dir_bins, labels=False, include_lowest=True)
    dfx["tws_bin"] = pd.cut(dfx[speed_col], bins=tws_bins, labels=tws_labels, include_lowest=True)

    counts = dfx.groupby(["dir_bin", "tws_bin"]).size().unstack(fill_value=0)
    percentages = counts.reindex(index=np.arange(len(dir_bins) - 1), fill_value=0)
    total = percentages.values.sum() or 1
    percentages = percentages / total * 100

    total_percent = percentages.sum(axis=1).values
    max_percent = float(np.nanmax(total_percent)) if len(total_percent) else 0.0
    ring_step = max(1, radial_step_percent)
    auto_ylim = int(np.ceil(max(max_percent, float(ring_step)) / ring_step) * ring_step) if max_percent > 0 else ring_step
    if radial_max_percent > 0:
        ylim = int(np.ceil(max(radial_max_percent, ring_step) / ring_step) * ring_step)
    else:
        ylim = auto_ylim
    rgrid_ticks = list(range(ring_step, ylim + 1, ring_step))
    colors = [
        "#add8e6",
        "#9bddde",
        "#7fcdbb",
        "#66c2a5",
        "#90ee90",
        "#f0e68c",
        "#ffcccb",
        "#ffcc99",
    ]

    fig, ax = plt.subplots(subplot_kw={"projection": "polar"}, figsize=(8, 7))
    if zero_at.upper().startswith("N"):
        ax.set_theta_zero_location("N")
    elif zero_at.upper().startswith("S"):
        ax.set_theta_zero_location("S")
    elif zero_at.upper().startswith("E"):
        ax.set_theta_zero_location("E")
    else:
        ax.set_theta_zero_location("W")

    ax.set_theta_direction(-1 if theta_direction_ccw else 1)

    width = np.deg2rad(angle_bins_deg)
    bottom = np.zeros(len(angles))
    for index, label in enumerate(tws_labels):
        heights = percentages[label].values if label in percentages.columns else np.zeros(len(angles))
        ax.bar(
            angles,
            heights,
            width=width,
            bottom=bottom,
            color=colors[index % len(colors)],
            edgecolor="black",
            linewidth=0.5,
            label=label,
        )
        bottom += heights

    if show_segment_labels:
        bottom = np.zeros(len(angles))
        for label in tws_labels:
            heights = percentages[label].values if label in percentages.columns else np.zeros(len(angles))
            for angle, height, base in zip(angles, heights, bottom):
                if height >= seg_floor:
                    ax.text(angle, base + height / 2, f"{int(round(height))}%", ha="center", va="center", fontsize=8)
            bottom += heights

    if show_total_labels:
        for angle, total_value in zip(angles, total_percent):
            if total_value >= total_floor:
                ax.text(angle, total_value + 1, f"{int(round(total_value))}%", ha="center", va="bottom", fontsize=9, fontweight="bold")

    tick_angles = np.arange(0, 360 + int(xtick_step_deg), int(xtick_step_deg))
    labels = [f"{int(angle - 180)}deg" for angle in tick_angles] if angle_col == "Twa" else [f"{int(angle)}deg" for angle in tick_angles]
    ax.set_xticks(np.deg2rad(tick_angles))
    ax.set_xticklabels(labels)
    ax.tick_params(axis="x", labelsize=10, pad=6)
    ax.set_rgrids(rgrid_ticks, angle=90)
    ax.set_ylim(0, ylim)

    start_time, end_time = time_range
    title_str = f"{title_prefix} (% Time Sailed)\n{start_time} to {end_time}"
    if model_name:
        title_str += f"\nModel: {model_name}"
    ax.set_title(title_str, va="bottom")
    ax.legend(title="TWS", loc="upper right", bbox_to_anchor=(1.25, 1.02))
    fig.tight_layout()
    return fig


def build_time_series_figure(
    df: pd.DataFrame,
    time_col: str,
    start_time: str,
    end_time: str,
    model_name: str,
    label_every: int,
    gap_minutes: int,
) -> plt.Figure:
    fig, ax1 = plt.subplots(figsize=(16, 9))

    dft = df.sort_values(time_col).copy()
    if gap_minutes > 0:
        dft["_gap_s"] = dft[time_col].diff().dt.total_seconds()
        gap_seconds = int(gap_minutes * 60)
        dft.loc[dft["_gap_s"] > gap_seconds, ["Tws", "Twd°M"]] = np.nan

    ax1.plot(dft[time_col], dft["Tws"], color="blue", label="TWS")
    ax1.set_ylabel("TWS (kt)", color="blue")
    ax1.tick_params(axis="y", labelcolor="blue")

    for index, (x_value, y_value) in enumerate(zip(dft[time_col], dft["Tws"])):
        if pd.notna(y_value) and index % int(label_every) == 0:
            ax1.text(x_value, y_value, f"{int(round(y_value))}", fontsize=7, va="bottom")

    ax2 = ax1.twinx()
    if dft["Twd°M"].notna().any():
        ax2.plot(dft[time_col], dft["Twd°M"], color="red", label="TWD")
        ax2.set_ylabel("TWD (deg)", color="red")
        ax2.tick_params(axis="y", labelcolor="red")
        for index, (x_value, y_value) in enumerate(zip(dft[time_col], dft["Twd°M"])):
            if pd.notna(y_value) and index % int(label_every) == 0:
                ax2.text(x_value, y_value, f"{int(round(y_value))}", fontsize=7, va="top")
    else:
        ax2.set_ylabel("TWD (deg)")

    locator = mdates.AutoDateLocator(minticks=5, maxticks=10)
    formatter = mdates.ConciseDateFormatter(locator)
    ax1.xaxis.set_major_locator(locator)
    ax1.xaxis.set_major_formatter(formatter)
    fig.autofmt_xdate()

    mark_col = first_col_containing(dft, ["mark"])
    if mark_col:
        last_time = None
        min_spacing = pd.Timedelta(minutes=max(15, gap_minutes // 4))
        y_top = ax1.get_ylim()[1]
        change = (dft[mark_col] != dft[mark_col].shift(1)) & dft[mark_col].notna()
        for time_value, mark_value in zip(dft.loc[change, time_col], dft.loc[change, mark_col]):
            if last_time is None or (time_value - last_time) > min_spacing:
                ax1.axvline(time_value, linestyle="--", alpha=0.4)
                ax1.text(time_value, y_top, str(mark_value), rotation=90, va="top", ha="right", fontsize=8)
                last_time = time_value

    title_str = f"TWS/TWD Time Series\n{start_time} to {end_time}"
    if model_name:
        title_str += f"\nModel: {model_name}"
    plt.title(title_str)
    fig.tight_layout()
    return fig


def run_routing_figures(values: dict[str, Any]) -> dict[str, Any]:
    upload = _as_uploaded_file(values.get("csv_file"), "csv_file")
    ws_max = _as_int(values.get("ws_max"), 36)
    ws_step = _as_int(values.get("ws_step"), 4)
    dir_step = _as_int(values.get("dir_step"), 10)
    xtick_step = _as_int(values.get("xtick_step"), 45)
    radial_step_percent = _as_int(values.get("radial_step_percent"), 2)
    show_bar_labels = _as_bool(values.get("show_bar_labels"), True)
    segment_label_floor = _as_int(values.get("segment_label_floor"), 2)
    show_total_labels = _as_bool(values.get("show_total_labels"), True)
    ring_label_floor = _as_int(values.get("ring_label_floor"), 6)
    radial_max_percent = _as_int(values.get("radial_max_percent"), 0)
    dayfirst = _as_bool(values.get("dayfirst"), True)
    label_every = _as_int(values.get("label_every"), 8)
    gap_minutes = _as_int(values.get("gap_minutes"), 0)

    df_raw, rows = read_csv_to_df(upload.data)
    if df_raw.empty:
        raise ValueError("CSV appears empty after parsing.")

    df = df_raw.copy()
    if "Twa" not in df.columns:
        twa_col = first_col_containing(df, ["twa"]) or "Twa"
        if twa_col not in df.columns:
            raise ValueError("No TWA column found.")
        df.rename(columns={twa_col: "Twa"}, inplace=True)

    if "Tws" not in df.columns:
        tws_col = first_col_containing(df, ["tws", "wind speed"]) or "Tws"
        if tws_col not in df.columns:
            raise ValueError("No TWS column found.")
        df.rename(columns={tws_col: "Tws"}, inplace=True)

    twd_col = first_col_containing(df, ["twd", "true wind dir"])
    if twd_col:
        df.rename(columns={twd_col: "Twd°M"}, inplace=True)
    else:
        df["Twd°M"] = np.nan

    optional_speed_columns = detect_optional_speed_columns(df)
    temperature_columns = detect_temperature_columns(df)

    df["Twa"] = parse_numeric(df, "Twa")
    df["Tws"] = parse_numeric(df, "Tws")
    df["Twd°M"] = parse_numeric(df, "Twd°M")
    for _, column in optional_speed_columns + temperature_columns:
        df[column] = parse_numeric(df, column)

    time_col = first_col_containing(df, ["time", "utc", "date"])
    if time_col:
        time_series = df[time_col].astype(str).str.strip().replace({"": np.nan})
        time_series = time_series.str.replace(r"[./]", "-", regex=True)
        df[time_col] = pd.to_datetime(time_series, errors="coerce", dayfirst=dayfirst, utc=False)
        start_time, end_time = format_timerange(df[time_col], dayfirst)
    else:
        start_time = end_time = "?"

    model_name = detect_model(rows)
    df_for_twa = df.dropna(subset=["Twa", "Tws"])
    df_for_twd = df.dropna(subset=["Twd°M", "Tws"])
    df_for_time_series = df.dropna(subset=[time_col, "Tws"]) if time_col else df.dropna(subset=["Tws"])
    speed_series = [("TWS", "Tws"), *optional_speed_columns]
    direction_series = [("TWD", "Twd°M")]
    mark_col = first_col_containing(df, ["mark"])

    figures: list[dict[str, str]] = []

    if not df_for_twd.empty:
        twd_figure = wind_polar(
            df_for_twd,
            angle_col="Twd°M",
            speed_col="Tws",
            angle_bins_deg=dir_step,
            ws_max=ws_max,
            ws_step=ws_step,
            zero_at="N",
            theta_direction_ccw=True,
            title_prefix="TWD vs TWS",
            time_range=(start_time, end_time),
            model_name=model_name,
            show_segment_labels=show_bar_labels,
            seg_floor=float(segment_label_floor),
            show_total_labels=show_total_labels,
            total_floor=float(ring_label_floor),
            xtick_step_deg=xtick_step,
            radial_max_percent=radial_max_percent,
            radial_step_percent=radial_step_percent,
        )
        figures.append({"title": "TWD vs TWS", "image_data_url": figure_to_data_url(twd_figure)})

    twa_figure = wind_polar(
        df_for_twa,
        angle_col="Twa",
        speed_col="Tws",
        angle_bins_deg=dir_step,
        ws_max=ws_max,
        ws_step=ws_step,
        zero_at="S",
        theta_direction_ccw=True,
        title_prefix="TWA vs TWS",
        time_range=(start_time, end_time),
        model_name=model_name,
        show_segment_labels=show_bar_labels,
        seg_floor=float(segment_label_floor),
        show_total_labels=show_total_labels,
        total_floor=float(ring_label_floor),
        xtick_step_deg=xtick_step,
        radial_max_percent=radial_max_percent,
        radial_step_percent=radial_step_percent,
    )
    figures.append({"title": "TWA vs TWS", "image_data_url": figure_to_data_url(twa_figure)})

    if time_col and not df_for_time_series.empty:
        time_series_figure = build_time_series_figure(
            df_for_time_series,
            time_col,
            start_time,
            end_time,
            model_name,
            label_every,
            gap_minutes,
        )
        figures.append({"title": "TWS/TWD Time Series", "image_data_url": figure_to_data_url(time_series_figure)})

    timeseries_output = (
        build_routing_timeseries_output(
            df_for_time_series,
            time_col,
            model_name,
            gap_minutes,
            speed_series=speed_series,
            direction_series=direction_series,
            temperature_series=temperature_columns,
            mark_col=mark_col,
        )
        if time_col and not df_for_time_series.empty
        else None
    )

    return {
        "message": "Routing figures generated.",
        "summary": f"Processed {len(df_for_time_series)} sailing records{f' for {model_name}' if model_name else ''}.",
        "outputs": {
            "metrics": [
                {"label": "Rows", "value": str(len(df_for_time_series))},
                {"label": "Start", "value": start_time},
                {"label": "End", "value": end_time},
            ],
            "figures": figures,
            "timeseries": timeseries_output,
        },
    }

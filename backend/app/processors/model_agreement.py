from __future__ import annotations

import csv
import io
import re
from collections import Counter
from typing import Any

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from app.processors.base import UploadedInputFile
from app.processors.utils import bytes_to_base64, figure_to_data_url


AUTO_TIME_COL_CANDIDATES = [
    "time",
    "timestamp",
    "date",
    "datetime",
    "valid_time",
    "valid",
    "validtime",
    "w. europe daylight time",
]
AUTO_TWS_COL_CANDIDATES = [
    "tws",
    "wind",
    "windspeed",
    "wind_speed",
    "ff",
    "ff10",
    "ws",
    "spd",
    "kt",
]
AUTO_TWD_COL_CANDIDATES = [
    "twd",
    "winddir",
    "wind_direction",
    "dd",
    "dir",
    "wd",
    "wind 10m",
    "wind10m",
    "wind10m deg",
]


def _serialize_number(value: Any) -> float | int | None:
    if value is None:
        return None
    if isinstance(value, (np.integer, int)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        if np.isnan(value) or np.isinf(value):
            return None
        return round(float(value), 3)
    return value


def _serialize_series(series: pd.Series | None) -> list[float | int | None] | None:
    if series is None:
        return None
    return [_serialize_number(value) for value in series.tolist()]


def _serialize_frame_rows(frame: pd.DataFrame) -> list[dict[str, Any]]:
    serializable = frame.reset_index(names="time").copy()
    serializable["time"] = serializable["time"].apply(lambda value: value.isoformat() if pd.notna(value) else "")
    rows: list[dict[str, Any]] = []
    for row in serializable.to_dict(orient="records"):
        rows.append({str(key): _serialize_number(value) if isinstance(value, (np.integer, int, np.floating, float)) else value for key, value in row.items()})
    return rows


def _as_bool(value: Any, default: bool) -> bool:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _as_float(value: Any, default: float) -> float:
    if value is None or value == "":
        return default
    return float(value)


def _as_upload_list(value: Any, key: str) -> list[UploadedInputFile]:
    if isinstance(value, UploadedInputFile):
        return [value]
    if isinstance(value, list) and all(isinstance(item, UploadedInputFile) for item in value):
        return value
    raise ValueError(f"Expected uploaded file(s) for '{key}'.")


def _sniff_and_read(file_bytes: bytes) -> pd.DataFrame:
    raw = None
    for encoding in ("utf-8", "latin-1"):
        try:
            raw = file_bytes.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if raw is None:
        raw = file_bytes.decode("utf-8", errors="ignore")

    try:
        delimiter = csv.Sniffer().sniff(raw[:2000]).delimiter
    except Exception:
        first_line = raw.splitlines()[0] if raw.splitlines() else ""
        delimiter = next((candidate for candidate in [",", ";", "\t", "|"] if candidate in first_line), ",")

    try:
        return pd.read_csv(io.StringIO(raw), delimiter=delimiter, decimal=",")
    except Exception:
        return pd.read_csv(io.StringIO(raw), delimiter=delimiter)


def _auto_pick(colnames: list[str], candidates: list[str]) -> str | None:
    def norm(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", value.lower())

    norm_map = {norm(column): column for column in colnames}
    for candidate in candidates:
        key = norm(candidate)
        if key in norm_map:
            return norm_map[key]

    candidate_keys = [norm(candidate) for candidate in candidates]
    for column in colnames:
        normalized_column = re.sub(r"[^a-z0-9]+", "", column.lower())
        if any(candidate_key in normalized_column for candidate_key in candidate_keys):
            return column
    return None


def to_datetime_series(df: pd.DataFrame, col: str | None) -> pd.Series:
    if col is None:
        raise ValueError("No time column selected.")
    series = df[col]
    dt = pd.to_datetime(series, errors="coerce", dayfirst=True)
    if dt.isna().all():
        dt = pd.to_datetime(series, errors="coerce")
    if dt.isna().any():
        dt = series.apply(lambda value: pd.to_datetime(value, errors="coerce", dayfirst=True))
    return dt


def standardize_columns(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, str]]:
    mapping: dict[str, str] = {}
    cols = list(df.columns)
    time_col = _auto_pick(cols, AUTO_TIME_COL_CANDIDATES)
    tws_col = _auto_pick(cols, AUTO_TWS_COL_CANDIDATES)
    twd_col = _auto_pick(cols, AUTO_TWD_COL_CANDIDATES)
    out = df.copy()
    if time_col:
        out["time"] = to_datetime_series(out, time_col)
        mapping["time"] = time_col
    if tws_col:
        out["TWS"] = pd.to_numeric(out[tws_col], errors="coerce")
        mapping["TWS"] = tws_col
    if twd_col:
        out["TWD"] = pd.to_numeric(out[twd_col], errors="coerce")
        mapping["TWD"] = twd_col
    if "time" in out:
        out = out.dropna(subset=["time"]).sort_values("time")
        out = out.loc[~out["time"].duplicated(keep="first")]
    return out, mapping


def infer_common_freq(times: pd.Series) -> pd.Timedelta:
    if times.empty or len(times) < 3:
        return pd.Timedelta(hours=1)
    diffs = pd.to_timedelta(np.diff(times.values.astype("datetime64[ns]")))
    median = diffs.median()
    if median <= pd.Timedelta(minutes=12):
        return pd.Timedelta(minutes=10)
    if median <= pd.Timedelta(minutes=22):
        return pd.Timedelta(minutes=15)
    if median <= pd.Timedelta(minutes=45):
        return pd.Timedelta(minutes=30)
    if median <= pd.Timedelta(hours=2):
        return pd.Timedelta(hours=1)
    return pd.Timedelta(hours=3)


def build_common_index(models: dict[str, pd.DataFrame]) -> pd.DatetimeIndex:
    spans: list[tuple[pd.Timestamp, pd.Timestamp]] = []
    frequencies: list[pd.Timedelta] = []
    for df in models.values():
        if "time" not in df or df["time"].empty:
            continue
        times = df["time"]
        frequencies.append(infer_common_freq(times))
        spans.append((times.min(), times.max()))
    if not spans:
        return pd.DatetimeIndex([])
    start = min(start for start, _ in spans)
    end = max(end for _, end in spans)
    step = min(frequencies) if frequencies else pd.Timedelta(hours=1)
    return pd.date_range(start, end, freq=step)


def regrid(df: pd.DataFrame, index: pd.DatetimeIndex) -> pd.DataFrame:
    if df.empty or "time" not in df:
        return pd.DataFrame(index=index)
    out = df.set_index("time").sort_index()
    keep = [column for column in ["TWS", "TWD"] if column in out.columns]
    out = out[keep].reindex(index)
    if "TWS" in out:
        out["TWS"] = out["TWS"].interpolate(method="time", limit_direction="both")
    if "TWD" in out:
        radians = np.deg2rad(out["TWD"])
        complex_values = np.exp(1j * radians)
        real = pd.Series(np.real(complex_values), index=out.index).interpolate(method="time", limit_direction="both")
        imag = pd.Series(np.imag(complex_values), index=out.index).interpolate(method="time", limit_direction="both")
        out["TWD"] = (np.angle(real + 1j * imag) * 180 / np.pi) % 360
    return out


def circular_mean_deg(deg_values: np.ndarray) -> float:
    radians = np.deg2rad(deg_values)
    cos_component = np.mean(np.cos(radians))
    sin_component = np.mean(np.sin(radians))
    return (np.arctan2(sin_component, cos_component) * 180 / np.pi) % 360


def circular_resultant_length(deg_values: np.ndarray) -> float:
    radians = np.deg2rad(deg_values)
    cos_component = np.mean(np.cos(radians))
    sin_component = np.mean(np.sin(radians))
    return float(np.sqrt(cos_component * cos_component + sin_component * sin_component))


def agreement_speed(series_list: list[pd.Series]) -> pd.Series:
    matrix = pd.concat(series_list, axis=1)
    mean_values = matrix.mean(axis=1)
    std_values = matrix.std(axis=1)
    epsilon = 1e-6
    return (1 - (std_values / (mean_values.abs() + epsilon))).clip(0, 1)


def agreement_speed_threshold(series_list: list[pd.Series], band: float = 2.0) -> pd.Series:
    matrix = pd.concat(series_list, axis=1)
    median = matrix.median(axis=1)
    within = matrix.sub(median, axis=0).abs() <= band
    return within.sum(axis=1) / within.shape[1]


def agreement_direction(series_list: list[pd.Series]) -> pd.Series:
    matrix = pd.concat(series_list, axis=1)

    def row_resultant(row: pd.Series) -> float:
        vals = row.dropna().values.astype(float)
        if len(vals) == 0:
            return np.nan
        return circular_resultant_length(vals)

    return matrix.apply(row_resultant, axis=1)


def circular_unwrap_deg(values: np.ndarray) -> np.ndarray:
    if values is None or len(values) == 0:
        return values
    arr = np.mod(np.asarray(values, dtype=float), 360.0)
    unwrapped = np.rad2deg(np.unwrap(np.deg2rad(arr)))
    base = unwrapped[0]
    for index in range(len(unwrapped)):
        while unwrapped[index] - base > 180:
            unwrapped[index] -= 360
        while unwrapped[index] - base < -180:
            unwrapped[index] += 360
    return unwrapped


def run_model_agreement(values: dict[str, Any]) -> dict[str, Any]:
    uploads = _as_upload_list(values.get("csv_files"), "csv_files")
    if len(uploads) < 2:
        raise ValueError("Upload at least two meteogram CSV files.")

    speed_unit = str(values.get("speed_unit") or "kt")
    band_val = _as_float(values.get("band_val"), 2.0)
    show_mean = _as_bool(values.get("show_mean"), True)
    show_spread = _as_bool(values.get("show_spread"), True)
    show_dir_sigma = _as_bool(values.get("show_dir_sigma"), True)
    wrap_dir_display = _as_bool(values.get("wrap_dir_display"), True)
    show_band_agreement = _as_bool(values.get("show_band_agreement"), True)
    smooth = _as_bool(values.get("smooth"), False)
    auto_fit_dir_ylim = _as_bool(values.get("auto_fit_dir_ylim"), True)

    models_raw: dict[str, pd.DataFrame] = {}
    mappings: dict[str, dict[str, str]] = {}
    errors: list[str] = []
    for upload in uploads:
        name = upload.filename.rsplit(".", 1)[0]
        try:
            df = _sniff_and_read(upload.data)
            standardized, mapping = standardize_columns(df)
            models_raw[name] = standardized
            mappings[name] = mapping
        except Exception as exc:
            errors.append(f"{upload.filename}: {exc}")

    if len(models_raw) < 2:
        raise ValueError("At least two readable CSVs are required to compute agreement.")

    common_index = build_common_index(models_raw)
    if len(common_index) == 0:
        raise ValueError("Could not build a common time index.")

    models = {name: regrid(df, common_index) for name, df in models_raw.items()}

    if smooth:
        for df in models.values():
            if "TWS" in df:
                df["TWS"] = df["TWS"].rolling(3, min_periods=1, center=True).mean()
            if "TWD" in df:
                radians = np.deg2rad(df["TWD"])
                complex_values = np.exp(1j * radians)
                complex_values = pd.Series(complex_values, index=df.index).rolling(3, min_periods=1, center=True).mean()
                df["TWD"] = (np.angle(complex_values) * 180 / np.pi) % 360

    conversion = 0.514444 if speed_unit == "m/s" else 1.0
    frames_speed = [df["TWS"] * conversion for df in models.values() if "TWS" in df]
    frames_dir = [df["TWD"] for df in models.values() if "TWD" in df]
    if not frames_speed and not frames_dir:
        raise ValueError("No TWS or TWD columns were detected across the uploads.")

    mean_speed = pd.concat(frames_speed, axis=1).mean(axis=1) if frames_speed else None
    std_speed = pd.concat(frames_speed, axis=1).std(axis=1) if frames_speed else None

    mean_dir = None
    if frames_dir:
        matrix = pd.concat(frames_dir, axis=1)
        mean_dir = matrix.apply(
            lambda row: circular_mean_deg(row.dropna().values.astype(float)) if row.notna().any() else np.nan,
            axis=1,
        )

    speed_agree_cv = agreement_speed(frames_speed) if frames_speed else None
    speed_agree_band = agreement_speed_threshold(frames_speed, band=band_val) if frames_speed else None
    dir_agree_resultant = agreement_direction(frames_dir) if frames_dir else None

    speed_agree_cv_pct = speed_agree_cv * 100.0 if speed_agree_cv is not None else None
    speed_agree_band_pct = speed_agree_band * 100.0 if speed_agree_band is not None else None
    dir_agree_resultant_pct = dir_agree_resultant * 100.0 if dir_agree_resultant is not None else None

    dir_sigma_deg = None
    if dir_agree_resultant is not None:
        clipped = dir_agree_resultant.clip(lower=1e-12, upper=1.0)
        dir_sigma_deg = np.rad2deg(np.sqrt(-2.0 * np.log(clipped)))

    time_headers = [mapping.get("time") for mapping in mappings.values() if mapping.get("time")]
    time_header = Counter(time_headers).most_common(1)[0][0] if time_headers else None
    time_xlabel = f"Time ({time_header})" if time_header else "Time"

    figures: list[dict[str, str]] = []

    if frames_speed:
        fig_speed, (ax_speed, ax_agreement) = plt.subplots(
            2,
            1,
            sharex=True,
            figsize=(12, 8),
            gridspec_kw={"height_ratios": [2.0, 1.0]},
        )
        for name, df in models.items():
            if "TWS" not in df:
                continue
            ax_speed.plot(df.index, (df["TWS"] * conversion).values, alpha=0.7, linewidth=1.5, label=name)
        if show_mean and mean_speed is not None:
            ax_speed.plot(mean_speed.index, mean_speed.values, linewidth=2.2, linestyle="--", label="Ensemble mean")
        if show_spread and std_speed is not None and mean_speed is not None:
            ax_speed.fill_between(mean_speed.index, (mean_speed - std_speed).values, (mean_speed + std_speed).values, alpha=0.15, label="+-1sigma")
        ax_speed.set_ylabel(f"Wind speed [{speed_unit}]")
        ax_speed.grid(True, alpha=0.3)
        ax_speed.legend(ncols=3, fontsize=9)

        if speed_agree_cv_pct is not None:
            ax_agreement.plot(speed_agree_cv_pct.index, speed_agree_cv_pct.values, linewidth=1.8, label="Agreement (1-sigma/mu) %")
        if show_band_agreement and speed_agree_band_pct is not None:
            ax_agreement.plot(
                speed_agree_band_pct.index,
                speed_agree_band_pct.values,
                linewidth=1.8,
                label=f"Within +- {band_val:g} {speed_unit} %",
            )
        ax_agreement.set_ylim(0, 100)
        ax_agreement.set_ylabel("Agreement [%]")
        ax_agreement.set_xlabel(time_xlabel)
        ax_agreement.grid(True, alpha=0.3)
        ax_agreement.legend()
        fig_speed.suptitle("Wind Speed - Models & Agreement", y=0.98)
        fig_speed.tight_layout(rect=[0, 0, 1, 0.96])
        figures.append({"title": "Wind Speed Agreement", "image_data_url": figure_to_data_url(fig_speed)})

    if frames_dir:
        fig_dir, (ax_dir, ax_dir_agreement) = plt.subplots(
            2,
            1,
            sharex=True,
            figsize=(12, 8),
            gridspec_kw={"height_ratios": [2.0, 1.0]},
        )

        displayed_y: list[np.ndarray] = []
        for name, df in models.items():
            if "TWD" not in df:
                continue
            y_unwrapped = circular_unwrap_deg(df["TWD"].values)
            y_plot = (y_unwrapped + 360) % 360 if wrap_dir_display else y_unwrapped
            ax_dir.plot(df.index, y_plot, alpha=0.7, linewidth=1.5, label=name)
            displayed_y.append(np.asarray(y_plot, dtype=float))

        if mean_dir is not None:
            mean_unwrapped = pd.Series(circular_unwrap_deg(mean_dir.values), index=mean_dir.index)
            mean_plot = (mean_unwrapped + 360) % 360 if wrap_dir_display else mean_unwrapped
            ax_dir.plot(mean_plot.index, mean_plot.values, linewidth=2.2, linestyle="--", label="Circular mean")
            displayed_y.append(np.asarray(mean_plot.values, dtype=float))

            if show_dir_sigma and dir_sigma_deg is not None:
                sigma = dir_sigma_deg.reindex(mean_plot.index).interpolate().bfill().ffill()
                upper = mean_unwrapped + sigma
                lower = mean_unwrapped - sigma
                if wrap_dir_display:
                    upper = (upper + 360) % 360
                    lower = (lower + 360) % 360
                ax_dir.fill_between(mean_plot.index, lower.values, upper.values, alpha=0.15, label="+-1sigma (circular)")
                displayed_y.append(np.asarray(upper.values, dtype=float))
                displayed_y.append(np.asarray(lower.values, dtype=float))

        ax_dir.set_ylabel("Wind direction [deg]")
        ax_dir.grid(True, alpha=0.3)
        ax_dir.legend(ncols=3, fontsize=9)

        if auto_fit_dir_ylim and displayed_y:
            finite_values = [values[np.isfinite(values)] for values in displayed_y if np.isfinite(values).any()]
            if finite_values:
                all_vals = np.concatenate(finite_values)
                min_value = float(np.min(all_vals))
                max_value = float(np.max(all_vals))
                crosses_north = wrap_dir_display and (min_value < 90) and (max_value > 270)
                if crosses_north:
                    ax_dir.set_ylim(0, 360)
                elif np.isclose(min_value, max_value):
                    ax_dir.set_ylim(min_value - 5.0, max_value + 5.0)
                else:
                    padding = 0.05 * (max_value - min_value)
                    ax_dir.set_ylim(min_value - padding, max_value + padding)
        elif wrap_dir_display:
            ax_dir.set_ylim(0, 360)

        if dir_agree_resultant_pct is not None:
            ax_dir_agreement.plot(
                dir_agree_resultant_pct.index,
                dir_agree_resultant_pct.values,
                linewidth=1.8,
                label="Directional agreement (R) %",
            )
            ax_dir_agreement.set_ylim(0, 100)
            ax_dir_agreement.set_ylabel("Agreement [%]")
            ax_dir_agreement.set_xlabel(time_xlabel)
            ax_dir_agreement.grid(True, alpha=0.3)
            ax_dir_agreement.legend()

        fig_dir.suptitle("Wind Direction - Models & Agreement", y=0.98)
        fig_dir.tight_layout(rect=[0, 0, 1, 0.96])
        figures.append({"title": "Wind Direction Agreement", "image_data_url": figure_to_data_url(fig_dir)})

    merged = pd.DataFrame(index=common_index)
    for name, df in models.items():
        if "TWS" in df:
            merged[f"{name}_TWS_{speed_unit}"] = df["TWS"] * conversion
        if "TWD" in df:
            merged[f"{name}_TWD_deg"] = df["TWD"]
    if speed_agree_cv_pct is not None:
        merged["agree_speed_cv_pct"] = speed_agree_cv_pct
    if speed_agree_band_pct is not None:
        merged["agree_speed_band_pct"] = speed_agree_band_pct
    if dir_agree_resultant_pct is not None:
        merged["agree_dir_R_pct"] = dir_agree_resultant_pct

    csv_bytes = merged.to_csv(index_label="time").encode("utf-8")
    preview = merged.head(60).reset_index(names="time")
    preview["time"] = preview["time"].astype(str)
    merged_rows = _serialize_frame_rows(merged)
    timestamps = [timestamp.isoformat() for timestamp in common_index.to_pydatetime()]

    timeseries: dict[str, Any] = {
        "timestamps": timestamps,
        "columns": [str(column) for column in ["time", *merged.columns.tolist()]],
        "rows": merged_rows,
    }

    if frames_speed:
        speed_models = [
            {
                "label": name,
                "column_key": f"{name}_TWS_{speed_unit}",
                "values": _serialize_series(df["TWS"] * conversion),
            }
            for name, df in models.items()
            if "TWS" in df
        ]
        speed_agreement: list[dict[str, Any]] = []
        if speed_agree_cv_pct is not None:
            speed_agreement.append(
                {
                    "label": "Agreement (1-sigma/mu) %",
                    "column_key": "agree_speed_cv_pct",
                    "values": _serialize_series(speed_agree_cv_pct),
                }
            )
        if show_band_agreement and speed_agree_band_pct is not None:
            speed_agreement.append(
                {
                    "label": f"Within +- {band_val:g} {speed_unit} %",
                    "column_key": "agree_speed_band_pct",
                    "values": _serialize_series(speed_agree_band_pct),
                }
            )

        timeseries["speed"] = {
            "unit": speed_unit,
            "models": speed_models,
            "mean": {"label": "Ensemble mean", "values": _serialize_series(mean_speed)} if show_mean and mean_speed is not None else None,
            "spread": (
                {
                    "label": "+-1sigma",
                    "lower": _serialize_series(mean_speed - std_speed),
                    "upper": _serialize_series(mean_speed + std_speed),
                }
                if show_spread and mean_speed is not None and std_speed is not None
                else None
            ),
            "agreement": speed_agreement,
        }

    if frames_dir:
        direction_models: list[dict[str, Any]] = []
        for name, df in models.items():
            if "TWD" not in df:
                continue
            y_unwrapped = circular_unwrap_deg(df["TWD"].values)
            y_plot = (y_unwrapped + 360) % 360 if wrap_dir_display else y_unwrapped
            direction_models.append(
                {
                    "label": name,
                    "column_key": f"{name}_TWD_deg",
                    "values": [_serialize_number(value) for value in y_plot.tolist()],
                }
            )

        mean_dir_output = None
        direction_spread = None
        if mean_dir is not None:
            mean_unwrapped = pd.Series(circular_unwrap_deg(mean_dir.values), index=mean_dir.index)
            mean_plot = (mean_unwrapped + 360) % 360 if wrap_dir_display else mean_unwrapped
            mean_dir_output = {"label": "Circular mean", "values": _serialize_series(mean_plot)}

            if show_dir_sigma and dir_sigma_deg is not None:
                sigma = dir_sigma_deg.reindex(mean_plot.index).interpolate().bfill().ffill()
                upper = mean_unwrapped + sigma
                lower = mean_unwrapped - sigma
                if wrap_dir_display:
                    upper = (upper + 360) % 360
                    lower = (lower + 360) % 360
                direction_spread = {
                    "label": "+-1sigma (circular)",
                    "lower": _serialize_series(lower),
                    "upper": _serialize_series(upper),
                }

        direction_agreement: list[dict[str, Any]] = []
        if dir_agree_resultant_pct is not None:
            direction_agreement.append(
                {
                    "label": "Directional agreement (R) %",
                    "column_key": "agree_dir_R_pct",
                    "values": _serialize_series(dir_agree_resultant_pct),
                }
            )

        timeseries["direction"] = {
            "unit": "deg",
            "wrap_display": wrap_dir_display,
            "models": direction_models,
            "mean": mean_dir_output,
            "spread": direction_spread,
            "agreement": direction_agreement,
        }

    outputs: dict[str, Any] = {
        "metrics": [
            {"label": "Models", "value": str(len(models))},
            {"label": "Time points", "value": str(len(common_index))},
            {"label": "Unit", "value": speed_unit},
        ],
        "figures": figures,
        "timeseries": timeseries,
        "tables": [
            {
                "title": "Merged Preview",
                "columns": [str(column) for column in preview.columns],
                "rows": preview.fillna("").to_dict(orient="records"),
            }
        ],
        "downloads": [
            {
                "label": "Merged agreement CSV",
                "filename": "meteogram_agreement_merged.csv",
                "mime": "text/csv",
                "data_base64": bytes_to_base64(csv_bytes),
            }
        ],
    }

    if errors:
        outputs["notes"] = errors

    return {
        "message": "Model agreement analysis generated.",
        "summary": f"Compared {len(models)} meteogram files on a common time grid.",
        "outputs": outputs,
    }

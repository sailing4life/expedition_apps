from __future__ import annotations

from typing import Any, Optional
import xml.etree.ElementTree as ET
import re

import matplotlib.patheffects as pe
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import Polygon
import numpy as np
import pandas as pd

from app.processors.base import UploadedInputFile
from app.processors.utils import figure_to_data_url


def _as_uploaded_file(value: Any, key: str) -> UploadedInputFile:
    if isinstance(value, UploadedInputFile):
        return value
    raise ValueError(f"Expected uploaded file for '{key}'.")


def _as_float(value: Any, default: float) -> float:
    if value is None or value == "":
        return default
    return float(value)


def centers_to_edges(centers: np.ndarray) -> np.ndarray:
    centers = np.asarray(centers, dtype=float)
    diffs = np.diff(centers)
    delta = np.median(diffs) if len(diffs) else 1.0
    return np.concatenate(
        [
            [centers[0] - delta / 2],
            centers[:-1] + diffs / 2,
            [centers[-1] + delta / 2],
        ]
    )


def catmull_rom_spline(points: np.ndarray, n_points: int = 35, closed: bool = True) -> np.ndarray:
    points = np.asarray(points, dtype=float)
    if len(points) < 4:
        return points

    if closed:
        pts = np.vstack([points[-1], points, points[0], points[1]])
        segment_count = len(points)
        index_offset = 1
    else:
        pts = np.vstack([points[0], points, points[-1]])
        segment_count = len(points) - 1
        index_offset = 1

    curves: list[np.ndarray] = []
    for index in range(segment_count):
        p0 = pts[index + index_offset - 1]
        p1 = pts[index + index_offset]
        p2 = pts[index + index_offset + 1]
        p3 = pts[index + index_offset + 2]

        t = np.linspace(0, 1, n_points, endpoint=False)
        t2 = t * t
        t3 = t2 * t

        a = 2 * p1
        b = -p0 + p2
        c = 2 * p0 - 5 * p1 + 4 * p2 - p3
        d = -p0 + 3 * p1 - 3 * p2 + p3

        curve = 0.5 * (a + np.outer(t, b) + np.outer(t2, c) + np.outer(t3, d))
        curves.append(curve)

    out = np.vstack(curves)
    if closed:
        return np.vstack([out, out[0]])
    return np.vstack([out, points[-1]])


def parse_color(node: Optional[ET.Element], default: tuple[int, int, int] = (0, 0, 0)) -> tuple[float, float, float]:
    if node is None:
        return tuple(np.array(default) / 255)

    red = int(node.attrib.get("R", default[0]))
    green = int(node.attrib.get("G", default[1]))
    blue = int(node.attrib.get("B", default[2]))
    return (red / 255, green / 255, blue / 255)


def _parse_number(value: str) -> float:
    cleaned = value.strip().replace("%", "")
    if not cleaned:
        raise ValueError("Empty numeric token.")
    return float(cleaned.replace(",", "."))


def _split_matrix_line(line: str) -> list[str]:
    return [part.strip() for part in re.split(r"[;,]", line) if part.strip()]


def load_routing_matrix(data: bytes) -> pd.DataFrame:
    text = data.decode("utf-8", errors="ignore")
    lines = [line.strip() for line in text.splitlines()]

    header_index: int | None = None
    twa_values: list[float] = []

    for index, line in enumerate(lines):
        if not line:
            continue
        tokens = _split_matrix_line(line)
        if len(tokens) < 3:
            continue
        first = tokens[0].lower().replace(" ", "")
        if "tws" not in first:
            continue

        numeric_tokens: list[float] = []
        for token in tokens[1:]:
            try:
                numeric_tokens.append(_parse_number(token))
            except Exception:
                numeric_tokens = []
                break

        if len(numeric_tokens) >= 2:
            header_index = index
            twa_values = numeric_tokens
            break

    if header_index is None or not twa_values:
        raise ValueError("Could not detect TWA headers in the routing matrix CSV.")

    rows: list[tuple[float, list[float]]] = []
    started = False

    for line in lines[header_index + 1 :]:
        if not line:
            if started:
                break
            continue

        tokens = _split_matrix_line(line)
        if len(tokens) < 2:
            if started:
                break
            continue

        try:
            tws = _parse_number(tokens[0])
        except Exception:
            if started:
                break
            continue

        started = True
        values: list[float] = []
        for col_index in range(len(twa_values)):
            token_index = col_index + 1
            if token_index >= len(tokens):
                values.append(0.0)
                continue
            try:
                values.append(_parse_number(tokens[token_index]))
            except Exception:
                values.append(0.0)

        rows.append((tws, values))

    if not rows:
        raise ValueError("No routing matrix rows could be parsed from the CSV.")

    tws = np.array([row[0] for row in rows], dtype=float)
    matrix = pd.DataFrame([row[1] for row in rows], index=tws, columns=np.array(twa_values, dtype=float)).sort_index()
    matrix = matrix.fillna(0.0)

    total = float(matrix.values.sum())
    if total <= 0:
        raise ValueError("Routing matrix values sum to zero.")
    return matrix / total * 100.0


def load_sails_and_lines(data: bytes) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    root = ET.fromstring(data)

    elements_node = root.find("elements")
    lines_node = root.find("lines")
    if elements_node is None or lines_node is None:
        raise ValueError("XML must contain both 'elements' and 'lines' sections.")

    sails: list[dict[str, Any]] = []
    for element in elements_node.findall("element"):
        name = element.attrib.get("name", "")
        color = parse_color(element.find("colour"))
        bezier_points = element.find("bezierpoints")
        if bezier_points is None:
            continue

        points: list[tuple[float, float]] = []
        for point in bezier_points.findall("point"):
            points.append((float(point.attrib["twa"]), float(point.attrib["tws"])))

        if len(points) >= 3:
            sails.append({"name": name, "pts": np.array(points), "color": color})

    lines: list[dict[str, Any]] = []
    for line in lines_node.findall("line"):
        name = line.attrib.get("name", "")
        color = parse_color(line.find("colour"))
        line_width_node = line.find("linewidth")
        line_width = float(line_width_node.attrib.get("val", "2")) if line_width_node is not None else 2.0

        points_node = line.find("bezierpoints")
        if points_node is None:
            points_node = line.find("points")

        points = []
        if points_node is not None:
            for point in points_node.findall("point"):
                points.append((float(point.attrib["twa"]), float(point.attrib["tws"])))

        if len(points) >= 2:
            lines.append(
                {
                    "name": name,
                    "pts": np.array(points),
                    "color": color,
                    "lw": line_width,
                }
            )

    return sails, lines


def create_plot(matrix_csv: bytes, sail_xml: bytes, threshold: float) -> tuple[plt.Figure, dict[str, str]]:
    pct = load_routing_matrix(matrix_csv)
    sails, lines = load_sails_and_lines(sail_xml)
    row_totals = pct.sum(axis=1)
    col_totals = pct.sum(axis=0)

    tws_edges = centers_to_edges(pct.index.values)
    twa_edges = centers_to_edges(pct.columns.values)

    masked = np.ma.masked_where(pct.values < threshold, pct.values)
    cmap = plt.get_cmap("viridis").copy()
    cmap.set_bad(alpha=0.0)

    vmin = max(0.0, float(threshold))
    vmax = float(masked.max()) if masked.count() else 1.0
    if vmax <= vmin:
        vmax = vmin + 1.0
    norm = plt.Normalize(vmin=vmin, vmax=vmax)

    fig = plt.figure(figsize=(19, 11))
    grid = fig.add_gridspec(
        nrows=2,
        ncols=4,
        height_ratios=[2.2, 14],
        width_ratios=[15, 3.4, 2.8, 0.5],
        hspace=0.15,
        wspace=0.08,
    )

    ax_top = fig.add_subplot(grid[0, 0])
    ax = fig.add_subplot(grid[1, 0], sharex=ax_top)
    ax_legend = fig.add_subplot(grid[1, 1])
    ax_right = fig.add_subplot(grid[1, 2], sharey=ax)
    ax_colorbar = fig.add_subplot(grid[1, 3])
    ax_legend.axis("off")

    mesh = ax.pcolormesh(
        twa_edges,
        tws_edges,
        masked,
        shading="flat",
        cmap=cmap,
        norm=norm,
    )

    top_mesh = ax_top.pcolormesh(
        twa_edges,
        np.array([0.0, 1.0]),
        col_totals.values.reshape(1, -1),
        shading="flat",
        cmap=cmap,
        norm=norm,
    )
    _ = top_mesh  # keep style consistency for potential future legend hooks

    right_mesh = ax_right.pcolormesh(
        np.array([0.0, 1.0]),
        tws_edges,
        row_totals.values.reshape(-1, 1),
        shading="flat",
        cmap=cmap,
        norm=norm,
    )
    _ = right_mesh

    ax.set_xlabel("TWA (deg)")
    ax.set_ylabel("TWS (kt)")
    ax.set_title(
        "Routing usage heatmap with smooth sail areas + reef lines\n"
        f"Visible cells: >= {threshold:.2f}% of total time"
    )
    ax.grid(True, color="#d1d5db", alpha=0.35, linewidth=0.9)

    ax_top.set_ylabel("TWA %", rotation=0, labelpad=30, va="center", fontsize=12)
    ax_top.set_yticks([])
    ax_top.tick_params(axis="x", labelbottom=False)
    ax_top.set_xlim(twa_edges[0], twa_edges[-1])

    ax_right.set_xlabel("TWS %", fontsize=12)
    ax_right.set_xticks([])
    ax_right.tick_params(axis="y", labelleft=False)

    legend_handles: list[Line2D] = []
    for sail in sails:
        smooth = catmull_rom_spline(sail["pts"], n_points=35, closed=True)
        polygon = Polygon(
            smooth,
            closed=True,
            facecolor=sail["color"],
            edgecolor=sail["color"],
            alpha=0.15,
            linewidth=2,
        )
        ax.add_patch(polygon)
        ax.plot(smooth[:, 0], smooth[:, 1], linewidth=2, color=sail["color"])
        sail_name = sail["name"] or "Sail"
        legend_handles.append(Line2D([0], [0], color=sail["color"], linewidth=3, label=sail_name))
        centroid = np.mean(sail["pts"], axis=0)
        sail_label = ax.text(
            float(centroid[0]),
            float(centroid[1]),
            sail_name,
            fontsize=11,
            fontweight="bold",
            color="#111827",
            ha="center",
            va="center",
        )
        sail_label.set_path_effects([pe.withStroke(linewidth=2.6, foreground="white", alpha=0.95)])

    for line in lines:
        smooth = catmull_rom_spline(line["pts"], n_points=35, closed=False)
        ax.plot(smooth[:, 0], smooth[:, 1], linewidth=line["lw"], color=line["color"])
        line_name = line["name"] or "Reef line"
        legend_handles.append(Line2D([0], [0], color=line["color"], linewidth=max(2, line["lw"]), label=line_name))
        mid_index = len(smooth) // 2
        reef_label = ax.text(
            float(smooth[mid_index, 0]),
            float(smooth[mid_index, 1]),
            line_name,
            fontsize=11,
            fontweight="bold",
            color="#111827",
            ha="center",
            va="center",
        )
        reef_label.set_path_effects([pe.withStroke(linewidth=2.6, foreground="white", alpha=0.95)])

    for row_index, tws in enumerate(pct.index.values):
        for col_index, twa in enumerate(pct.columns.values):
            value = pct.iat[row_index, col_index]
            if value < threshold:
                continue

            rgba = cmap(norm(value))
            luminance = 0.2126 * rgba[0] + 0.7152 * rgba[1] + 0.0722 * rgba[2]
            text_color = "white" if luminance < 0.45 else "black"

            text = ax.text(
                twa,
                tws,
                f"{value:.1f}%",
                ha="center",
                va="center",
                fontsize=8,
                fontweight="bold",
                color=text_color,
            )
            stroke = "black" if text_color == "white" else "white"
            text.set_path_effects([pe.withStroke(linewidth=2.2, foreground=stroke, alpha=0.8)])

    for col_index, twa in enumerate(pct.columns.values):
        value = float(col_totals.iat[col_index])
        rgba = cmap(norm(value))
        luminance = 0.2126 * rgba[0] + 0.7152 * rgba[1] + 0.0722 * rgba[2]
        text_color = "white" if luminance < 0.45 else "black"
        top_text = ax_top.text(
            float(twa),
            0.5,
            f"{value:.1f}",
            ha="center",
            va="center",
            fontsize=10,
            fontweight="bold",
            color=text_color,
        )
        stroke = "black" if text_color == "white" else "white"
        top_text.set_path_effects([pe.withStroke(linewidth=2.0, foreground=stroke, alpha=0.8)])

    for row_index, tws in enumerate(pct.index.values):
        value = float(row_totals.iat[row_index])
        rgba = cmap(norm(value))
        luminance = 0.2126 * rgba[0] + 0.7152 * rgba[1] + 0.0722 * rgba[2]
        text_color = "white" if luminance < 0.45 else "black"
        right_text = ax_right.text(
            0.5,
            float(tws),
            f"{value:.1f}",
            ha="center",
            va="center",
            fontsize=10,
            fontweight="bold",
            color=text_color,
        )
        stroke = "black" if text_color == "white" else "white"
        right_text.set_path_effects([pe.withStroke(linewidth=2.0, foreground=stroke, alpha=0.8)])

    if legend_handles:
        deduped_handles: dict[str, Line2D] = {}
        for handle in legend_handles:
            deduped_handles[handle.get_label()] = handle
        ax_legend.legend(
            list(deduped_handles.values()),
            list(deduped_handles.keys()),
            title="Sails / Reef",
            loc="upper left",
            frameon=True,
            fontsize=12,
            title_fontsize=13,
        )

    fig.colorbar(mesh, cax=ax_colorbar, label="% of total time (Visible cells)")
    fig.tight_layout()

    metrics = {
        "tws_bins": str(len(pct.index)),
        "twa_bins": str(len(pct.columns)),
        "sails": str(len(sails)),
        "lines": str(len(lines)),
    }
    return fig, metrics


def run_sail_usage_overlay(values: dict[str, Any]) -> dict[str, Any]:
    matrix_csv = _as_uploaded_file(values.get("matrix_csv"), "matrix_csv")
    sail_xml = _as_uploaded_file(values.get("sail_xml"), "sail_xml")
    threshold = _as_float(values.get("threshold"), 0.2)

    figure, metrics = create_plot(matrix_csv.data, sail_xml.data, threshold)

    return {
        "message": "Sail usage overlay generated.",
        "summary": "Rendered routing usage heatmap with sail crossover and reef line overlays.",
        "outputs": {
            "metrics": [
                {"label": "TWS bins", "value": metrics["tws_bins"]},
                {"label": "TWA bins", "value": metrics["twa_bins"]},
                {"label": "Sails", "value": metrics["sails"]},
                {"label": "Lines", "value": metrics["lines"]},
            ],
            "figures": [
                {
                    "title": "Routing Sail Usage Overlay",
                    "image_data_url": figure_to_data_url(figure),
                }
            ],
            "notes": [
                f"Cells below {threshold:.2f}% are hidden to keep the plot readable.",
            ],
        },
    }

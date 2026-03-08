from typing import Any


def run_sample_summary(values: dict[str, Any]) -> dict[str, Any]:
    expedition_name = str(values.get("expedition_name", "")).strip()
    operator = str(values.get("operator", "")).strip()
    station_count = int(values.get("station_count", 0) or 0)
    region = str(values.get("region", "")).strip()
    notes = str(values.get("notes", "")).strip()

    headline = f"{expedition_name or 'Untitled expedition'} is prepared for {station_count} stations."
    summary = {
        "headline": headline,
        "operator": operator or "Unknown operator",
        "region": region or "Unspecified region",
        "notes_preview": notes[:240],
        "recommendations": [
            "Validate uploaded output files before processing.",
            "Persist generated products in object storage for later download.",
            "Move Streamlit-only state into backend request models.",
        ],
    }

    return {
        "message": "Sample expedition summary generated.",
        "summary": headline,
        "outputs": summary,
    }


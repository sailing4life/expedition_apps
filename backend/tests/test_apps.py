from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_list_apps() -> None:
    response = client.get("/api/apps")
    assert response.status_code == 200
    payload = response.json()
    slugs = {item["slug"] for item in payload}
    assert {"model-agreement", "weather-app", "routing-figures", "sail-usage-overlay"}.issubset(slugs)


def test_get_app_detail() -> None:
    response = client.get("/api/apps/weather-app")
    assert response.status_code == 200
    payload = response.json()
    assert payload["slug"] == "weather-app"
    assert any(field["key"] == "csv_file" for field in payload["fields"])


def test_run_weather_app_with_timeseries_output() -> None:
    csv_bytes = "\n".join(
        [
            "W. Europe Daylight Time,kt,Wind10m deg,Gust deg,Gust value",
            "2026-02-01 08:00,18,120,0,24",
            "2026-02-01 10:00,20,135,0,27",
            "2026-02-01 12:00,22,150,0,29",
        ]
    ).encode("latin1")

    response = client.post(
        "/api/apps/weather-app/run",
        files={"csv_file": ("weather.csv", csv_bytes, "text/csv")},
        data={"model_name": "UM-Global"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["app_slug"] == "weather-app"
    assert payload["outputs"]["figures"]
    assert payload["outputs"]["timeseries"]["timestamps"]
    assert payload["outputs"]["timeseries"]["weather"]["speed_lines"][0]["values"][0] == 18.0


def test_run_routing_figures_with_multipart_upload() -> None:
    csv_bytes = "\n".join(
        [
            "TimeUTC,Twa,Tws,TWG,Gust,True Wind Dir,Air Temp,Mark",
            "01/02/2026 08:00,45,18,24,23,120,14.2,Start",
            "01/02/2026 10:00,60,22,28,27,150,15.0,Gate",
        ]
    ).encode("utf-8")

    response = client.post(
        "/api/apps/routing-figures/run",
        files={"csv_file": ("routing.csv", csv_bytes, "text/csv")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["app_slug"] == "routing-figures"
    assert payload["outputs"]["figures"]
    assert payload["outputs"]["timeseries"]["timestamps"]
    assert payload["outputs"]["timeseries"]["routing"]["speed_lines"][1]["label"] == "TWG"
    assert payload["outputs"]["timeseries"]["routing"]["speed_lines"][2]["values"][1] == 27.0
    assert payload["outputs"]["timeseries"]["routing"]["temperature_lines"][0]["values"][0] == 14.2
    assert payload["outputs"]["timeseries"]["routing"]["mark_lines"][1]["label"] == "Gate"


def test_run_model_agreement_requires_multiple_files() -> None:
    csv_bytes = "\n".join(
        [
            "W. Europe Daylight Time,kt,Wind10m deg",
            "01/02/2026 08:00,18,120",
            "01/02/2026 11:00,22,150",
        ]
    ).encode("utf-8")

    response = client.post(
        "/api/apps/model-agreement/run",
        files={"csv_files": ("model1.csv", csv_bytes, "text/csv")},
    )
    assert response.status_code == 400
    assert "Upload at least two" in response.json()["detail"]


def test_run_model_agreement_with_two_files() -> None:
    csv_one = "\n".join(
        [
            "W. Europe Daylight Time,kt,Wind10m deg",
            "01/02/2026 08:00,18,120",
            "01/02/2026 11:00,22,150",
            "01/02/2026 14:00,20,170",
        ]
    ).encode("utf-8")
    csv_two = "\n".join(
        [
            "W. Europe Daylight Time,kt,Wind10m deg",
            "01/02/2026 08:00,19,125",
            "01/02/2026 11:00,21,155",
            "01/02/2026 14:00,23,175",
        ]
    ).encode("utf-8")

    response = client.post(
        "/api/apps/model-agreement/run",
        files=[
            ("csv_files", ("model1.csv", csv_one, "text/csv")),
            ("csv_files", ("model2.csv", csv_two, "text/csv")),
        ],
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["app_slug"] == "model-agreement"
    assert payload["outputs"]["figures"]
    assert payload["outputs"]["tables"][0]["columns"][0] == "time"
    assert payload["outputs"]["timeseries"]["timestamps"]
    assert len(payload["outputs"]["timeseries"]["rows"]) == 3
    assert payload["outputs"]["timeseries"]["speed"]["models"][0]["values"][0] == 18.0


def test_run_sail_usage_overlay_with_csv_and_xml() -> None:
    csv_bytes = "\n".join(
        [
            "meta",
            "meta",
            "meta",
            "meta",
            "meta",
            "meta",
            "meta",
            "tws,40,80,120",
            "10,2,3,4",
            "20,1,5,6",
            "end",
        ]
    ).encode("utf-8")

    xml_bytes = """
    <root>
      <elements>
        <element name="J1">
          <colour R="255" G="120" B="80" />
          <bezierpoints>
            <point twa="35" tws="10" />
            <point twa="65" tws="18" />
            <point twa="95" tws="12" />
          </bezierpoints>
        </element>
      </elements>
      <lines>
        <line name="Reef 1">
          <colour R="0" G="80" B="220" />
          <linewidth val="2" />
          <bezierpoints>
            <point twa="45" tws="8" />
            <point twa="90" tws="22" />
          </bezierpoints>
        </line>
      </lines>
    </root>
    """.strip().encode("utf-8")

    response = client.post(
        "/api/apps/sail-usage-overlay/run",
        files=[
            ("matrix_csv", ("routing-matrix.csv", csv_bytes, "text/csv")),
            ("sail_xml", ("sail-plan.xml", xml_bytes, "application/xml")),
        ],
        data={"threshold": "0.2"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["app_slug"] == "sail-usage-overlay"
    assert payload["outputs"]["figures"]

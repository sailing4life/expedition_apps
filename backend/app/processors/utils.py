import base64
from io import BytesIO

import matplotlib
import matplotlib.pyplot as plt


matplotlib.use("Agg")


def figure_to_data_url(fig: plt.Figure) -> str:
    buffer = BytesIO()
    fig.savefig(buffer, format="png", dpi=180, bbox_inches="tight")
    plt.close(fig)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def bytes_to_base64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")

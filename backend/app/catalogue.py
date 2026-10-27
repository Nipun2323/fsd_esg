"""
The shared metric and framework catalogue.

`data_catalogue.json` is GENERATED from the frontend's TypeScript
sources (`frontend/src/data/metrics.ts` and `frameworks.ts`) by
`scripts/sync_catalogue.py`. Edit the TypeScript, then re-run that
script — do not hand-edit the JSON, or the two halves of the app will
disagree about what a metric is called.
"""

import json
from pathlib import Path

_PATH = Path(__file__).parent / "data_catalogue.json"
_DATA = json.loads(_PATH.read_text())

METRICS: list[dict] = _DATA["metrics"]
METRICS_BY_KEY: dict[str, dict] = {m["key"]: m for m in METRICS}
EMISSION_FACTORS: list[dict] = _DATA["factors"]
DEFAULT_FACTORS: dict[str, float] = {f["key"]: f["value"] for f in _DATA["factors"]}
NGRBC_PRINCIPLES: list[dict] = _DATA["principles"]
ESRS_STANDARDS: list[dict] = _DATA["esrs"]
BRSR_CORE_ATTRIBUTES: list[str] = _DATA["brsrCore"]

PILLAR_LABEL = {"E": "Environmental", "S": "Social", "G": "Governance"}


def metrics_for_pillar(pillar: str) -> list[dict]:
    return [m for m in METRICS if m["pillar"] == pillar]


def metric_label(key: str) -> str:
    if key in METRICS_BY_KEY:
        return METRICS_BY_KEY[key]["label"]
    return CALCULATED_LABELS.get(key, key)


CALCULATED_LABELS = {
    "totalCo2": "Total GHG emissions",
    "scope1": "Scope 1 emissions",
    "scope2": "Scope 2 emissions",
    "intensityPerEmployee": "Emissions intensity",
    "totalEnergy": "Total energy consumed",
    "renewableShare": "Renewable energy share",
    "waterIntensity": "Water intensity",
    "waterRecycledShare": "Water recycled",
    "wasteDivertedShare": "Waste diverted from disposal",
    "genderDiversity": "Gender diversity",
    "trainingPerEmployee": "Training per employee",
    "ltifr": "LTIFR",
    "boardIndependence": "Board independence",
    "boardDiversity": "Board gender diversity",
}

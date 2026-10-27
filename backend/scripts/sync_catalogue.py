"""
Regenerate app/data_catalogue.json from the frontend's TypeScript sources.

    python -m scripts.sync_catalogue

The metric keys, units, framework definitions and emission factors must
be identical on both sides of the app. Rather than maintain two copies,
the TypeScript is the source and this extracts it. Run it after editing
frontend/src/data/metrics.ts or frameworks.ts.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
METRICS_TS = ROOT / "frontend" / "src" / "data" / "metrics.ts"
FRAMEWORKS_TS = ROOT / "frontend" / "src" / "data" / "frameworks.ts"
OUT = Path(__file__).resolve().parents[1] / "app" / "data_catalogue.json"


def _block(src: str, marker: str) -> str:
    return src.split(marker, 1)[1].split("\n]\n", 1)[0]


def _field(obj: str, name: str) -> str | None:
    m = re.search(rf"{name}:\s*\n?\s*'((?:[^'\\]|\\.)*)'", obj, re.S)
    return m.group(1).replace("\\'", "'") if m else None


def build() -> dict:
    if not METRICS_TS.exists():
        raise SystemExit(f"Not found: {METRICS_TS}")

    msrc = METRICS_TS.read_text()
    metrics = []
    for obj in re.findall(r"\{(.*?)\n  \}", _block(msrc, "export const METRICS: MetricDefinition[] = ["), re.S):
        maps = re.search(r"mapsTo:\s*\[(.*?)\]", obj, re.S)
        metrics.append({
            "key": _field(obj, "key"),
            "label": _field(obj, "label"),
            "pillar": _field(obj, "pillar"),
            "unit": _field(obj, "unit"),
            "help": _field(obj, "help"),
            "kind": _field(obj, "kind"),
            "mapsTo": re.findall(r"'([^']+)'", maps.group(1)) if maps else [],
        })

    factors = []
    for obj in re.findall(r"\{(.*?)\n  \}", _block(msrc, "export const EMISSION_FACTORS: EmissionFactor[] = ["), re.S):
        v = re.search(r"value:\s*([\d.]+)", obj)
        factors.append({
            "key": _field(obj, "key"),
            "label": _field(obj, "label"),
            "value": float(v.group(1)) if v else None,
            "unit": _field(obj, "unit"),
            "source": _field(obj, "source"),
            "vintage": _field(obj, "vintage"),
            "caveat": _field(obj, "caveat"),
        })

    fsrc = FRAMEWORKS_TS.read_text()
    principles = []
    for obj in re.findall(r"\{(.*?)\n  \}", _block(fsrc, "export const NGRBC_PRINCIPLES: PrincipleDef[] = ["), re.S):
        principles.append({
            "code": _field(obj, "code"),
            "short": _field(obj, "short"),
            "statement": re.sub(r"\s+", " ", _field(obj, "statement") or ""),
            "pillar": _field(obj, "pillar"),
        })

    esrs = []
    for line in _block(fsrc, "export const ESRS_STANDARDS: EsrsDef[] = [").strip().splitlines():
        if "code:" not in line:
            continue
        esrs.append({
            "code": _field(line, "code"),
            "title": _field(line, "title"),
            "group": _field(line, "group"),
            "pillar": _field(line, "pillar"),
            "alwaysApplies": "alwaysApplies: true" in line,
        })

    core = re.findall(r"^\s*'([^']+)',", fsrc.split("BRSR_CORE_ATTRIBUTES = [", 1)[1].split("]", 1)[0], re.M)

    bad = [m["key"] for m in metrics if not all([m["key"], m["label"], m["pillar"], m["unit"], m["kind"]])]
    if bad or not metrics or len(esrs) != 12 or len(principles) != 9:
        raise SystemExit(
            f"Extraction looks wrong: {len(metrics)} metrics, {len(principles)} principles, "
            f"{len(esrs)} ESRS, incomplete={bad}"
        )

    return {
        "metrics": metrics,
        "factors": factors,
        "principles": principles,
        "esrs": esrs,
        "brsrCore": core,
    }


if __name__ == "__main__":
    data = build()
    OUT.write_text(json.dumps(data, indent=2) + "\n")
    print(
        f"Wrote {OUT.relative_to(ROOT)}: {len(data['metrics'])} metrics, "
        f"{len(data['factors'])} factors, {len(data['principles'])} principles, "
        f"{len(data['esrs'])} ESRS standards."
    )
    sys.exit(0)

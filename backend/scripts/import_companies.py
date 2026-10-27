"""
Load the ESG ratings dataset into the database.

Usage:
    python -m scripts.import_companies [path/to/data.csv]

Idempotent: re-running updates existing rows (matched on ticker, then
name) instead of duplicating them.

The importer auto-detects two layouts:

  "graded"  ticker,name,...,environment_score,social_score,governance_score,...
            The Kaggle public-company ESG ratings dataset.

  "risk"    domain;name;ticker;...;esg;Controversies.*;sdg.*
            The semicolon-delimited ESG risk dataset.

Neither contains activity data — no kWh, water, waste or headcount — so
nothing imported here feeds the emissions calculator. Those figures come
from a report uploaded against a company.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models import Company, CompanyRating  # noqa: E402

DEFAULT_PATH = Path(__file__).resolve().parents[1] / "data" / "companies.csv"


def _sniff(path: Path) -> tuple[str, str]:
    """Returns (layout, delimiter)."""
    header = path.open(encoding="utf-8", errors="replace").readline()
    if "environment_score" in header:
        return "graded", ","
    if header.count(";") > header.count(","):
        return "risk", ";"
    return "graded", ","


def _num(raw: str | None) -> float | None:
    if raw is None:
        return None
    raw = raw.strip()
    if raw in ("", "null", "NA", "N/A", "-"):
        return None
    try:
        return float(raw.replace(",", ""))
    except ValueError:
        return None


def _percentiles(values: list[float | None]) -> list[float | None]:
    """Rank each value within the set, 0-100. Higher score -> higher percentile."""
    present = sorted(v for v in values if v is not None)
    if not present:
        return [None] * len(values)
    out = []
    for v in values:
        if v is None:
            out.append(None)
            continue
        below = sum(1 for p in present if p < v)
        equal = sum(1 for p in present if p == v)
        out.append(round((below + equal / 2) / len(present) * 100, 1))
    return out


def _read(path: Path) -> tuple[list[dict], str]:
    layout, delim = _sniff(path)
    with path.open(newline="", encoding="utf-8", errors="replace") as fh:
        rows = list(csv.DictReader(fh, delimiter=delim))
    return rows, layout


def _company_fields(row: dict, layout: str) -> dict:
    if layout == "graded":
        return {
            "name": (row.get("name") or "").strip(),
            "ticker": (row.get("ticker") or "").strip().upper() or None,
            "industry": (row.get("industry") or "").strip() or None,
            "exchange": (row.get("exchange") or "").strip() or None,
            "currency": (row.get("currency") or "USD").strip() or "USD",
            "logo_url": (row.get("logo") or "").strip() or None,
            "web_url": (row.get("weburl") or "").strip() or None,
            "cik": (row.get("cik") or "").strip() or None,
        }
    return {
        "name": (row.get("name") or "").strip(),
        "ticker": (row.get("ticker") or "").strip().upper() or None,
        "industry": (row.get("industry") or "").strip() or None,
        "web_url": (f"https://{row['domain'].strip()}" if row.get("domain") else None),
        "employees": int(e) if (e := _num(row.get("employees"))) else None,
        "currency": "USD",
    }


def run(path: Path = DEFAULT_PATH) -> dict:
    if not path.exists():
        raise SystemExit(f"No such file: {path}")

    Base.metadata.create_all(engine)
    rows, layout = _read(path)
    rows = [r for r in rows if (r.get("name") or "").strip()]
    print(f"{path.name}: {len(rows)} rows, layout '{layout}'")

    # Percentiles need the whole set, so compute them before the row loop.
    if layout == "graded":
        cols = ("environment_score", "social_score", "governance_score", "total_score")
        pct = {c: _percentiles([_num(r.get(c)) for r in rows]) for c in cols}
    else:
        pct = {}

    created = updated = 0
    db = SessionLocal()
    try:
        for i, row in enumerate(rows):
            fields = _company_fields(row, layout)
            if not fields["name"]:
                continue

            company = None
            if fields.get("ticker"):
                company = db.scalar(select(Company).where(Company.ticker == fields["ticker"]))
            if company is None:
                company = db.scalar(select(Company).where(Company.name == fields["name"]))

            if company is None:
                company = Company(**fields)
                db.add(company)
                created += 1
            else:
                for k, v in fields.items():
                    if v is not None:
                        setattr(company, k, v)
                updated += 1
            db.flush()

            if layout != "graded":
                continue

            rating = company.rating or CompanyRating(company_id=company.id)
            for pillar in ("environment", "social", "governance", "total"):
                setattr(rating, f"{pillar}_score", _num(row.get(f"{pillar}_score")))
                setattr(rating, f"{pillar}_grade", (row.get(f"{pillar}_grade") or "").strip() or None)
                setattr(rating, f"{pillar}_level", (row.get(f"{pillar}_level") or "").strip() or None)
                setattr(rating, f"{pillar}_percentile", pct[f"{pillar}_score"][i])
            rating.last_processing_date = (row.get("last_processing_date") or "").strip() or None
            if rating.company_id is None:
                rating.company_id = company.id
            db.add(rating)

            if (i + 1) % 200 == 0:
                db.commit()
                print(f"  …{i + 1}/{len(rows)}")

        db.commit()
    finally:
        db.close()

    result = {"file": str(path), "layout": layout, "rows": len(rows),
              "created": created, "updated": updated}
    print(f"Done: {created} created, {updated} updated.")
    return result


if __name__ == "__main__":
    run(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH)

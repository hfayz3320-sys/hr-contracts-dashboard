import sqlite3
from pathlib import Path


REQUIRED = {
    "contracts": [
        "contract_number",
        "execution_date",
        "passport_number",
        "gender",
        "marital_status",
        "birth_date",
        "occupation",
        "work_location",
        "mobile",
        "email",
        "bank_name",
        "iban",
        "education_level",
        "speciality",
        "extraction_warnings_json",
    ],
    "employees": [
        "email",
        "passport_number",
    ],
    "insurance_policies": [
        "plan_class",
        "nationality",
        "member_name",
        "review_flags_json",
    ],
}


def table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {r[1] for r in rows}


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    migrations_dir = root / "worker" / "migrations"
    sql_files = sorted(migrations_dir.glob("*.sql"))
    if not sql_files:
        raise RuntimeError(f"No migrations found in {migrations_dir}")

    conn = sqlite3.connect(":memory:")
    try:
        for sql_file in sql_files:
            sql = sql_file.read_text(encoding="utf-8")
            conn.executescript(sql)

        for table, required_cols in REQUIRED.items():
            cols = table_columns(conn, table)
            missing = [c for c in required_cols if c not in cols]
            if missing:
                raise RuntimeError(f"{table} missing columns: {', '.join(missing)}")

        print(
            "[verify-local-migrations] PASS",
            {
                "migrations_applied": [f.name for f in sql_files],
                "checked_tables": list(REQUIRED.keys()),
            },
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()

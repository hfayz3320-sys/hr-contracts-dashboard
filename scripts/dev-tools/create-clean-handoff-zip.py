from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED


ROOT_EXCLUDE_DIRS = {
    "data",
    ".git",
    "node_modules",
    ".wrangler",
    ".backups",
    "backups",
    "dist",
    "coverage",
    "handoff-temp",
    "handoff-verify-temp",
}
EXCLUDE_FILE_EXT = {".pdf", ".xlsx", ".xls", ".csv"}
EXCLUDE_FILE_NAMES = {".env", ".env.production", ".env.local", ".env.development", ".env.test"}


def should_skip(path: Path, root: Path) -> bool:
    rel = path.relative_to(root)
    rel_parts = [p.lower() for p in rel.parts]
    # Exclude only root-level folders (e.g. keep src/data, exclude ./data).
    if rel_parts and rel_parts[0] in {d.lower() for d in ROOT_EXCLUDE_DIRS}:
        return True
    if path.name in EXCLUDE_FILE_NAMES:
        return True
    if path.suffix.lower() in EXCLUDE_FILE_EXT:
        return True
    return False


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    out = root / "handoff-clean.zip"
    if out.exists():
        out.unlink()

    included = 0
    with ZipFile(out, "w", ZIP_DEFLATED) as zf:
        for p in root.rglob("*"):
            if not p.is_file():
                continue
            if should_skip(p, root):
                continue
            zf.write(p, p.relative_to(root))
            included += 1

    print("[create-clean-handoff-zip] PASS", {"zip": str(out), "files_included": included})


if __name__ == "__main__":
    main()

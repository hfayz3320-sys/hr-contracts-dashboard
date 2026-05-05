# -*- coding: utf-8 -*-
"""
dry_run_import.py
Python re-implementation of employeeMasterImportService.js for dry-run verification.

Does NOT write to IndexedDB. Does NOT modify any app data.
Input:  Employee Master Excel file (reads first sheet)
Output: _contract_lab/outputs/employee_master_import_preview.xlsx
        _contract_lab/outputs/employee_master_import_preview.json
        _contract_lab/outputs/employee_master_import_report.txt

Primary key:  IdentityNumber (10 digits; starts with 1=Saudi, starts with 2=Iqama)
Secondary key: EmployeeNumber (only when IdentityNumber missing/invalid)
Name: NEVER used for auto-match
"""

import sys, json, re
from pathlib import Path
from collections import Counter, defaultdict

import openpyxl
import pandas as pd

ROOT          = Path(__file__).resolve().parents[2]
INPUT_FILE    = ROOT / "employee_master_ENfirst_filled.xlsx"   # substitute for بيانات الموظفين.xlsx
OUT_DIR       = ROOT / "_contract_lab" / "outputs"
OUT_XLSX      = OUT_DIR / "employee_master_import_preview.xlsx"
OUT_JSON      = OUT_DIR / "employee_master_import_preview.json"
OUT_REPORT    = OUT_DIR / "employee_master_import_report.txt"

# ── Arabic column aliases (mirrors schema.js schemaAliasesArabic) ─────────────
ARABIC_ALIASES = {
    'الرقم الوطني': 'IdentityNumber',
    'رقم الهوية الوطنية': 'IdentityNumber',
    'رقم الهوية': 'IdentityNumber',
    'رقم الإقامة': 'IdentityNumber',
    'رقم الاقامة': 'IdentityNumber',
    'الاسم': 'Name',
    'اسم الموظف': 'Name',
    'الاسم الكامل': 'Name',
    'رقم الموظف': 'EmployeeNumber',
    'الرقم الوظيفي': 'EmployeeNumber',
    'الجنسية': 'Nationality',
    'المسمى الوظيفي': 'Profession',
    'المهنة': 'Profession',
    'تاريخ الميلاد': 'DateOfBirth',
    'تاريخ بداية العقد': 'StartDate',
    'تاريخ المباشرة': 'StartDate',
    'تاريخ نهاية العقد': 'EndDate',
    'تاريخ انتهاء العقد': 'EndDate',
    'تاريخ الانضمام': 'JoiningDate',
    'تاريخ انتهاء الهوية': 'IDExpiryDate',
    'الراتب الأساسي': 'BasicSalary',
    'الراتب': 'BasicSalary',
    'بدل السكن': 'HousingAllowance',
    'بدل النقل': 'TransportationAllowance',
    'بدل الغذاء': 'FoodAllowance',
    'إجمالي البدلات': 'TotalCashAllowances',
    'الراتب الإجمالي': 'GrossCashMonthly',
    'نوع الهوية': 'IDType',
    'رقم الجوال': 'MobileNumber',
    'رقم الهاتف': 'MobileNumber',
    'البريد الإلكتروني': 'Email',
    'رقم الآيبان': 'IBAN',
    'الآيبان': 'IBAN',
    'اسم البنك': 'BankName',
    'الجنس': 'Gender',
    'الديانة': 'Religion',
    'الحالة الاجتماعية': 'MaritalStatus',
    'المؤهل العلمي': 'Education',
    'التخصص': 'Speciality',
}

# English aliases (simplified from schema.js schemaAliases)
EN_ALIASES_NORM = {
    re.sub(r'[^a-z0-9]', '', k.lower()): v
    for k, v in {
        'SourceFile': 'SourceFile', 'ContractNumber': 'ContractNumber',
        'Contract No': 'ContractNumber', 'Name': 'Name', 'Employee Name': 'Name',
        'Profession': 'Profession', 'Job Title': 'Profession',
        'EmployeeNumber': 'EmployeeNumber', 'Employee No': 'EmployeeNumber',
        'Nationality': 'Nationality', 'DateOfBirth': 'DateOfBirth', 'DOB': 'DateOfBirth',
        'IdentityNumber': 'IdentityNumber', 'ID Number': 'IdentityNumber',
        'IDType': 'IDType', 'IDExpiryDate': 'IDExpiryDate',
        'Gender': 'Gender', 'Religion': 'Religion', 'MaritalStatus': 'MaritalStatus',
        'Education': 'Education', 'Speciality': 'Speciality', 'Specialty': 'Speciality',
        'IBAN': 'IBAN', 'BankName': 'BankName', 'Email': 'Email',
        'MobileNumber': 'MobileNumber', 'Phone': 'MobileNumber',
        'ContractDurationYears': 'ContractDurationYears',
        'StartDate': 'StartDate', 'EndDate': 'EndDate', 'JoiningDate': 'JoiningDate',
        'BasicSalary': 'BasicSalary', 'HousingProvided': 'HousingProvided',
        'TransportProvided': 'TransportProvided', 'HousingAllowance': 'HousingAllowance',
        'TransportationAllowance': 'TransportationAllowance', 'FoodAllowance': 'FoodAllowance',
        'OTAllowance': 'OTAllowance', 'MastersDegreeAllowance': 'MastersDegreeAllowance',
        'TotalCashAllowances': 'TotalCashAllowances', 'GrossCashMonthly': 'GrossCashMonthly',
    }.items()
}


# ── helpers ───────────────────────────────────────────────────────────────────

def canonical_column(col):
    """Map raw Excel column name to internal field name."""
    raw = str(col or '').strip()
    if raw in ARABIC_ALIASES:
        return ARABIC_ALIASES[raw], 'arabic'
    norm = re.sub(r'[^a-z0-9]', '', raw.lower())
    if norm in EN_ALIASES_NORM:
        return EN_ALIASES_NORM[norm], 'english'
    return raw, 'unmapped'


def normalize_identity(value):
    """Mirrors normalizeIdentityNumber() from cleaning.js."""
    if value is None or str(value).strip() == '':
        return ''
    if isinstance(value, float):
        # Excel numeric cell — convert without scientific notation
        if not (value == value):   # NaN
            return ''
        return str(int(round(value)))
    if isinstance(value, int):
        return str(value)
    # String — strip non-digits
    return re.sub(r'[^0-9]', '', str(value).strip())


def validate_identity(value):
    """Mirrors validateIdentityNumber() from cleaning.js."""
    id_ = normalize_identity(value)
    if not id_:
        return {'valid': False, 'type': None, 'reason': 'missing'}
    if len(id_) != 10:
        return {'valid': False, 'type': None, 'reason': f'length is {len(id_)}, expected 10'}
    if id_.startswith('1'):
        return {'valid': True, 'type': 'Saudi', 'reason': None}
    if id_.startswith('2'):
        return {'valid': True, 'type': 'Iqama', 'reason': None}
    return {'valid': False, 'type': None, 'reason': f"starts with '{id_[0]}', expected 1 (Saudi) or 2 (Iqama)"}


def normalize_emp_key(value):
    return re.sub(r'\s+', '', str(value or '').strip()).lower()


# ── read Excel ────────────────────────────────────────────────────────────────

def read_excel(path):
    """
    Read first sheet, return (raw_headers, mapped_headers, rows_as_dicts).
    Uses openpyxl so we get raw cell values without scientific notation.
    """
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active

    raw_headers = []
    mapped_headers = []
    mapping_detail = []   # list of (raw_col, canonical, kind)

    rows_iter = ws.iter_rows(values_only=True)
    header_row = next(rows_iter, None)
    if header_row is None:
        wb.close()
        return [], [], [], []

    for cell_val in header_row:
        raw = str(cell_val or '').strip()
        canonical, kind = canonical_column(raw)
        raw_headers.append(raw)
        mapped_headers.append(canonical)
        mapping_detail.append((raw, canonical, kind))

    rows = []
    for row in rows_iter:
        d = {}
        for col_index, value in enumerate(row):
            if col_index >= len(mapped_headers):
                break
            d[mapped_headers[col_index]] = value
        rows.append(d)

    wb.close()
    return raw_headers, mapped_headers, mapping_detail, rows


# ── analysis ─────────────────────────────────────────────────────────────────

def analyze(rows):
    """
    Runs the same logic as buildImportPreview() in employeeMasterImportService.js.
    No existing employees — all valid new identity numbers = new employees.
    Purpose: validate the normalization, validation, and duplicate detection logic.
    """
    results = []
    id_counter = Counter()

    for i, row in enumerate(rows):
        raw_id_val = row.get('IdentityNumber', '')
        normalized_id = normalize_identity(raw_id_val)
        validation = validate_identity(raw_id_val)

        if normalized_id:
            id_counter[normalized_id] += 1

        results.append({
            'RowIndex': i + 2,
            'SourceFile': str(row.get('SourceFile') or '').strip(),
            'Name': str(row.get('Name') or '').strip(),
            'EmployeeNumber': str(row.get('EmployeeNumber') or '').strip(),
            'RawIdentityValue': raw_id_val,
            'NormalizedID': normalized_id,
            'IDValid': validation['valid'],
            'IDType': validation['type'] or '',
            'IDReason': validation['reason'] or '',
            'BasicSalary': row.get('BasicSalary') or '',
            'Nationality': str(row.get('Nationality') or '').strip(),
            'StartDate': str(row.get('StartDate') or '').strip(),
            'EndDate': str(row.get('EndDate') or '').strip(),
        })

    # Tag duplicates
    for r in results:
        nid = r['NormalizedID']
        r['IsDuplicate'] = bool(nid and id_counter[nid] > 1)
        r['DuplicateCount'] = id_counter[nid] if nid else 0

    # Import classification (no existing employees → all valid = "new")
    for r in results:
        if not r['NormalizedID']:
            r['ImportClass'] = 'MissingIdentity'
        elif not r['IDValid']:
            r['ImportClass'] = 'InvalidIdentity'
        elif r['IsDuplicate']:
            r['ImportClass'] = 'NeedsReview'
        else:
            r['ImportClass'] = 'NewEmployee'

    return results, id_counter


# ── report ────────────────────────────────────────────────────────────────────

def build_report(raw_headers, mapping_detail, results, id_counter, source_file_name):
    lines = []

    def h(title):
        lines.append(f"\n{'='*70}")
        lines.append(f"  {title}")
        lines.append(f"{'='*70}")

    def row(label, value):
        lines.append(f"  {label:<55} {value}")

    total = len(results)
    valid  = [r for r in results if r['IDValid'] and not r['IsDuplicate']]
    dup    = [r for r in results if r['IsDuplicate']]
    inv    = [r for r in results if r['NormalizedID'] and not r['IDValid']]
    mis    = [r for r in results if not r['NormalizedID']]
    saudi  = [r for r in results if r['IDType'] == 'Saudi']
    iqama  = [r for r in results if r['IDType'] == 'Iqama']
    strange= [r for r in results if r['NormalizedID'] and not r['IDValid']
              and r['IDReason'].startswith("starts with")]
    new_emp= [r for r in results if r['ImportClass'] == 'NewEmployee']
    needs_r= [r for r in results if r['ImportClass'] == 'NeedsReview']

    # Unique duplicate IDs (count each duplicated ID once)
    dup_ids = {r['NormalizedID'] for r in dup}

    h("FILE INFO")
    row("Input file:", source_file_name)
    row("NOTE: بيانات الموظفين.xlsx not found;", "using substitute below")
    row("Substitute used:", str(INPUT_FILE.name))

    h("1. TOTAL ROWS")
    row("Total data rows:", total)

    h("2. IDENTITYNUMBER STATISTICS")
    row("Valid IdentityNumber (10 digits, prefix 1 or 2):", len(valid) + len(dup))
    row("  — Saudi National ID (starts with 1):", len(saudi))
    row("  — Iqama (starts with 2):", len(iqama))
    row("  — Strange prefix (not 1 or 2):", len(strange))
    row("Missing IdentityNumber (blank):", len(mis))
    row("Invalid IdentityNumber (format error):", len(inv))
    row("Duplicate IdentityNumber (same ID in >1 row):", len(dup))
    row("  — Unique IDs that appear more than once:", len(dup_ids))

    h("3. IMPORT CLASSIFICATION (vs empty store — all valid = New)")
    row("NewEmployee:", len(new_emp))
    row("UpdatedEmployee:", 0)   # no existing store
    row("UnchangedEmployee:", 0)
    row("NeedsReview (duplicate ID in this file):", len(needs_r))
    row("InvalidIdentity:", len(inv))
    row("MissingIdentity:", len(mis))

    h("4. COLUMN DETECTION")
    lines.append(f"  {'Raw Excel Column':<40} {'Mapped Field':<30} {'Kind'}")
    lines.append(f"  {'─'*80}")
    for raw, canonical, kind in mapping_detail:
        flag = '' if kind != 'unmapped' else '  ← UNMAPPED'
        lines.append(f"  {raw:<40} {canonical:<30} {kind}{flag}")

    h("5. DUPLICATE IDENTITYNUMBER — DETAIL")
    if dup_ids:
        for did in sorted(dup_ids):
            affected = [r for r in results if r['NormalizedID'] == did]
            lines.append(f"\n  ID: {did}  ({len(affected)} rows)")
            for r in affected:
                lines.append(f"    Row {r['RowIndex']:>4}  {r['Name']:<40}  EmpNo={r['EmployeeNumber']}")
    else:
        lines.append("  None.")

    h("6. MISSING IDENTITYNUMBER — DETAIL")
    if mis:
        lines.append(f"  {'Row':<6} {'Name':<40} {'EmployeeNumber'}")
        lines.append(f"  {'─'*70}")
        for r in mis:
            lines.append(f"  {r['RowIndex']:<6} {r['Name']:<40} {r['EmployeeNumber']}")
    else:
        lines.append("  None.")

    h("7. INVALID IDENTITYNUMBER — DETAIL")
    if inv:
        lines.append(f"  {'Row':<6} {'RawValue':<20} {'NormalizedID':<15} {'Reason'}")
        lines.append(f"  {'─'*80}")
        for r in inv:
            lines.append(f"  {r['RowIndex']:<6} {str(r['RawIdentityValue']):<20} {r['NormalizedID']:<15} {r['IDReason']}")
    else:
        lines.append("  None.")

    h("8. NEEDS REVIEW — TOP 20")
    if needs_r:
        lines.append(f"  {'Row':<6} {'NormalizedID':<14} {'Count':<7} {'Reason':<35} {'Name'}")
        lines.append(f"  {'─'*90}")
        for r in needs_r[:20]:
            reason = f"Duplicate ID appears {r['DuplicateCount']}x in file"
            lines.append(f"  {r['RowIndex']:<6} {r['NormalizedID']:<14} {r['DuplicateCount']:<7} {reason:<35} {r['Name']}")
        if len(needs_r) > 20:
            lines.append(f"  ... and {len(needs_r) - 20} more")
    else:
        lines.append("  None.")

    h("9. ARABIC COLUMN MAPPING — SIMULATION")
    lines.append("  Confirms that Arabic headers from بيانات الموظفين.xlsx would be detected.")
    lines.append(f"  {'Arabic Header':<35} {'Maps To':<25} {'Status'}")
    lines.append(f"  {'─'*70}")
    test_cases = [
        ('الرقم الوطني', 'IdentityNumber'),
        ('رقم الهوية الوطنية', 'IdentityNumber'),
        ('رقم الإقامة', 'IdentityNumber'),
        ('رقم الاقامة', 'IdentityNumber'),
        ('الاسم', 'Name'),
        ('اسم الموظف', 'Name'),
        ('رقم الموظف', 'EmployeeNumber'),
        ('الجنسية', 'Nationality'),
        ('الراتب الأساسي', 'BasicSalary'),
        ('بدل السكن', 'HousingAllowance'),
        ('رقم الجوال', 'MobileNumber'),
        ('البريد الإلكتروني', 'Email'),
        ('تاريخ بداية العقد', 'StartDate'),
        ('تاريخ نهاية العقد', 'EndDate'),
    ]
    all_pass = True
    for arabic, expected in test_cases:
        mapped, kind = canonical_column(arabic)
        ok = mapped == expected
        if not ok:
            all_pass = False
        status = '✓ PASS' if ok else f'✗ FAIL → got {mapped}'
        lines.append(f"  {arabic:<35} {expected:<25} {status}")
    lines.append(f"\n  Arabic column mapping: {'ALL PASS' if all_pass else 'FAILURES DETECTED'}")

    h("10. IDENTITYNUMBER NORMALIZATION — SPOT CHECKS")
    spot_checks = [
        ('2558797532',      '2558797532',   True, 'Iqama'),
        (2558797532,        '2558797532',   True, 'Iqama'),   # numeric from Excel
        ('2558797532 ',     '2558797532',   True, 'Iqama'),   # trailing space
        ('2558-797532',     '2558797532',   True, 'Iqama'),   # dashes
        ('1125180404',      '1125180404',   True, 'Saudi'),
        (1125180404,        '1125180404',   True, 'Saudi'),
        ('',                '',             False, None),      # blank
        ('123',             '123',          False, None),      # too short
        ('9660537829054',   '9660537829054', False, None),     # 13 digits, wrong prefix
        ('25587975322558797532', '25587975322558797532', False, None),  # doubled (20 digits)
    ]
    lines.append(f"  {'Input':<28} {'Normalized':<15} {'Valid':<7} {'Type':<10} {'Status'}")
    lines.append(f"  {'─'*75}")
    spot_all_pass = True
    for raw, exp_norm, exp_valid, exp_type in spot_checks:
        got_norm = normalize_identity(raw)
        v = validate_identity(raw)
        ok = (got_norm == exp_norm) and (v['valid'] == exp_valid) and (v['type'] == exp_type)
        if not ok:
            spot_all_pass = False
        status = '✓' if ok else f'✗ norm={got_norm} valid={v["valid"]} type={v["type"]}'
        lines.append(f"  {str(raw):<28} {got_norm:<15} {str(v['valid']):<7} {str(v['type']):<10} {status}")
    lines.append(f"\n  Normalization spot checks: {'ALL PASS' if spot_all_pass else 'FAILURES DETECTED'}")

    h("SUMMARY")
    row("Total rows:", total)
    row("Valid identities:", len(saudi) + len(iqama))
    row("  Saudi (1xxxxxxxxx):", len(saudi))
    row("  Iqama (2xxxxxxxxx):", len(iqama))
    row("Invalid identities:", len(inv))
    row("Missing identities:", len(mis))
    row("Duplicate IDs (in this file):", len(dup))
    row("Would-be new employees (vs empty store):", len(new_emp))
    row("Needs review (duplicates):", len(needs_r))

    return "\n".join(lines)


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if not INPUT_FILE.exists():
        print(f"ERROR: Input file not found: {INPUT_FILE}")
        sys.exit(1)

    print(f"Reading: {INPUT_FILE}")
    raw_headers, mapped_headers, mapping_detail, rows = read_excel(INPUT_FILE)
    print(f"Rows: {len(rows)},  Columns: {len(raw_headers)}")

    results, id_counter = analyze(rows)

    # ── JSON output ──
    json_out = {
        'sourceFile': str(INPUT_FILE.name),
        'note': 'بيانات الموظفين.xlsx not found — substitute file used',
        'totalRows': len(results),
        'columnMapping': [
            {'raw': r, 'mapped': c, 'kind': k}
            for r, c, k in mapping_detail
        ],
        'rows': []
    }
    for r in results:
        json_out['rows'].append({
            'rowIndex': r['RowIndex'],
            'sourceFile': r['SourceFile'],
            'name': r['Name'],
            'employeeNumber': r['EmployeeNumber'],
            'rawIdentityValue': str(r['RawIdentityValue']),
            'normalizedID': r['NormalizedID'],
            'idValid': r['IDValid'],
            'idType': r['IDType'],
            'idReason': r['IDReason'],
            'isDuplicate': r['IsDuplicate'],
            'duplicateCount': r['DuplicateCount'],
            'importClass': r['ImportClass'],
        })
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(json_out, f, ensure_ascii=False, indent=2, default=str)
    print(f"JSON: {OUT_JSON}")

    # ── Excel output ──
    df = pd.DataFrame(results)
    df.to_excel(OUT_XLSX, index=False, engine='openpyxl')
    print(f"Excel: {OUT_XLSX}")

    # ── Report ──
    report = build_report(raw_headers, mapping_detail, results, id_counter, INPUT_FILE.name)
    OUT_REPORT.write_text(report, encoding='utf-8')
    # Print safely — Windows console may not support Arabic; write ASCII-safe summary
    try:
        print(report)
    except UnicodeEncodeError:
        safe = report.encode('ascii', 'replace').decode('ascii')
        print(safe)
    print(f"\nReport: {OUT_REPORT}")


if __name__ == '__main__':
    main()

/**
 * Column name normalization + EN/AR + Bupa synonym dictionary used by the
 * Excel parser. Field keys here mirror the canonical names accepted by the
 * Worker dry-run resolver (camelCase) so the network payload is uniform.
 *
 * Coverage targets — verified against real files used by MID:
 *
 *   • Employee XLSX (بيانات الموظفين.xlsx) — Arabic-only headers:
 *       رمز الموظف / اسم الموظف / الرقم الوطني / الجنسية / المسمى الوظيفي /
 *       الموقع / تاريخ الولادة / تاريخ التعيين
 *     (the file also has gender, age, salary, contract type, contract dates —
 *      those are intentionally NOT mapped onto the Employee schema; they are
 *      employee-level metadata that belongs on Contracts or is policy-only.)
 *
 *   • Bupa medical insurance XLSX (popa.xlsx) — Bupa export headers:
 *       BupaID / IDNo / MemberName / MemberEffectiveDate / PolicyNo /
 *       NationalityName / JobName / StaffNumber / Department /
 *       BranchDescription / CCHIPolicyStatus
 */

const NORMALIZE_RE = /[\s_\-./#()*]+/g;

export function normalizeKey(input: string): string {
  return input.trim().toLowerCase().replace(NORMALIZE_RE, '');
}

type SynonymMap = Record<string, readonly string[]>;

/**
 * Each canonical field maps to a list of NORMALIZED synonyms. We compare
 * after running both the column header and the synonym through `normalizeKey`.
 */
const EMPLOYEE_SYNONYMS: SynonymMap = {
  identityNumber: [
    // English / Latin
    'iqama', 'iqamanumber', 'iqamano', 'idnumber', 'id', 'idno',
    'nationalid', 'nationalidnumber', 'nationalno', 'nationalnumber',
    'identitynumber', 'residencenumber', 'residencyid',
    // Arabic
    'هوية', 'الهوية', 'رقمالهوية',
    'الإقامة', 'رقمالإقامة', 'هويةالإقامة',
    'الرقمالوطني', 'الرقمالوطنى', 'رقمالهويةالوطنية',
    'الهويةالوطنية', 'رقمالهويةالوطنى',
  ],
  employeeNumber: [
    'employeenumber', 'employeeno', 'empno', 'empid', 'staffid', 'staffno',
    'staffnumber', 'badge', 'employeecode', 'empcode',
    'الرقمالوظيفي', 'رقمالموظف', 'الرقمالوظيفى',
    'رمزالموظف', 'الرمزالوظيفي',
  ],
  fullName: [
    'fullname', 'name', 'employeename', 'staffname', 'membername',
    'الاسم', 'اسمالموظف', 'الاسمالكامل', 'اسمالعضو',
  ],
  fullNameArabic: [
    'fullnamearabic', 'arabicname', 'nameinarabic',
    'الاسمعربى', 'الاسمعربي', 'الاسمبالعربية',
  ],
  nationality: [
    'nationality', 'nationalityname',
    'الجنسية',
  ],
  department: [
    'department', 'project', 'site', 'location', 'branch',
    'branchname', 'branchdescription',
    'القسم', 'المشروع', 'الموقع', 'الفرع',
  ],
  jobTitle: [
    'jobtitle', 'profession', 'title', 'designation', 'role',
    'jobname', 'occupation', 'position',
    'المسمىالوظيفى', 'المسمىالوظيفي', 'المهنة', 'الوظيفة',
  ],
  mobile: [
    'mobile', 'phone', 'phonenumber', 'cell', 'mobilenumber', 'cellphone',
    'الجوال', 'رقمالجوال', 'الهاتف', 'رقمالهاتف',
  ],
  email: [
    'email', 'emailaddress', 'mail',
    'البريدالإلكتروني', 'البريدالالكتروني',
  ],
  hireDate: [
    'hiredate', 'joiningdate', 'startdate', 'datehired', 'doh', 'doj',
    'تاريخالتعيين', 'تاريخالالتحاق', 'تاريخالمباشرة', 'تاريخبدءالعمل',
  ],
  dateOfBirth: [
    'dateofbirth', 'dob', 'birthdate', 'birthdt',
    'تاريخالميلاد', 'تاريخالولادة', 'الميلاد',
  ],
  status: [
    'status', 'state', 'employeestatus',
    'الحالة', 'الحالةالوظيفية',
  ],
};

const INSURANCE_SYNONYMS: SynonymMap = {
  // Identity carries Bupa-specific names too.
  identityNumber: [
    ...EMPLOYEE_SYNONYMS.identityNumber!,
  ],
  employeeNumber: [
    ...EMPLOYEE_SYNONYMS.employeeNumber!,
  ],
  fullName: [
    ...EMPLOYEE_SYNONYMS.fullName!,
  ],
  /**
   * The policy number identifies a contract between the company and the
   * insurer. Group policies share one policy_number across many members; the
   * member is disambiguated by `memberNumber` (see below).
   */
  policyNumber: [
    'policynumber', 'policyno', 'policy', 'contractno', 'contractnumber',
    'رقمالبوليصة', 'رقمالوثيقة', 'رقمالعقد',
  ],
  /**
   * Member/card number — group medical insurance shares one policy_number
   * across many employees; this disambiguates them.
   *
   * Bupa export uses BupaID as the per-member unique identifier, with
   * MainMembershipNo pointing at the primary policy holder for dependents.
   * We prefer BupaID because it is unique per individual.
   */
  memberNumber: [
    'membernumber', 'memberno', 'cardnumber', 'cardno', 'memberid',
    'bupaid', 'tawuniyaid', 'gulfid', 'medgulfid', 'medicalid',
    'mainmembershipno', 'mainmembershipnumber',
    'رقمالعضوية', 'رقمالبطاقة', 'الرقمالطبي',
  ],
  provider: [
    'provider', 'insurer', 'insurancecompany', 'insurance', 'company',
    'شركةالتأمين', 'مزودالخدمة', 'الشركة',
  ],
  startDate: [
    'startdate', 'effectivedate', 'membereffectivedate', 'policyeffectivedate',
    'from', 'fromdate',
    'تاريخالبداية', 'منتاريخ', 'تاريخالسريان',
  ],
  endDate: [
    'enddate', 'expirydate', 'expirationdate', 'to', 'todate', 'expiry',
    'تاريخالنهاية', 'إلىتاريخ', 'تاريخالانتهاء',
  ],
  status: [
    ...EMPLOYEE_SYNONYMS.status!,
    'cchipolicystatus', 'memberccistatus', 'memberstatus',
    'policystatus',
  ],
  nationality: [
    ...EMPLOYEE_SYNONYMS.nationality!,
  ],
  department: [
    ...EMPLOYEE_SYNONYMS.department!,
  ],
  // Bupa exports include JobName per member; we map it so the worker
  // resolver can stamp jobTitle on the matched employee if the employees
  // table lacks one.
  jobTitle: [
    ...EMPLOYEE_SYNONYMS.jobTitle!,
  ],
};

function buildIndex(map: SynonymMap): Map<string, string> {
  const idx = new Map<string, string>();
  for (const [canonical, synonyms] of Object.entries(map)) {
    idx.set(normalizeKey(canonical), canonical);
    for (const s of synonyms) idx.set(normalizeKey(s), canonical);
  }
  return idx;
}

const EMP_IDX = buildIndex(EMPLOYEE_SYNONYMS);
const INS_IDX = buildIndex(INSURANCE_SYNONYMS);

export type Domain = 'employees' | 'insurance';

/**
 * Translate a sheet's raw row (header → cell value) into a row keyed by
 * canonical field names. Unknown columns are dropped silently. Empty/null
 * cells are skipped.
 */
export function mapRow(domain: Domain, raw: Record<string, unknown>): Record<string, unknown> {
  const idx = domain === 'employees' ? EMP_IDX : INS_IDX;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v == null || v === '') continue;
    const canonical = idx.get(normalizeKey(k));
    if (!canonical) continue;
    out[canonical] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

export function pickHeaderCanonicals(domain: Domain, headers: string[]): Record<string, string> {
  const idx = domain === 'employees' ? EMP_IDX : INS_IDX;
  const out: Record<string, string> = {};
  for (const h of headers) {
    const canonical = idx.get(normalizeKey(h));
    if (canonical) out[h] = canonical;
  }
  return out;
}

/**
 * Score a header set against a domain. Returns the number of canonical
 * fields successfully matched. Used by the sheet classifier to pick the
 * better-matching domain when the sheet name gives no hint.
 */
export function scoreDomain(domain: Domain, headers: string[]): number {
  const canonicals = pickHeaderCanonicals(domain, headers);
  return new Set(Object.values(canonicals)).size;
}

/**
 * Heuristic: does this header set look like a Bupa/CCHI medical-insurance
 * export? Triggers when at least one Bupa-specific column is present.
 */
export function looksLikeBupaInsurance(headers: string[]): boolean {
  const norm = new Set(headers.map(normalizeKey));
  return (
    norm.has('bupaid') ||
    norm.has('cchipolicystatus') ||
    norm.has('memberccistatus') ||
    norm.has('membereffectivedate') ||
    // Heuristic combo: IDNo + PolicyNo + MemberName is a strong fingerprint.
    (norm.has('idno') && norm.has('policyno') && norm.has('membername'))
  );
}

export const expectedSchema = [
  'SourceFile',
  'ContractNumber',
  'Name',
  'Profession',
  'EmployeeNumber',
  'Nationality',
  'DateOfBirth',
  'IdentityNumber',
  'IDType',
  'IDExpiryDate',
  'Gender',
  'Religion',
  'MaritalStatus',
  'Education',
  'Speciality',
  'IBAN',
  'BankName',
  'Email',
  'MobileNumber',
  'ContractDurationYears',
  'StartDate',
  'EndDate',
  'JoiningDate',
  'BasicSalary',
  'HousingProvided',
  'TransportProvided',
  'HousingAllowance',
  'TransportationAllowance',
  'FoodAllowance',
  'OTAllowance',
  'MastersDegreeAllowance',
  'TotalCashAllowances',
  'GrossCashMonthly'
];

export const schemaAliases = {
  sourcefile: 'SourceFile',
  contractnumber: 'ContractNumber',
  contract_no: 'ContractNumber',
  contractno: 'ContractNumber',
  name: 'Name',
  employeename: 'Name',
  profession: 'Profession',
  jobtitle: 'Profession',
  employeenumber: 'EmployeeNumber',
  employeeno: 'EmployeeNumber',
  nationality: 'Nationality',
  dateofbirth: 'DateOfBirth',
  dob: 'DateOfBirth',
  identitynumber: 'IdentityNumber',
  idnumber: 'IdentityNumber',
  idtype: 'IDType',
  idexpirydate: 'IDExpiryDate',
  gender: 'Gender',
  religion: 'Religion',
  maritalstatus: 'MaritalStatus',
  education: 'Education',
  speciality: 'Speciality',
  specialty: 'Speciality',
  iban: 'IBAN',
  bankname: 'BankName',
  email: 'Email',
  mobilenumber: 'MobileNumber',
  phone: 'MobileNumber',
  contractdurationyears: 'ContractDurationYears',
  startdate: 'StartDate',
  enddate: 'EndDate',
  joiningdate: 'JoiningDate',
  basicsalary: 'BasicSalary',
  housingprovided: 'HousingProvided',
  transportprovided: 'TransportProvided',
  housingallowance: 'HousingAllowance',
  transportationallowance: 'TransportationAllowance',
  foodallowance: 'FoodAllowance',
  otallowance: 'OTAllowance',
  mastersdegreeallowance: 'MastersDegreeAllowance',
  totalcashallowances: 'TotalCashAllowances',
  grosscashmonthly: 'GrossCashMonthly'
};

// Arabic column name aliases — keyed by the exact trimmed Arabic header string.
// Used by canonicalColumnName() in cleaning.js before the ASCII normalizer path,
// because the ASCII normalizer strips all Arabic Unicode characters to "".
export const schemaAliasesArabic = {
  // IdentityNumber variants
  'الرقم الوطني': 'IdentityNumber',
  'رقم الهوية الوطنية': 'IdentityNumber',
  'رقم الهوية': 'IdentityNumber',
  'رقم الإقامة': 'IdentityNumber',
  'رقم الاقامة': 'IdentityNumber',
  // Name variants
  'الاسم': 'Name',
  'اسم الموظف': 'Name',
  'الاسم الكامل': 'Name',
  // EmployeeNumber
  'رقم الموظف': 'EmployeeNumber',
  'الرقم الوظيفي': 'EmployeeNumber',
  'رمز الموظف': 'EmployeeNumber',      // "رمز" = code — used in Qiwa/SAP exports
  // Nationality
  'الجنسية': 'Nationality',
  // Profession / job
  'المسمى الوظيفي': 'Profession',
  'المهنة': 'Profession',
  // Dates
  'تاريخ الميلاد': 'DateOfBirth',
  'تاريخ الولادة': 'DateOfBirth',      // Qiwa/HR export variant of تاريخ الميلاد
  'تاريخ بداية العقد': 'StartDate',
  'تاريخ بدء العقد': 'StartDate',      // Qiwa/HR export variant
  'تاريخ المباشرة': 'StartDate',
  'تاريخ نهاية العقد': 'EndDate',
  'تاريخ انتهاء العقد': 'EndDate',
  'تاريخ الانضمام': 'JoiningDate',
  'تاريخ التعيين': 'JoiningDate',      // appointment date = joining date
  'تاريخ انتهاء الهوية': 'IDExpiryDate',
  // Salary
  'الراتب الأساسي': 'BasicSalary',
  'الراتب': 'BasicSalary',
  'بدل السكن': 'HousingAllowance',
  'بدل النقل': 'TransportationAllowance',
  'بدل الغذاء': 'FoodAllowance',
  'إجمالي البدلات': 'TotalCashAllowances',
  'الراتب الإجمالي': 'GrossCashMonthly',
  'إجمالي الراتب': 'GrossCashMonthly',   // Qiwa/HR export variant
  // ID fields
  'نوع الهوية': 'IDType',
  // Contact
  'رقم الجوال': 'MobileNumber',
  'رقم الهاتف': 'MobileNumber',
  'البريد الإلكتروني': 'Email',
  // Banking
  'رقم الآيبان': 'IBAN',
  'الآيبان': 'IBAN',
  'اسم البنك': 'BankName',
  // Other personal
  'الجنس': 'Gender',
  'الديانة': 'Religion',
  'الحالة الاجتماعية': 'MaritalStatus',
  'المؤهل العلمي': 'Education',
  'التخصص': 'Speciality',
  'العمر': 'Age',                        // age — derived field, stored as-is from HR export
  // HR-export-specific fields (real-file columns with no prior internal equivalent)
  'الموقع': 'Location',
  'مدة الخدمة': 'ServiceDuration',
  'التأمين الصحي': 'HealthInsuranceStatus',
  'نوع العقد': 'ContractType',
};

export const nationalityNormalization = {
  pakistan: 'Pakistani',
  pakistani: 'Pakistani',
  egypt: 'Egyptian',
  egyptian: 'Egyptian',
  saudi: 'Saudi',
  saudiarabia: 'Saudi',
  jordan: 'Jordanian',
  jordanian: 'Jordanian',
  india: 'Indian',
  indian: 'Indian',
  bangladesh: 'Bengali',
  bengali: 'Bengali'
};

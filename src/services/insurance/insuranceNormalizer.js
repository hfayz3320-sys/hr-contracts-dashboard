import { parseDateToISO } from '../../utils/cleaning';

function normalizeKey(key) {
  return String(key || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

const sourceColumnMap = {
  bupaid: 'BupaID',
  idno: 'IDNo',
  title: 'Title',
  membername: 'MemberName',
  membereffectivedate: 'MemberEffectiveDate',
  contractno: 'ContractNo',
  policyno: 'PolicyNo',
  customername: 'CustomerName',
  birthdate: 'BirthDate',
  gender: 'Gender',
  relationship: 'Relationship',
  relationshipcode: 'RelationshipCode',
  mainmembershipno: 'MainMembershipNo',
  maritalstatus: 'MaritalStatus',
  jobname: 'JobName',
  jobcode: 'JobCode',
  idtype: 'IDType',
  idexpirydate: 'IDExpiryDate',
  districtname: 'DistrictName',
  districtcode: 'DistrictCode',
  sponsorid: 'SponsorID',
  mainmemberid: 'MainMemberID',
  nationalityname: 'NationalityName',
  nationalitycode: 'NationalityCode',
  classdescription: 'ClassDescription',
  staffnumber: 'StaffNumber',
  department: 'Department',
  branchdescription: 'BranchDescription',
  cchipolicystatus: 'CCHIPolicyStatus',
  policyuploaddate: 'PolicyUploadDate',
  membercchistatus: 'MemberCCHIStatus',
  membercchiuploaddate: 'MemberCCHIUploadDate',
  memberrejectreason: 'MemberRejectReason',
};

function mapRow(row) {
  const mapped = {};
  Object.keys(row || {}).forEach((key) => {
    const canonical = sourceColumnMap[normalizeKey(key)];
    if (canonical) {
      mapped[canonical] = row[key];
    }
  });
  return mapped;
}

function normalizeString(value) {
  return String(value || '').trim();
}

export function normalizeInsuranceRows(rawRows) {
  return (rawRows || []).map((rawRow) => {
    const mapped = mapRow(rawRow);
    const relationship = normalizeString(mapped.Relationship);
    const isDependent = relationship && relationship.toLowerCase() !== 'employee';

    return {
      BupaID: normalizeString(mapped.BupaID),
      IDNo: normalizeString(mapped.IDNo),
      Title: normalizeString(mapped.Title),
      MemberName: normalizeString(mapped.MemberName),
      MemberEffectiveDate: parseDateToISO(mapped.MemberEffectiveDate),
      ContractNo: normalizeString(mapped.ContractNo),
      PolicyNo: normalizeString(mapped.PolicyNo),
      CustomerName: normalizeString(mapped.CustomerName),
      BirthDate: parseDateToISO(mapped.BirthDate),
      Gender: normalizeString(mapped.Gender),
      Relationship: relationship,
      RelationshipCode: normalizeString(mapped.RelationshipCode),
      MainMembershipNo: normalizeString(mapped.MainMembershipNo),
      MaritalStatus: normalizeString(mapped.MaritalStatus),
      JobName: normalizeString(mapped.JobName),
      JobCode: normalizeString(mapped.JobCode),
      IDType: normalizeString(mapped.IDType),
      IDExpiryDate: parseDateToISO(mapped.IDExpiryDate),
      DistrictName: normalizeString(mapped.DistrictName),
      DistrictCode: normalizeString(mapped.DistrictCode),
      SponsorID: normalizeString(mapped.SponsorID),
      MainMemberID: normalizeString(mapped.MainMemberID),
      NationalityName: normalizeString(mapped.NationalityName),
      NationalityCode: normalizeString(mapped.NationalityCode),
      ClassDescription: normalizeString(mapped.ClassDescription),
      StaffNumber: normalizeString(mapped.StaffNumber),
      Department: normalizeString(mapped.Department),
      BranchDescription: normalizeString(mapped.BranchDescription),
      CCHIPolicyStatus: normalizeString(mapped.CCHIPolicyStatus),
      PolicyUploadDate: parseDateToISO(mapped.PolicyUploadDate),
      MemberCCHIStatus: normalizeString(mapped.MemberCCHIStatus),
      MemberCCHIUploadDate: parseDateToISO(mapped.MemberCCHIUploadDate),
      MemberRejectReason: normalizeString(mapped.MemberRejectReason),
      memberType: isDependent ? 'Dependent' : 'Main Member',
    };
  });
}

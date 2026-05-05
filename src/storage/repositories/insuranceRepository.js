import { bulkPutRecords, putRecord, getAllFromStore } from '../indexedDb/coreDb';
import { MATCH_STATUSES, STORE_NAMES } from '../indexedDb/dbSchema';

export function createInsuranceRecord(record, overrides = {}) {
  const now = new Date().toISOString();

  return {
    id: overrides.id || record.id || crypto.randomUUID(),
    BupaID: record.BupaID || '',
    IDNo: String(record.IDNo || ''),
    Title: record.Title || '',
    MemberName: record.MemberName || '',
    MemberEffectiveDate: record.MemberEffectiveDate || '',
    ContractNo: String(record.ContractNo || ''),
    PolicyNo: String(record.PolicyNo || ''),
    CustomerName: record.CustomerName || '',
    BirthDate: record.BirthDate || '',
    Gender: record.Gender || '',
    Relationship: record.Relationship || '',
    RelationshipCode: record.RelationshipCode || '',
    MainMembershipNo: String(record.MainMembershipNo || ''),
    MaritalStatus: record.MaritalStatus || '',
    JobName: record.JobName || '',
    JobCode: String(record.JobCode || ''),
    IDType: String(record.IDType || ''),
    IDExpiryDate: record.IDExpiryDate || '',
    DistrictName: record.DistrictName || '',
    DistrictCode: String(record.DistrictCode || ''),
    SponsorID: String(record.SponsorID || ''),
    MainMemberID: String(record.MainMemberID || ''),
    NationalityName: record.NationalityName || '',
    NationalityCode: String(record.NationalityCode || ''),
    ClassDescription: record.ClassDescription || '',
    StaffNumber: String(record.StaffNumber || ''),
    Department: record.Department || '',
    BranchDescription: record.BranchDescription || '',
    CCHIPolicyStatus: record.CCHIPolicyStatus || '',
    PolicyUploadDate: record.PolicyUploadDate || '',
    MemberCCHIStatus: record.MemberCCHIStatus || '',
    MemberCCHIUploadDate: record.MemberCCHIUploadDate || '',
    MemberRejectReason: record.MemberRejectReason || '',
    memberType: record.memberType || '',
    matchStatus: overrides.matchStatus || record.matchStatus || MATCH_STATUSES.UNMATCHED,
    matchedEmployeeId: overrides.matchedEmployeeId || record.matchedEmployeeId || null,
    matchedEmployeeNumber:
      overrides.matchedEmployeeNumber || record.matchedEmployeeNumber || '',
    matchReason: overrides.matchReason || record.matchReason || '',
    needsReviewReason: overrides.needsReviewReason || record.needsReviewReason || '',
    reviewedAt: overrides.reviewedAt || record.reviewedAt || null,
    confirmedAt: overrides.confirmedAt || record.confirmedAt || null,
    createdAt: overrides.createdAt || record.createdAt || now,
    updatedAt: now,
  };
}

export const insuranceRepository = {
  async listAll() {
    return getAllFromStore(STORE_NAMES.INSURANCE);
  },

  async save(record) {
    const nextRecord = createInsuranceRecord(record);
    await putRecord(STORE_NAMES.INSURANCE, nextRecord);
    return nextRecord;
  },

  async bulkSave(records) {
    const nextRecords = (records || []).map((record) => createInsuranceRecord(record));
    await bulkPutRecords(STORE_NAMES.INSURANCE, nextRecords);
    return nextRecords;
  },
};

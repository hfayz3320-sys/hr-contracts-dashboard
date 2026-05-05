import {
  bulkPutRecords,
  deleteRecord,
  getAllFromStore,
  getByKey,
  putRecord,
} from '../indexedDb/coreDb';
import { STORE_NAMES } from '../indexedDb/dbSchema';

const SNAPSHOT_FIELDS = [
  'employeeNumber', 'sourceFile', 'importJobId', 'importDate',
  'location', 'profession', 'grossSalary', 'healthInsuranceStatus',
  'contractType', 'startDate', 'endDate', 'joiningDate', 'dateOfBirth',
];

export function createSnapshotRecord(snapshot, overrides = {}) {
  const now = new Date().toISOString();
  const record = { identityNumber: snapshot.identityNumber };
  SNAPSHOT_FIELDS.forEach((f) => {
    record[f] = snapshot[f] ?? null;
  });
  record.createdAt = overrides.createdAt || snapshot.createdAt || now;
  record.updatedAt = now;
  return record;
}

export const employeeMasterSnapshotRepository = {
  async listAll() {
    return (await getAllFromStore(STORE_NAMES.EMPLOYEE_MASTER_SNAPSHOTS)) || [];
  },

  async getByIdentityNumber(identityNumber) {
    if (!identityNumber) return null;
    return (await getByKey(STORE_NAMES.EMPLOYEE_MASTER_SNAPSHOTS, identityNumber)) || null;
  },

  async upsert(snapshot) {
    const record = createSnapshotRecord(snapshot, { createdAt: snapshot.createdAt });
    await putRecord(STORE_NAMES.EMPLOYEE_MASTER_SNAPSHOTS, record);
    return record;
  },

  async bulkUpsert(snapshots) {
    const records = (snapshots || []).map((s) =>
      createSnapshotRecord(s, { createdAt: s.createdAt })
    );
    await bulkPutRecords(STORE_NAMES.EMPLOYEE_MASTER_SNAPSHOTS, records);
    return records;
  },

  async deleteByIdentityNumber(identityNumber) {
    await deleteRecord(STORE_NAMES.EMPLOYEE_MASTER_SNAPSHOTS, identityNumber);
  },
};

import { FileText, HeartPulse, History, FileSearch, ScrollText, User } from 'lucide-react';
import { DetailDrawer } from '@/components/common/DetailDrawer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/common/StatusBadge';
import { AuditTimeline } from '@/components/common/AuditTimeline';
import { Separator } from '@/components/ui/separator';
import { useDataset } from '@/app/dataset-context';
import { formatDate } from '@/lib/dates';
import type { Employee } from '@/types/domain';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-sm">{children ?? '—'}</div>
    </div>
  );
}

export function EmployeeDrawer({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
}) {
  const { contracts, insurance, auditEvents, sourceFiles } = useDataset();

  if (!employee) {
    return (
      <DetailDrawer open={open} onOpenChange={onOpenChange} title="Employee">
        <p className="text-sm text-muted-foreground">No employee selected.</p>
      </DetailDrawer>
    );
  }

  const empContracts = contracts.filter((c) => c.employeeId === employee.id);
  const empInsurance = insurance.filter((i) => i.employeeId === employee.id);
  const empAudit = auditEvents.filter((e) => e.target === employee.id).slice(0, 8);
  const empFiles = sourceFiles.filter((f) => employee.sourceFiles.includes(f.hash));
  const currentNumber = employee.employeeNumberHistory.find((h) => h.to === null)?.number;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={
        <div className="flex items-center gap-3">
          <span>{employee.fullName}</span>
          <StatusBadge
            status={employee.status === 'active' ? 'active' : 'missing'}
            label={employee.status === 'active' ? 'Active' : 'Inactive'}
          />
        </div>
      }
      description={
        <span className="font-mono tabular text-xs">
          Iqama {employee.identityNumber} · Employee # {currentNumber ?? '—'}
        </span>
      }
    >
      <Tabs defaultValue="overview">
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="overview"><User className="h-3.5 w-3.5 mr-1.5" />Overview</TabsTrigger>
          <TabsTrigger value="contracts"><FileText className="h-3.5 w-3.5 mr-1.5" />Contracts</TabsTrigger>
          <TabsTrigger value="insurance"><HeartPulse className="h-3.5 w-3.5 mr-1.5" />Insurance</TabsTrigger>
          <TabsTrigger value="numbers"><History className="h-3.5 w-3.5 mr-1.5" />Numbers</TabsTrigger>
          <TabsTrigger value="files"><FileSearch className="h-3.5 w-3.5 mr-1.5" />Files</TabsTrigger>
          <TabsTrigger value="audit"><ScrollText className="h-3.5 w-3.5 mr-1.5" />Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Department">{employee.department}</Field>
            <Field label="Job Title">{employee.jobTitle}</Field>
            <Field label="Nationality">{employee.nationality}</Field>
            <Field label="Date of Birth">{formatDate(employee.dateOfBirth)}</Field>
            <Field label="Hire Date">{formatDate(employee.hireDate)}</Field>
            <Field label="Updated">{formatDate(employee.updatedAt)}</Field>
          </div>
        </TabsContent>

        <TabsContent value="contracts" className="mt-5">
          {empContracts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contracts on file.</p>
          ) : (
            <ul className="space-y-2">
              {empContracts.map((c) => (
                <li key={c.id} className="flex items-center justify-between border rounded-md px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{c.contractType} · v{c.version}</div>
                    <div className="text-xs text-muted-foreground tabular">
                      {formatDate(c.startDate)} — {formatDate(c.endDate)}
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="insurance" className="mt-5">
          {empInsurance.length === 0 ? (
            <p className="text-sm text-muted-foreground">No insurance records.</p>
          ) : (
            <ul className="space-y-2">
              {empInsurance.map((i) => (
                <li key={i.id} className="flex items-center justify-between border rounded-md px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{i.provider}</div>
                    <div className="text-xs text-muted-foreground tabular">
                      {i.policyNumber} · {formatDate(i.startDate)} — {formatDate(i.endDate)}
                    </div>
                  </div>
                  <StatusBadge status={i.status} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="numbers" className="mt-5">
          <ul className="space-y-2">
            {employee.employeeNumberHistory.map((h, idx) => (
              <li key={idx} className="flex items-center justify-between border rounded-md px-3 py-2.5">
                <div>
                  <div className="text-sm font-mono tabular">{h.number}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(h.from)} — {h.to ? formatDate(h.to) : 'present'}
                  </div>
                </div>
                {h.to === null && <StatusBadge status="active" label="Current" />}
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="files" className="mt-5">
          {empFiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No source files linked.</p>
          ) : (
            <ul className="space-y-2">
              {empFiles.map((f) => (
                <li key={f.hash} className="border rounded-md px-3 py-2.5">
                  <div className="text-sm font-medium">{f.filename}</div>
                  <div className="text-xs text-muted-foreground font-mono">{f.hash}</div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="audit" className="mt-5">
          {empAudit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit events for this employee.</p>
          ) : (
            <AuditTimeline events={empAudit} />
          )}
        </TabsContent>
      </Tabs>

      <Separator className="my-6" />
      <div className="text-xs text-muted-foreground">
        Created {formatDate(employee.createdAt)} · Updated {formatDate(employee.updatedAt)}
      </div>
    </DetailDrawer>
  );
}

/**
 * Search-as-you-type employee picker.
 *
 * Used inside the Review Queue resolver to replace the rough "type the
 * raw linkedTargetId" UX. Searches by full name, employee number, and
 * Iqama (auto-redacted in the result list unless admin).
 *
 * Self-contained: pulls employees from the existing dataset context, so
 * no extra API calls. Returns the selected `employee.id` to the parent.
 */
import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDataset } from '@/app/dataset-context';
import { cn } from '@/lib/utils';
import type { Employee } from '@/types/domain';

interface EmployeeSearchPickerProps {
  value: string;
  onChange: (id: string, employee: Employee | null) => void;
  label?: string;
  placeholder?: string;
  redactIdentity?: boolean;
}

function redactIqama(s: string): string {
  if (s.length < 6) return s;
  return s.slice(0, 2) + 'x'.repeat(s.length - 4) + s.slice(-2);
}

export function EmployeeSearchPicker({
  value,
  onChange,
  label = 'Link to employee',
  placeholder = 'Search name, employee number, or Iqama…',
  redactIdentity = true,
}: EmployeeSearchPickerProps) {
  const { employees } = useDataset();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Selected employee (if value matches one).
  const selected = useMemo(
    () => employees.find((e) => e.id === value) ?? null,
    [employees, value],
  );

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return employees
      .filter((e) => {
        if (e.fullName.toLowerCase().includes(q)) return true;
        if (e.identityNumber.includes(q)) return true;
        return e.employeeNumberHistory.some((h) => h.number.toLowerCase().includes(q));
      })
      .slice(0, 8);
  }, [employees, query]);

  useEffect(() => {
    function onClickOutside(ev: MouseEvent) {
      if (!containerRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <Label className="text-xs">{label}</Label>
      {selected ? (
        <div className="flex items-center justify-between rounded-md border bg-status-active-soft px-3 py-2 text-sm">
          <div>
            <div className="font-medium">{selected.fullName}</div>
            <div className="text-xs text-muted-foreground tabular">
              {redactIdentity ? redactIqama(selected.identityNumber) : selected.identityNumber}
              {selected.employeeNumberHistory.find((h) => h.to == null)?.number
                ? ` · #${selected.employeeNumberHistory.find((h) => h.to == null)?.number}`
                : ''}
            </div>
          </div>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { onChange('', null); setQuery(''); }}
          >
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="pl-8"
          />
          {open && query.trim() && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-64 overflow-y-auto">
              {matches.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No matches — try a different search term.
                </div>
              ) : (
                matches.map((e) => {
                  const currentNumber = e.employeeNumberHistory.find((h) => h.to == null)?.number;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => {
                        onChange(e.id, e);
                        setQuery('');
                        setOpen(false);
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 hover:bg-muted/60 border-b last:border-0',
                        e.id === value && 'bg-status-active-soft',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">{e.fullName}</div>
                        {e.id === value && <Check className="h-3.5 w-3.5 text-status-active" />}
                      </div>
                      <div className="text-xs text-muted-foreground tabular">
                        {redactIdentity ? redactIqama(e.identityNumber) : e.identityNumber}
                        {currentNumber ? ` · #${currentNumber}` : ''}
                        {e.department ? ` · ${e.department}` : ''}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

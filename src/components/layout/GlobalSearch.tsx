import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useDataset } from '@/app/dataset-context';
import { routes } from '@/lib/routes';

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const data = useDataset();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-9 w-full max-w-md justify-between text-muted-foreground font-normal"
      >
        <span className="flex items-center gap-2">
          <Search className="h-4 w-4" />
          <span>Search employees, contracts, insurance…</span>
        </span>
        <kbd className="hidden md:inline-flex pointer-events-none h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigate">
            <CommandItem onSelect={() => go(routes.dashboard)}>Dashboard</CommandItem>
            <CommandItem onSelect={() => go(routes.employees)}>Employees</CommandItem>
            <CommandItem onSelect={() => go(routes.contracts)}>Contracts</CommandItem>
            <CommandItem onSelect={() => go(routes.insurance)}>Medical Insurance</CommandItem>
            <CommandItem onSelect={() => go(routes.imports)}>Import Center</CommandItem>
            <CommandItem onSelect={() => go(routes.review)}>Review Queue</CommandItem>
            <CommandItem onSelect={() => go(routes.admin)}>Admin · Audit</CommandItem>
          </CommandGroup>
          {data.employees.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Employees">
                {data.employees.slice(0, 6).map((e) => (
                  <CommandItem
                    key={e.id}
                    value={`${e.fullName} ${e.identityNumber}`}
                    onSelect={() => go(`${routes.employees}?drawer=emp&id=${e.id}`)}
                  >
                    <span>{e.fullName}</span>
                    <span className="ml-auto text-xs text-muted-foreground tabular">
                      {e.identityNumber}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}

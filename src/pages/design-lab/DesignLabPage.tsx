/**
 * Design lab — temporary exploration page, NOT production UI.
 *
 * Reachable only by typing /design-lab. Not in the sidebar. Three concept
 * variants (A · Command Center, B · Employee Life Record, C · ERP Grid)
 * with five mock screens each. All data is local mock; no API calls,
 * no production page is modified, no schema or backend change.
 *
 * Will be deleted once a concept is approved.
 */
import { useSearchParams, Link } from 'react-router-dom';
import { Beaker, ArrowLeft, KeyboardIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConceptA } from './concept-a';
import { ConceptB } from './concept-b';
import { ConceptC } from './concept-c';

type ConceptKey = 'a' | 'b' | 'c';
type ScreenKey = 'dashboard' | 'employees' | 'profile' | 'contracts' | 'error';

const CONCEPTS: { key: ConceptKey; label: string; tagline: string; accent: string }[] = [
  { key: 'a', label: 'Concept A · Command Center',     tagline: 'Operations cockpit for HR managers',     accent: 'bg-status-info'    },
  { key: 'b', label: 'Concept B · Employee Life Record', tagline: 'Profile-first with life timeline',     accent: 'bg-status-active'  },
  { key: 'c', label: 'Concept C · ERP Professional Grid', tagline: 'Dense grid with side inspector',     accent: 'bg-status-expiring'},
];

const SCREENS: { key: ScreenKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'employees', label: 'Employees' },
  { key: 'profile',   label: 'Profile'   },
  { key: 'contracts', label: 'Contracts' },
  { key: 'error',     label: 'API error' },
];

export function DesignLabPage() {
  const [params, setParams] = useSearchParams();
  const concept = ((params.get('c') as ConceptKey) || 'a') as ConceptKey;
  const screen  = ((params.get('s') as ScreenKey)  || 'dashboard') as ScreenKey;

  function setConcept(k: ConceptKey) {
    const next = new URLSearchParams(params);
    next.set('c', k);
    setParams(next, { replace: true });
  }
  function setScreen(k: ScreenKey) {
    const next = new URLSearchParams(params);
    next.set('s', k);
    setParams(next, { replace: true });
  }

  const active = CONCEPTS.find((c) => c.key === concept) ?? CONCEPTS[0]!;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Lab chrome — keep it visually distinct from production app shell. */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="px-6 py-3 flex items-center gap-4">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors duration-fast"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Exit lab
          </Link>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className={cn('h-6 w-6 rounded-md flex items-center justify-center', active.accent + '/15')}>
              <Beaker className={cn('h-3.5 w-3.5', active.accent.replace('bg-', 'text-'))} aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Design lab</div>
              <div className="text-[13px] font-semibold">{active.label}</div>
            </div>
          </div>
          <div className="flex-1" />
          <div className="hidden md:flex items-center gap-1 text-[11px] text-muted-foreground">
            <KeyboardIcon className="h-3 w-3" aria-hidden="true" />
            mock data only — no production wiring
          </div>
        </div>

        {/* Concept switcher */}
        <div className="px-6 -mb-px flex items-end gap-1 overflow-x-auto">
          {CONCEPTS.map((c) => {
            const sel = c.key === concept;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setConcept(c.key)}
                className={cn(
                  'group inline-flex items-center gap-2 px-3 py-2 text-[13px] border-b-2 transition-colors duration-fast',
                  sel
                    ? 'border-foreground text-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
                aria-pressed={sel}
              >
                <span className={cn('h-2 w-2 rounded-full', c.accent)} aria-hidden="true" />
                {c.label}
                {sel && (
                  <span className="hidden lg:inline text-muted-foreground/80 font-normal text-[12px] ml-1">
                    · {c.tagline}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Screen switcher */}
        <div className="px-6 py-2 flex items-center gap-1 border-t bg-muted/30">
          {SCREENS.map((s) => {
            const sel = s.key === screen;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setScreen(s.key)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-medium',
                  'transition-[background-color,color,transform,box-shadow] duration-fast ease-out-quart',
                  'hover:bg-background hover:shadow-hover',
                  'active:translate-y-[1px] active:duration-75',
                  sel
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground',
                )}
                aria-pressed={sel}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="flex-1">
        {concept === 'a' && <ConceptA screen={screen} />}
        {concept === 'b' && <ConceptB screen={screen} />}
        {concept === 'c' && <ConceptC screen={screen} />}
      </main>
    </div>
  );
}

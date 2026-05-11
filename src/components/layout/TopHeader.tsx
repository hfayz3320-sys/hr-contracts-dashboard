import { EnvironmentBadge } from './EnvironmentBadge';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { GlobalSearch } from './GlobalSearch';
import { MobileNavSheet } from '@/components/ui-foundation/HoverRailSidebar';

/**
 * TopHeader.
 *
 * Z-index: rail is z-40 fixed; this header is also `sticky z-30` so the
 * rail's expanded shadow stays above the header edge.
 *
 * Mobile (< md): renders the `<MobileNavSheet>` hamburger as the first
 * affordance. Desktop hides the hamburger via the `md:hidden` rule on the
 * sheet trigger.
 */
export function TopHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 md:px-6">
      <MobileNavSheet />
      <div className="flex-1 min-w-0">
        <GlobalSearch />
      </div>
      <div className="flex items-center gap-2">
        <EnvironmentBadge />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}

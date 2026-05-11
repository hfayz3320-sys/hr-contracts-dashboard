import { EnvironmentBadge } from './EnvironmentBadge';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { GlobalSearch } from './GlobalSearch';

export function TopHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 md:px-6">
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

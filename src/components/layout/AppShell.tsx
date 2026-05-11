import { Outlet } from 'react-router-dom';
import { HoverRailSidebar } from '@/components/ui-foundation/HoverRailSidebar';
import { TopHeader } from './TopHeader';
import { DebugPanel } from '@/components/common/DebugPanel';

/**
 * AppShell — application chrome.
 *
 * A5.0: the rail is `position: fixed`. We reserve horizontal space with
 * `md:pl-[var(--rail-w)]` on the wrapper. This guarantees the main content
 * does NOT shift when the rail expands on hover/focus — the expanded width
 * (240px) overlays adjacent content with a soft right-edge shadow instead.
 *
 * On mobile (< md) the rail is hidden and a hamburger trigger in
 * `<TopHeader>` opens the same nav inside a Sheet.
 */
export function AppShell() {
  return (
    <div className="min-h-full bg-background">
      <HoverRailSidebar />
      <div className="flex flex-col min-h-screen md:pl-[var(--rail-w)]">
        <TopHeader />
        <main className="flex-1">
          <div className="px-4 md:px-6 py-6 max-w-[1440px] mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
      <DebugPanel />
    </div>
  );
}

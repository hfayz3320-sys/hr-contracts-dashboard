import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';
import { DebugPanel } from '@/components/common/DebugPanel';

export function AppShell() {
  return (
    <div className="flex h-full bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader />
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 md:px-6 py-6 max-w-[1440px] mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
      <DebugPanel />
    </div>
  );
}

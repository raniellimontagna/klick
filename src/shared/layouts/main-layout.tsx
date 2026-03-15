import { Outlet } from 'react-router-dom';
import { MobileNav, Onboarding, PWAUpdatePrompt, SessionManagerModal, Sidebar, Topbar } from '@/shared';
import { useMainLayout } from './use-main-layout';

export function MainLayout() {
  const { isSessionManagerOpen, openSessionManager, closeSessionManager } = useMainLayout();

  return (
    <div className="app-shell relative flex bg-background text-text-primary">
      <div aria-hidden="true" className="app-shell-backdrop pointer-events-none absolute inset-0 z-0" />

      <Sidebar className="z-10 hidden min-h-0 w-72 shrink-0 md:flex" />

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onManageClick={openSessionManager} />

        <main
          data-scroll-region="content"
          className="app-shell-main flex flex-col scroll-smooth px-4 pt-4 sm:px-6 sm:pt-6"
        >
          <div className="flex min-h-0 w-full flex-1 flex-col">
            <Outlet />
          </div>
        </main>
      </div>

      <MobileNav />
      <Onboarding />
      <PWAUpdatePrompt />
      <SessionManagerModal isOpen={isSessionManagerOpen} onClose={closeSessionManager} />
    </div>
  );
}

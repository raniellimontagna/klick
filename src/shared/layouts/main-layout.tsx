import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Onboarding, PWAUpdatePrompt, SessionManagerModal, Sidebar, Topbar } from '@/shared';

export function MainLayout() {
  const [isSessionManagerOpen, setSessionManagerOpen] = useState(false);

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-background text-text-primary">
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top_left,rgba(124,77,255,0.22),transparent_58%)]" />
        <div className="absolute inset-x-0 bottom-0 h-72 bg-[radial-gradient(circle_at_bottom_right,rgba(57,255,136,0.14),transparent_62%)]" />
      </div>

      <Sidebar className="z-10 hidden w-72 shrink-0 md:flex" />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onManageClick={() => setSessionManagerOpen(true)} />

        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-smooth px-4 pb-24 pt-4 sm:px-6 sm:pt-6 md:pb-8">
          <div className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col">
            <Outlet />
          </div>
        </main>
      </div>

      <Onboarding />
      <PWAUpdatePrompt />
      <SessionManagerModal
        isOpen={isSessionManagerOpen}
        onClose={() => setSessionManagerOpen(false)}
      />
    </div>
  );
}

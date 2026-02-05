import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Onboarding, PWAUpdatePrompt, SessionManagerModal, Sidebar, Topbar } from '@/shared';

export function MainLayout() {
  const [isSessionManagerOpen, setSessionManagerOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-text-primary">
      {/* Sidebar - Desktop only */}
      <Sidebar className="hidden md:flex w-64 shrink-0" />

      {/* Main Content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar onManageClick={() => setSessionManagerOpen(true)} />

        <main className="flex-1 overflow-y-auto scroll-smooth p-4 md:p-6 pb-20 md:pb-6 min-h-0 flex flex-col">
          <div className="mx-auto w-full max-w-6xl flex-1 flex flex-col min-h-0">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Global components */}
      <Onboarding />
      <PWAUpdatePrompt />
      <SessionManagerModal
        isOpen={isSessionManagerOpen}
        onClose={() => setSessionManagerOpen(false)}
      />
    </div>
  );
}

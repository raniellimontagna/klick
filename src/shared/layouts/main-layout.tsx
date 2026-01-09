import { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import {
  Navbar,
  MobileNav,
  Logo,
  LanguageSelector,
  SessionSwitcher,
  SessionManagerModal,
  Onboarding,
  PWAUpdatePrompt,
  useTranslation,
} from '@/shared';

export function MainLayout() {
  const { t } = useTranslation();
  const [isSessionManagerOpen, setSessionManagerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-text-primary">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo + Title */}
            <div className="flex items-center gap-3">
              <Link to="/" aria-label={t.navigation.home} className="inline-flex">
                <Logo size="sm" />
              </Link>
              <div className="sm:block hidden">
                <p className="text-xs text-text-secondary">{t.app.tagline}</p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <Navbar />

            {/* Right actions */}
            <div className="flex items-center gap-2">
              <SessionSwitcher
                onManageClick={() => setSessionManagerOpen(true)}
                data-onboarding="sessions"
              />
              <LanguageSelector />
              <MobileNav />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-6">
        <Outlet />
      </main>

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

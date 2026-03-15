import { ShieldCheck } from '@solar-icons/react';
import { Link } from 'react-router-dom';
import { Logo } from '@/shared';
import { Card } from '@/shared/components/ui';
import { useAuthCallback } from './use-auth-callback';

export function AuthCallback() {
  const { error, t } = useAuthCallback();

  return (
    <div className="app-shell relative bg-background text-text-primary">
      <div
        aria-hidden="true"
        className="app-shell-backdrop pointer-events-none absolute inset-0 z-0"
      />

      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-3 text-text-primary">
            <Logo />
            <div>
              <p className="text-sm font-semibold">{t.app.title}</p>
              <p className="text-xs text-text-secondary">{t.app.tagline}</p>
            </div>
          </Link>

          <Link
            to="/"
            className="surface-interactive inline-flex min-h-11 items-center justify-center rounded-2xl px-4 text-sm font-semibold text-text-primary"
          >
            {t.actions.back}
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center py-10">
          <Card className="w-full max-w-2xl space-y-6 text-center">
            <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <ShieldCheck size={24} />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-text-primary">{t.auth.callback.title}</h1>
              <p className="text-sm leading-relaxed text-text-secondary">
                {t.auth.callback.description}
              </p>
            </div>

            {error ? (
              <p
                className="feedback-danger rounded-2xl border px-4 py-4 text-sm text-danger"
                role="alert"
              >
                {t.auth.callback.errorPrefix} {error}
              </p>
            ) : (
              <div className="space-y-4">
                <p className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  {t.auth.callback.processing}
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="surface-base rounded-2xl px-4 py-4 text-left">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
                      01
                    </p>
                    <p className="mt-2 text-sm font-semibold text-text-primary">
                      {t.auth.callback.title}
                    </p>
                  </div>
                  <div className="surface-base rounded-2xl px-4 py-4 text-left">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
                      02
                    </p>
                    <p className="mt-2 text-sm font-semibold text-text-primary">
                      {t.auth.callback.description}
                    </p>
                  </div>
                  <div className="surface-base rounded-2xl px-4 py-4 text-left">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
                      03
                    </p>
                    <p className="mt-2 text-sm font-semibold text-text-primary">
                      {t.auth.callback.processing}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </main>
      </div>
    </div>
  );
}

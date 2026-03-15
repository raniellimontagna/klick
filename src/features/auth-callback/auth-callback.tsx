import { useAuthCallback } from './use-auth-callback';

export function AuthCallback() {
  const { error, t } = useAuthCallback();

  return (
    <div className="app-shell relative bg-background text-text-primary">
      <div aria-hidden="true" className="app-shell-backdrop pointer-events-none absolute inset-0 z-0" />
      <main className="app-shell-main relative z-10 flex items-center justify-center px-6 py-10">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-surface/70 p-8 text-center shadow-xl">
          <h1 className="text-xl font-bold">{t.auth.callback.title}</h1>
          <p className="mt-2 text-sm text-text-secondary">{t.auth.callback.description}</p>

          {error ? (
            <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {t.auth.callback.errorPrefix} {error}
            </p>
          ) : (
            <p className="mt-4 text-xs uppercase tracking-[0.16em] text-text-muted">
              {t.auth.callback.processing}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

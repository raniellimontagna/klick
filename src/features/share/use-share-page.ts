import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicShareLinkBySlug } from '@/shared/lib/supabase/share';
import { getSupabaseClient } from '@/shared/lib/supabase/client';
import { useI18nStore } from '@/shared/store/i18n-store';
import type { ShareLink } from '@/shared/types';

type LoadStatus = 'loading' | 'ready' | 'not_found' | 'error';

export function useSharePage() {
  const { t, language } = useI18nStore();
  const { slug } = useParams<{ slug: string }>();

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);

  const client = useMemo(() => getSupabaseClient(), []);

  useEffect(() => {
    if (!slug) {
      setStatus('not_found');
      return;
    }

    if (!client) {
      setStatus('error');
      return;
    }

    let disposed = false;

    const run = async () => {
      setStatus('loading');

      try {
        const result = await getPublicShareLinkBySlug(client, slug);

        if (disposed) {
          return;
        }

        if (!result) {
          setStatus('not_found');
          setShareLink(null);
          return;
        }

        setShareLink(result);
        setStatus('ready');
      } catch {
        if (!disposed) {
          setShareLink(null);
          setStatus('error');
        }
      }
    };

    void run();

    return () => {
      disposed = true;
    };
  }, [client, slug]);

  const generatedAt = useMemo(() => {
    if (!shareLink?.payload.generatedAt) {
      return '';
    }

    return new Intl.DateTimeFormat(language, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(shareLink.payload.generatedAt));
  }, [language, shareLink?.payload.generatedAt]);

  return {
    t,
    status,
    shareLink,
    generatedAt,
  };
}

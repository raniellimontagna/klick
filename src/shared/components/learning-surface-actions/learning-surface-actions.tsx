import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/components/ui';
import { useTranslation } from '@/shared/hooks/use-translation';

type LearningSurfaceId = 'training' | 'tutorial' | 'cube3d';

interface LearningSurfaceActionsProps {
  current: LearningSurfaceId;
}

export function LearningSurfaceActions({ current }: LearningSurfaceActionsProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const actions = useMemo(() => {
    const items = {
      training: [
        { id: 'tutorial', label: t.navigation.tutorial, path: '/tutorial' },
        { id: 'cube3d', label: t.navigation.cube3d, path: '/cube-3d' },
      ],
      tutorial: [
        { id: 'training', label: t.navigation.training, path: '/training' },
        { id: 'cube3d', label: t.navigation.cube3d, path: '/cube-3d' },
      ],
      cube3d: [
        { id: 'training', label: t.navigation.training, path: '/training' },
        { id: 'tutorial', label: t.navigation.tutorial, path: '/tutorial' },
      ],
    } satisfies Record<
      LearningSurfaceId,
      Array<{ id: LearningSurfaceId; label: string; path: string }>
    >;

    return items[current];
  }, [current, t.navigation.cube3d, t.navigation.training, t.navigation.tutorial]);

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button key={action.id} variant="secondary" size="sm" onClick={() => navigate(action.path)}>
          {action.label}
        </Button>
      ))}
    </div>
  );
}

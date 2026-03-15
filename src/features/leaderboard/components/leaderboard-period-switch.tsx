import { Button, Card } from '@/shared/components/ui';
import type { LeaderboardPeriod } from '@/shared/types';

interface LeaderboardPeriodSwitchProps {
  title: string;
  subtitle: string;
  period: LeaderboardPeriod;
  weeklyLabel: string;
  monthlyLabel: string;
  isLoading: boolean;
  onPeriodChange: (period: LeaderboardPeriod) => void;
}

export function LeaderboardPeriodSwitch({
  title,
  subtitle,
  period,
  weeklyLabel,
  monthlyLabel,
  isLoading,
  onPeriodChange,
}: LeaderboardPeriodSwitchProps) {
  return (
    <Card className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-muted">{title}</h2>
        <p className="text-sm text-text-secondary">{subtitle}</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={period === 'weekly' ? 'primary' : 'secondary'}
          onClick={() => onPeriodChange('weekly')}
          disabled={isLoading}
          className="h-10"
        >
          {weeklyLabel}
        </Button>
        <Button
          variant={period === 'monthly' ? 'primary' : 'secondary'}
          onClick={() => onPeriodChange('monthly')}
          disabled={isLoading}
          className="h-10"
        >
          {monthlyLabel}
        </Button>
      </div>
    </Card>
  );
}

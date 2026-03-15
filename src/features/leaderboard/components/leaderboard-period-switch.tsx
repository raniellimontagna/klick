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
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">{title}</p>
        <h2 className="text-lg font-semibold text-text-primary">{subtitle}</h2>
        <p className="text-sm leading-relaxed text-text-secondary">{title}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          variant={period === 'weekly' ? 'primary' : 'secondary'}
          onClick={() => onPeriodChange('weekly')}
          disabled={isLoading}
          className="justify-center"
        >
          {weeklyLabel}
        </Button>
        <Button
          variant={period === 'monthly' ? 'primary' : 'secondary'}
          onClick={() => onPeriodChange('monthly')}
          disabled={isLoading}
          className="justify-center"
        >
          {monthlyLabel}
        </Button>
      </div>
    </Card>
  );
}

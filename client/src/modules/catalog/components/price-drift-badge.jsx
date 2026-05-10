import { TrendingUp, TrendingDown } from 'lucide-react';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';

export function PriceDriftBadge({ snapshotPrice, currentPrice }) {
  if (currentPrice == null || currentPrice === snapshotPrice) return null;

  const diff = currentPrice - snapshotPrice;
  const pct = ((diff / snapshotPrice) * 100).toFixed(1);
  const isUp = diff > 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full font-medium cursor-default ${
              isUp
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            }`}
          >
            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isUp ? '+' : ''}{pct}%
          </span>
        </TooltipTrigger>
        <TooltipContent className="text-xs">
          <p>Snapshot: CHF {snapshotPrice.toFixed(2)}</p>
          <p>Current: CHF {currentPrice.toFixed(2)}</p>
          <p className={isUp ? 'text-amber-500' : 'text-blue-500'}>
            Diff: {isUp ? '+' : ''}{diff.toFixed(2)} CHF
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

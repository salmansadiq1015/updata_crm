'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { addDays, format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useLanguage } from '@/lib/i18n/language-context';

export function DashboardUpcomingChart({ upcoming7Days = [] }) {
  const { t } = useLanguage();
  const assignmentsLabel = (count) => t('deploy.dashboard.assignmentsCount', '{count} Einsätze').replace('{count}', count);

  const chartData = upcoming7Days.map((count, i) => ({
    name: format(addDays(new Date(), i + 1), 'EEE', { locale: de }),
    fullDate: format(addDays(new Date(), i + 1), 'd. MMM', { locale: de }),
    count,
  }));

  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">
        {t('deploy.dashboard.upcoming', 'Nächste 7 Tage')}
      </h3>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="font-medium">{d.fullDate}</p>
                    <p className="text-muted-foreground">{assignmentsLabel(d.count)}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} className="fill-primary" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

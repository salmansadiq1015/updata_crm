'use client';

import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useLanguage } from '@/lib/i18n/language-context';
import { ASSIGNMENT_TYPE_META, ASSIGNMENT_STATUS_META } from '../../constants/deploy-constants';

export function CalendarPrintView({ employees, days, title }) {
  const { t } = useLanguage();

  return (
    <div className="hidden print:block p-4">
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold">{t('deploy.print.title', 'Einsatzplanung')} — {title}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t('deploy.print.printedOn', 'Gedruckt am')} {format(new Date(), 'd. MMMM yyyy, HH:mm', { locale: de })}
        </p>
      </div>

      {employees.map((emp) => {
        const assignments = emp.assignments || [];
        if (!assignments.length) return null;

        return (
          <div key={emp.employeeId} className="mb-6 break-inside-avoid">
            <h2 className="text-sm font-semibold border-b pb-1 mb-2">
              {emp.employeeName}
            </h2>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 pr-2 w-[120px]">{t('deploy.print.date', 'Datum')}</th>
                  <th className="text-left py-1 pr-2 w-[80px]">{t('deploy.print.time', 'Zeit')}</th>
                  <th className="text-left py-1 pr-2">{t('deploy.print.assignment', 'Einsatz')}</th>
                  <th className="text-left py-1 pr-2 w-[100px]">{t('deploy.print.type', 'Typ')}</th>
                  <th className="text-left py-1 w-[80px]">{t('deploy.print.status', 'Status')}</th>
                </tr>
              </thead>
              <tbody>
                {assignments
                  .sort((a, b) => new Date(a.startDatetime) - new Date(b.startDatetime))
                  .map((a) => {
                    const typeMeta = ASSIGNMENT_TYPE_META[a.assignmentType] || ASSIGNMENT_TYPE_META.OTHER;
                    const statusMeta = ASSIGNMENT_STATUS_META[a.status] || {};
                    return (
                      <tr key={a._id} className="border-b border-gray-200">
                        <td className="py-1 pr-2">
                          {format(new Date(a.startDatetime), 'EEE d. MMM', { locale: de })}
                        </td>
                        <td className="py-1 pr-2">
                          {format(new Date(a.startDatetime), 'HH:mm')}–{format(new Date(a.endDatetime), 'HH:mm')}
                        </td>
                        <td className="py-1 pr-2 font-medium">
                          {a.title || typeMeta.label}
                          {a.assignmentNumber && <span className="text-gray-400 ml-1">#{a.assignmentNumber}</span>}
                        </td>
                        <td className="py-1 pr-2">{typeMeta.label}</td>
                        <td className="py-1">{statusMeta.label || a.status}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

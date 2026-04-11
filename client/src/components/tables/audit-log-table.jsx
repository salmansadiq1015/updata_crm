'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authService } from '@/services/auth-service';
import { queryKeys } from '@/lib/query/keys';
import { showError } from '@/lib/toast';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';

const EVENT_LABELS = {
  'login.success': 'Erfolgreiche Anmeldung',
  'login.failed': 'Fehlgeschlagene Anmeldung',
  'logout': 'Abmeldung',
  'password.changed': 'Passwort geaendert',
  'password.reset_requested': 'Passwort-Reset angefordert',
  'user.created': 'Benutzer erstellt',
  'user.deactivated': 'Benutzer deaktiviert',
  'role.changed': 'Rolle geaendert',
  'session.revoked': 'Sitzung widerrufen',
  'permission.denied': 'Zugriff verweigert',
};

const EVENT_TYPES = Object.keys(EVENT_LABELS);

const ALL_MARKER = '__all__';

function DetailsCell({ details }) {
  const [expanded, setExpanded] = useState(false);

  if (!details || (typeof details === 'object' && Object.keys(details).length === 0)) {
    return <span className="text-muted-foreground">&mdash;</span>;
  }

  const highlights = typeof details === 'object'
    ? Object.entries(details).slice(0, 3)
    : null;

  if (!expanded && highlights) {
    return (
      <div className="space-y-0.5">
        {highlights.map(([key, value]) => (
          <div key={key} className="text-xs">
            <span className="font-medium text-muted-foreground">{key}:</span>{' '}
            <span>{String(value)}</span>
          </div>
        ))}
        {Object.keys(details).length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
          >
            Mehr <ChevronDown className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  if (expanded) {
    return (
      <div className="space-y-1">
        <pre className="max-w-xs overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">
          {JSON.stringify(details, null, 2)}
        </pre>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
        >
          Weniger <ChevronUp className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return <span className="text-xs">{String(details)}</span>;
}

export function AuditLogTable() {
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    event: '',
    result: '',
    user: '',
    module: '',
  });
  const [cursor, setCursor] = useState(null);
  const [cursorStack, setCursorStack] = useState([]);
  const [isExporting, setIsExporting] = useState(false);

  const buildParams = useCallback((cursorOverride) => {
    const params = {};
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.event) params.event = filters.event;
    if (filters.result) params.result = filters.result;
    if (filters.user) params.user = filters.user;
    if (filters.module) params.module = filters.module;
    if (cursorOverride) params.cursor = cursorOverride;
    return params;
  }, [filters]);

  const params = buildParams(cursor);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: queryKeys.audit.list(params),
    queryFn: () => authService.getAuditLog(params),
    placeholderData: (prev) => prev,
  });

  const entries = data?.data || [];
  const nextCursor = data?.pagination?.nextCursor || data?.nextCursor || null;
  const hasNext = !!nextCursor;
  const hasPrev = cursorStack.length > 0;

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCursor(null);
    setCursorStack([]);
  };

  const handleNext = () => {
    if (!nextCursor) return;
    setCursorStack((prev) => [...prev, cursor]);
    setCursor(nextCursor);
  };

  const handlePrev = () => {
    const stack = [...cursorStack];
    const prevCursor = stack.pop() ?? null;
    setCursorStack(stack);
    setCursor(prevCursor);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await authService.exportAuditLog(buildParams(null));
      const url = window.URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showError(err.message || 'Export fehlgeschlagen');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-1.5">
              <Label htmlFor="audit-from">Von</Label>
              <Input
                id="audit-from"
                type="date"
                value={filters.from}
                onChange={(e) => updateFilter('from', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-to">Bis</Label>
              <Input
                id="audit-to"
                type="date"
                value={filters.to}
                onChange={(e) => updateFilter('to', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ereignistyp</Label>
              <Select
                value={filters.event || ALL_MARKER}
                onValueChange={(val) => updateFilter('event', val === ALL_MARKER ? '' : val)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Alle Ereignisse" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MARKER}>Alle Ereignisse</SelectItem>
                  {EVENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {EVENT_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ergebnis</Label>
              <Select
                value={filters.result || ALL_MARKER}
                onValueChange={(val) => updateFilter('result', val === ALL_MARKER ? '' : val)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Alle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MARKER}>Alle</SelectItem>
                  <SelectItem value="success">Erfolgreich</SelectItem>
                  <SelectItem value="failure">Fehlgeschlagen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-user">Benutzer (E-Mail)</Label>
              <Input
                id="audit-user"
                type="text"
                placeholder="E-Mail suchen..."
                value={filters.user}
                onChange={(e) => updateFilter('user', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-module">Modul</Label>
              <Input
                id="audit-module"
                type="text"
                placeholder="Modul filtern..."
                value={filters.module}
                onChange={(e) => updateFilter('module', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {isLoading ? 'Lade...' : `${entries.length} Eintraege`}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              CSV Export
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zeitpunkt</TableHead>
                <TableHead>Ereignis</TableHead>
                <TableHead>Benutzer</TableHead>
                <TableHead>Ergebnis</TableHead>
                <TableHead>IP-Adresse</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !entries.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Keine Eintraege gefunden.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <TableRow key={entry._id || entry.id}>
                    <TableCell className="text-xs">
                      {entry.timestamp
                        ? new Date(entry.timestamp).toLocaleString('de-CH')
                        : '\u2014'}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {EVENT_LABELS[entry.event] || entry.event}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {entry.userEmail || entry.user?.email || '\u2014'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={entry.result === 'success' ? 'default' : 'destructive'}
                        className={
                          entry.result === 'success'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : ''
                        }
                      >
                        {entry.result === 'success' ? 'Erfolg' : 'Fehler'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {entry.ipAddress || entry.ip || '\u2014'}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <DetailsCell details={entry.details || entry.metadata} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Cursor Pagination */}
          <div className="flex items-center justify-between border-t px-4 py-3">
            <div className="text-xs text-muted-foreground">
              {isFetching && !isLoading && (
                <Loader2 className="inline mr-1 h-3 w-3 animate-spin" />
              )}
              Seite {cursorStack.length + 1}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
                disabled={!hasPrev || isLoading}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Zurueck
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNext}
                disabled={!hasNext || isLoading}
              >
                Weiter
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

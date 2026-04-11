import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ErrorFallback({ error, reset }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive mb-4" />
      <h3 className="text-sm font-medium">Fehler beim Laden</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">
        {error?.message || 'Ein unerwarteter Fehler ist aufgetreten.'}
      </p>
      {reset && (
        <Button variant="outline" size="sm" onClick={reset} className="mt-4">
          Erneut versuchen
        </Button>
      )}
    </div>
  );
}

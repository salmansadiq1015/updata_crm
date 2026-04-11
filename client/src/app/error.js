'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default function GlobalError({ error, reset }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Etwas ist schiefgelaufen</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            {error?.message || 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.'}
          </p>
        </CardContent>
        <CardFooter className="justify-center gap-2">
          <Button variant="outline" onClick={() => window.location.href = '/dashboard'}>
            Zum Dashboard
          </Button>
          <Button onClick={reset}>
            Erneut versuchen
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

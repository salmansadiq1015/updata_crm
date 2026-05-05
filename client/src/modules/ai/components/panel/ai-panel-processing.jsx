import { Skeleton } from '@/components/ui/skeleton';

export function AiPanelProcessing({ uploadProgress }) {
  const showProgress = uploadProgress > 0 && uploadProgress < 100;

  return (
    <div className="flex flex-col gap-4 px-2 py-4">
      <p className="text-sm text-muted-foreground text-center">
        {showProgress ? 'Uploading recording…' : 'Transcribing…'}
      </p>

      {showProgress && (
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-primary h-full rounded-full transition-all duration-300"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}

      <div className="flex flex-col gap-2 mt-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </div>
  );
}

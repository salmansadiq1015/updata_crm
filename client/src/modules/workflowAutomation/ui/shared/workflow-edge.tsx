'use client';
import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { PORT_EDGE_COLORS, portTone } from '../../lib/node-registry';

export interface CanvasEdgeData extends Record<string, unknown> {
  port: string;
  showLabel?: boolean;
  active?: boolean;    // run inspector: the path this run took
  dimmed?: boolean;    // run inspector: not taken
  onDelete?: (id: string) => void;
}
export type CanvasEdge = Edge<CanvasEdgeData>;

function WorkflowEdgeImpl({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd }: EdgeProps<CanvasEdge>) {
  const { t } = useLanguage();
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14, offset: 22 });
  const port = data?.port || 'out';
  const tone = portTone(port);
  const color = selected ? 'var(--primary)' : PORT_EDGE_COLORS[tone];
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={cn(data?.active && 'wf-edge-active')}
        style={{ stroke: color, strokeWidth: selected || data?.active ? 2.5 : 1.75, opacity: data?.dimmed ? 0.25 : 1, transition: 'stroke 120ms, opacity 120ms' }}
      />
      {(data?.showLabel !== false && port !== 'out') || (selected && data?.onDelete) ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute flex items-center gap-1"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, opacity: data?.dimmed ? 0.35 : 1 }}
          >
            {port !== 'out' && data?.showLabel !== false && (
              <span className="rounded-full border bg-background/95 px-2 py-0.5 text-[10.5px] font-semibold shadow-sm backdrop-blur" style={{ color: PORT_EDGE_COLORS[tone], borderColor: `${PORT_EDGE_COLORS[tone]}55` }}>
                {t(`workflow.port.${port}`, port)}
              </span>
            )}
            {selected && data?.onDelete && (
              <button type="button" onClick={() => data.onDelete?.(id)} aria-label={t('workflowBuilder.edge.delete', 'Delete connection')}
                className="grid size-5 place-items-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:border-rose-400 hover:text-rose-600">
                <X className="size-3" />
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const WorkflowEdge = memo(WorkflowEdgeImpl);

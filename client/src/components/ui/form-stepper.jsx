'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const slideVariants = {
  enter: (direction) => ({ x: direction > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction) => ({ x: direction > 0 ? -80 : 80, opacity: 0 }),
};

function StepIndicator({ steps, currentStep, onStepClick }) {
  return (
    <div className="flex items-center justify-between px-2">
      {steps.map((step, idx) => {
        const isCompleted = idx < currentStep;
        const isActive = idx === currentStep;
        const isUpcoming = idx > currentStep;
        const Icon = isCompleted ? Check : step.icon;

        return (
          <div key={step.label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                disabled={isUpcoming}
                onClick={() => isCompleted && onStepClick(idx)}
                className={cn(
                  'relative flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300',
                  isCompleted && 'border-primary bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90',
                  isActive && 'border-primary bg-primary/10 text-primary ring-4 ring-primary/20',
                  isUpcoming && 'border-muted-foreground/30 bg-muted text-muted-foreground cursor-not-allowed',
                )}
              >
                <Icon className="h-4 w-4" />
                {isActive && (
                  <motion.span
                    className="absolute inset-0 rounded-full border-2 border-primary"
                    animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </button>
              <span
                className={cn(
                  'text-[11px] font-medium whitespace-nowrap transition-colors',
                  isCompleted && 'text-primary',
                  isActive && 'text-primary',
                  isUpcoming && 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>

            {idx < steps.length - 1 && (
              <div className="relative flex-1 mx-2 mt-[-18px]">
                <div className="h-0.5 w-full bg-muted-foreground/20 rounded-full" />
                <motion.div
                  className="absolute top-0 left-0 h-0.5 bg-primary rounded-full"
                  initial={false}
                  animate={{ width: isCompleted ? '100%' : '0%' }}
                  transition={{ duration: 0.4, ease: 'easeInOut' }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepContent({ children, direction, currentStep }) {
  return (
    <div className="relative min-h-[340px] overflow-hidden">
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={currentStep}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="py-4"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function StepFooter({ currentStep, totalSteps, onBack, onNext, onCancel, isLoading, nextLabel, backLabel, cancelLabel, submitLabel }) {
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

  return (
    <div className="flex justify-between items-center pt-4 border-t border-border/60">
      <div>
        {isFirst ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {cancelLabel || 'Cancel'}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={onBack}>
            {backLabel || 'Back'}
          </Button>
        )}
      </div>
      <Button type="button" onClick={onNext} disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isLast ? (submitLabel || 'Create') : (nextLabel || 'Next')}
      </Button>
    </div>
  );
}

export function FormStepper({
  steps,
  currentStep,
  direction,
  onStepClick,
  onBack,
  onNext,
  onCancel,
  isLoading,
  labels = {},
  children,
}) {
  return (
    <div className="flex flex-col gap-4">
      <StepIndicator steps={steps} currentStep={currentStep} onStepClick={onStepClick} />
      <StepContent direction={direction} currentStep={currentStep}>{children}</StepContent>
      <StepFooter
        currentStep={currentStep}
        totalSteps={steps.length}
        onBack={onBack}
        onNext={onNext}
        onCancel={onCancel}
        isLoading={isLoading}
        nextLabel={labels.next}
        backLabel={labels.back}
        cancelLabel={labels.cancel}
        submitLabel={labels.submit}
      />
    </div>
  );
}

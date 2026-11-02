'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export function Reveal({ children, className, delay = 0, y = 28, as = 'div' }) {
  const Component = motion[as] ?? motion.div;

  return (
    <Component
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Component>
  );
}

export function SectionIntro({ eyebrow, title, description, align = 'start', className }) {
  return (
    <Reveal className={cn('max-w-3xl', align === 'center' && 'mx-auto text-center', className)}>
      <p className="landing-kicker">{eyebrow}</p>
      <h2 className="mt-5 text-[clamp(2rem,4.4vw,3.75rem)] font-semibold leading-[1.03] tracking-[-0.045em] text-white">
        {title}
      </h2>
      {description ? (
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">
          {description}
        </p>
      ) : null}
    </Reveal>
  );
}

export function DemoLabel({ children, className }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-slate-950/65 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500', className)}>
      <span className="size-1 rounded-full bg-cyan-400" aria-hidden="true" />
      {children}
    </span>
  );
}

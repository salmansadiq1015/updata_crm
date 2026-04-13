'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ArrowRight, Play, Users, BarChart3, Calendar, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

export function HeroSection() {
  const { t } = useLanguage();
  const mockupRef = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e) => {
    if (!mockupRef.current) return;
    const rect = mockupRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: y * -8, y: x * 8 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
  }, []);

  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden pt-[72px]">
      {/* Animated background */}
      <div className="absolute inset-0 -z-10 bg-grid" />
      <div className="absolute top-20 right-[10%] w-[600px] h-[600px] rounded-full bg-primary/6 blur-[100px] animate-pulse-glow" />
      <div className="absolute bottom-20 left-[5%] w-[500px] h-[500px] rounded-full bg-primary/4 blur-[80px] animate-pulse-glow" style={{ animationDelay: '1.5s' }} />

      {/* Noise texture */}
      <div className="absolute inset-0 -z-10 opacity-[0.015]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }} />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full py-12">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-8 items-center">
          {/* Left: Copy */}
          <div className="lg:col-span-6 xl:col-span-5">
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-both">
              <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-primary/15 bg-primary/5 px-4 py-2 text-[0.8rem] font-medium text-primary backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5" />
                {t('hero.badge')}
              </div>

              <h1 className="text-[2.75rem] leading-[1.1] font-extrabold tracking-tight sm:text-[3.5rem] lg:text-[3.75rem]">
                {t('hero.title.line1')}{' '}
                <span className="text-gradient">
                  {t('hero.title.line2')}
                </span>
              </h1>

              <p className="mt-6 text-[1.1rem] leading-relaxed text-muted-foreground max-w-lg">
                {t('hero.subtitle')}
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Button size="lg" className="gap-2.5 text-[0.95rem] px-7 h-12 rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300" asChild>
                  <Link href="/login">
                    {t('hero.cta.start')}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="gap-2.5 text-[0.95rem] px-7 h-12 rounded-xl border-border/60 hover:bg-accent transition-all duration-300" asChild>
                  <a href="#features">
                    <Play className="h-4 w-4 fill-current" />
                    {t('hero.cta.demo')}
                  </a>
                </Button>
              </div>
            </div>
          </div>

          {/* Right: Dashboard Mockup with parallax tilt */}
          <div className="lg:col-span-6 xl:col-span-7 hidden lg:block">
            <div className="animate-in fade-in slide-in-from-right-12 duration-1000 delay-300 fill-mode-both">
              <div
                ref={mockupRef}
                className="relative ml-8"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{ perspective: '1000px' }}
              >
                <div className="absolute -inset-8 rounded-3xl bg-gradient-to-br from-primary/15 via-[#9F7AEA]/10 to-transparent blur-2xl animate-pulse-glow" />

                <div
                  className="relative rounded-2xl border border-border/50 bg-card shadow-2xl shadow-black/5 overflow-hidden transition-transform duration-200 ease-out"
                  style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
                >
                  {/* Browser chrome */}
                  <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3">
                    <div className="flex gap-1.5">
                      <div className="h-3 w-3 rounded-full bg-red-400/70" />
                      <div className="h-3 w-3 rounded-full bg-amber-400/70" />
                      <div className="h-3 w-3 rounded-full bg-green-400/70" />
                    </div>
                    <div className="mx-auto flex items-center gap-2 rounded-lg bg-background/80 border border-border/50 px-4 py-1.5 text-xs text-muted-foreground">
                      <div className="h-3 w-3 rounded-full bg-success/60" />
                      {t('hero.mockup.url')}
                    </div>
                  </div>

                  {/* Dashboard content */}
                  <div className="p-5 space-y-4 bg-gradient-to-b from-background to-muted/20">
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: t('hero.mockup.customers'), value: '2,847', icon: Users, color: 'bg-primary-gradient' },
                        { label: t('hero.mockup.projects'), value: '184', icon: BarChart3, color: 'from-emerald-500 to-green-500' },
                        { label: t('hero.mockup.appointments'), value: '23', icon: Calendar, color: 'from-amber-500 to-orange-500' },
                      ].map((stat) => (
                        <div key={stat.label} className="group rounded-xl border border-border/40 bg-card p-3.5 hover:shadow-md transition-all duration-200">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[0.7rem] font-medium text-muted-foreground">{stat.label}</span>
                            <div className={cn('h-7 w-7 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-sm', stat.color)}>
                              <stat.icon className="h-3.5 w-3.5 text-white" />
                            </div>
                          </div>
                          <p className="text-xl font-bold tracking-tight">{stat.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-border/40 overflow-hidden">
                      <div className="bg-muted/30 px-4 py-2.5 flex items-center justify-between">
                        <span className="text-xs font-semibold">{t('hero.mockup.recentProjects')}</span>
                        <div className="flex gap-1">
                          <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                        </div>
                      </div>
                      {[
                        { name: t('hero.mockup.project1'), status: t('hero.mockup.status1'), dotColor: 'bg-primary' },
                        { name: t('hero.mockup.project2'), status: t('hero.mockup.status2'), dotColor: 'bg-amber-500' },
                        { name: t('hero.mockup.project3'), status: t('hero.mockup.status3'), dotColor: 'bg-success' },
                      ].map((row, i) => (
                        <div
                          key={row.name}
                          className={cn(
                            'flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors',
                            i < 2 && 'border-b border-border/30'
                          )}
                        >
                          <span className="text-[0.8rem] font-medium">{row.name}</span>
                          <span className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                            <span className={cn('h-2 w-2 rounded-full', row.dotColor)} />
                            {row.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Floating card */}
                <div className="absolute -bottom-4 -left-8 animate-float rounded-xl border border-border/40 bg-card px-4 py-3 shadow-lg shadow-black/5 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold">+12 {t('hero.mockup.projects')}</p>
                    <p className="text-[0.65rem] text-muted-foreground">diese Woche</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

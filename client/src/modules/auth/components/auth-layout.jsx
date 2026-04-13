'use client';

import Link from 'next/link';
import { Zap, Shield, FolderKanban, BarChart3, Users } from 'lucide-react';

const features = [
  { icon: FolderKanban, label: 'Projektmanagement' },
  { icon: Users, label: 'Kundenmanagement' },
  { icon: BarChart3, label: 'Buchhaltung & Finanzen' },
  { icon: Shield, label: 'Rollen & Berechtigungen' },
];

export function AuthLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      {/* Left panel — branded */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[540px] relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#7B61FF] via-primary to-[#5B3FD4]" />

        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-white/5 blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-white/5 blur-3xl translate-y-1/3 -translate-x-1/4" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTTAgMGg2MHY2MEgweiIgZmlsbD0ibm9uZSIvPjxjaXJjbGUgY3g9IjMwIiBjeT0iMzAiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNikiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IGZpbGw9InVybCgjZykiIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiLz48L3N2Zz4=')] opacity-60" />

        {/* Content */}
        <div className="relative flex flex-col justify-between p-10 xl:p-14 w-full">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm border border-white/10">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">
              MB Boiler ERP
            </span>
          </Link>

          {/* Middle content */}
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-extrabold text-white tracking-tight leading-tight xl:text-4xl">
                Ihr zentrales
                <br />
                Werkzeug fuer
                <br />
                den Arbeitsalltag
              </h2>
              <p className="mt-4 text-base text-white/60 leading-relaxed max-w-xs">
                Projekte, Kunden und Finanzen — alles in einer modernen Plattform.
              </p>
            </div>

            {/* Feature list */}
            <div className="space-y-3">
              {features.map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 backdrop-blur-sm">
                    <f.icon className="h-4 w-4 text-white/80" />
                  </div>
                  <span className="text-sm font-medium text-white/75">{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="text-xs text-white/30">
            &copy; {new Date().getFullYear()} MB Boiler & Heizung AG
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col">
        {/* Mobile logo bar */}
        <div className="flex items-center gap-2.5 p-6 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-gradient shadow-md shadow-primary/25">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight">
            MB Boiler <span className="text-primary">ERP</span>
          </span>
        </div>

        {/* Form container */}
        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-12 lg:px-16">
          <div className="w-full max-w-[420px]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

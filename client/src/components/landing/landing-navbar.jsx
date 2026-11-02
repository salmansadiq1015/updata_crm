'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ArrowUpRight, Check, ChevronDown, Globe2, LayoutDashboard, LogOut, Menu, UserRound, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { authService } from '@/modules/auth/services/auth-service';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { loginHref } from './auth-aware-link';

const localeOptions = [
  { code: 'en', label: 'English', short: 'EN', dir: 'ltr' },
  { code: 'de', label: 'Deutsch', short: 'DE', dir: 'ltr' },
  { code: 'fr', label: 'Français', short: 'FR', dir: 'ltr' },
  { code: 'ar', label: 'العربية', short: 'AR', dir: 'rtl' },
];

function userInitials(user) {
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();
  return initials || user?.email?.[0]?.toUpperCase() || 'U';
}

function userName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Updata user';
}

function userRole(user) {
  return (typeof user?.role === 'object' ? user.role?.name : user?.role) || user?.email || '';
}

function ProfileMenu({ user, onLogout, t }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t('userMenu.profile')} className="grid size-10 place-items-center rounded-full border border-white/[0.09] bg-white/[0.035] transition-colors hover:border-blue-300/25 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
          <Avatar className="size-8 border border-blue-300/20 bg-blue-500/15">
            <AvatarImage src={user?.avatarUrl || user?.avatar} alt="" />
            <AvatarFallback className="bg-blue-500/15 text-[10px] font-bold text-blue-100">{userInitials(user)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60 border border-white/[0.1] bg-[#0b1220] p-1.5 text-slate-200 shadow-2xl">
        <DropdownMenuLabel className="px-2 py-2">
          <span className="block truncate text-xs font-semibold text-white">{userName(user)}</span>
          <span className="mt-0.5 block truncate text-[10px] font-normal text-slate-500">{user?.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/[0.07]" />
        <DropdownMenuItem asChild className="px-2.5 py-2 text-xs focus:bg-white/[0.06] focus:text-white">
          <Link href="/dashboard"><LayoutDashboard className="size-3.5 text-blue-300" />{t('landing.ecosystem.dashboard')}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="px-2.5 py-2 text-xs focus:bg-white/[0.06] focus:text-white">
          <Link href="/profile"><UserRound className="size-3.5 text-cyan-300" />{t('userMenu.profile')}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/[0.07]" />
        <DropdownMenuItem onSelect={onLogout} className="px-2.5 py-2 text-xs text-rose-300 focus:bg-rose-400/10 focus:text-rose-200">
          <LogOut className="size-3.5" />{t('userMenu.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LandingNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const homeAnchor = pathname === '/' ? '' : '/';
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const languageRef = useRef(null);
  const { t, locale, setLocale } = useLanguage();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (languageRef.current && !languageRef.current.contains(event.target)) setLanguageOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const productLinks = [
    { label: t('experience.leads.nav'), href: `${homeAnchor}#crm` },
    { label: t('landing.nav.leadGeneration'), href: `${homeAnchor}#lead-generation` },
    { label: t('experience.calling.nav'), href: `${homeAnchor}#ai-calling` },
    { label: t('landing.nav.ai'), href: `${homeAnchor}#intelligence` },
  ];
  const solutionLinks = [
    { label: t('landing.footer.work'), href: `${homeAnchor}#operations` },
    { label: t('landing.footer.security'), href: `${homeAnchor}#security` },
    { label: t('landing.footer.customers'), href: `${homeAnchor}#crm` },
  ];
  const navLinks = [
    ...productLinks,
    { label: t('experience.pricing.nav'), href: `${homeAnchor}#pricing` },
    { label: t('experience.resources.nav'), href: `${homeAnchor}#resources` },
  ];
  const currentLocale = localeOptions.find((item) => item.code === locale) ?? localeOptions[0];

  const chooseLocale = (code) => {
    setLocale(code);
    setLanguageOpen(false);
  };

  const handleLogout = async () => {
    await authService.logout();
    setMenuOpen(false);
    router.replace('/');
  };

  return (
    <header className={cn('fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,box-shadow] duration-300', scrolled ? 'border-white/[0.08] bg-[#060b16]/88 shadow-[0_8px_40px_rgba(0,0,0,.22)] backdrop-blur-xl' : 'border-transparent bg-transparent')}>
      <div className="mx-auto flex h-[68px] max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10">
        <Link href="/" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" aria-label={t('landing.nav.product')}>
          <Image src="/updata-logo-dark.svg" alt="Updata ERP" width={220} height={56} priority className="h-8 w-auto" />
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label={t('experience.navigation.title')}>
          {[[t('landing.nav.product'), productLinks], [t('landing.nav.solutions'), solutionLinks]].map(([label, links]) => (
            <DropdownMenu key={label}>
              <DropdownMenuTrigger asChild><button type="button" className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-300 hover:bg-white/5 hover:text-white">{label}<ChevronDown aria-hidden="true" className="size-3" /></button></DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={12} className="w-60 rounded-xl border-white/10 bg-[#0b1220] p-2 text-slate-200 shadow-2xl">
                {links.map(link => <DropdownMenuItem key={link.href} asChild className="rounded-lg px-3 py-3 text-sm focus:bg-white/5 focus:text-white"><a href={link.href}>{link.label}</a></DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
          {navLinks.slice(4).map(link => <a key={link.href} href={link.href} className="rounded-lg px-3 py-2 text-[13px] font-medium text-slate-300 hover:bg-white/5 hover:text-white">{link.label}</a>)}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <div className="relative" ref={languageRef}>
            <button type="button" onClick={() => setLanguageOpen((open) => !open)} aria-expanded={languageOpen} aria-haspopup="listbox" className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
              <Globe2 className="size-3.5" aria-hidden="true" />{currentLocale.short}<ChevronDown className={cn('size-3 transition-transform', languageOpen && 'rotate-180')} aria-hidden="true" />
              <span className="sr-only">{t('landing.nav.language')}</span>
            </button>
            <AnimatePresence>
              {languageOpen ? (
                <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.18 }} role="listbox" aria-label={t('landing.nav.language')} className="absolute end-0 mt-2 w-48 overflow-hidden rounded-xl border border-white/[0.1] bg-[#0b1220] p-1.5 shadow-2xl">
                  {localeOptions.map((item) => <button key={item.code} type="button" role="option" dir={item.dir} aria-selected={locale === item.code} onClick={() => chooseLocale(item.code)} className="flex w-full items-center rounded-lg px-3 py-2 text-start text-xs text-slate-300 transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400"><span>{item.label}</span>{locale === item.code ? <Check className="ms-auto size-3.5 text-blue-400" aria-hidden="true" /> : null}</button>)}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
          {isLoading ? <span className="h-9 w-28 animate-pulse rounded-xl bg-white/[0.06]" aria-label={t('common.loading')} /> : isAuthenticated && user ? <ProfileMenu user={user} onLogout={handleLogout} t={t} /> : <Link href={loginHref('/dashboard')} className="rounded-lg px-3 py-2 text-[13px] font-medium text-slate-300 transition-colors hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">{t('landing.nav.signIn')}</Link>}
          <Link href={isAuthenticated ? '/dashboard' : loginHref('/dashboard')} className="flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[13px] font-semibold text-slate-950 shadow-[0_8px_30px_rgba(255,255,255,.12)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">{t('experience.start')}<ArrowUpRight className="size-3.5" aria-hidden="true" /></Link>
        </div>

        <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="landing-mobile-menu" className="grid size-10 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.035] text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 lg:hidden">
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}<span className="sr-only">{t('landing.nav.menu')}</span>
        </button>
      </div>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div id="landing-mobile-menu" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden border-t border-white/[0.07] bg-[#080e1b]/98 backdrop-blur-xl lg:hidden">
            <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6">
              <nav className="grid gap-1" aria-label={t('experience.navigation.title')}>{navLinks.map((link) => <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-sm font-medium text-slate-300 hover:bg-white/[0.05]">{link.label}</a>)}</nav>
              <div className="mt-4 border-t border-white/[0.07] pt-4">
                <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{t('landing.nav.language')}</p>
                <div className="mt-2 grid grid-cols-2 gap-1">{localeOptions.map((item) => <button key={item.code} type="button" dir={item.dir} onClick={() => chooseLocale(item.code)} className={cn('rounded-lg px-3 py-2.5 text-start text-xs', locale === item.code ? 'bg-blue-500/12 text-blue-300' : 'text-slate-400 hover:bg-white/[0.04]')}>{item.label}</button>)}</div>
              </div>
              {isLoading ? <div className="mt-4 h-16 animate-pulse rounded-xl bg-white/[0.05]" /> : isAuthenticated && user ? (
                <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-4">
                  <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                    <Avatar className="size-10 border border-blue-300/20"><AvatarImage src={user?.avatarUrl || user?.avatar} alt="" /><AvatarFallback className="bg-blue-500/15 text-xs font-bold text-blue-100">{userInitials(user)}</AvatarFallback></Avatar>
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{userName(user)}</p><p className="truncate text-[10px] text-slate-500">{userRole(user)}</p></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2"><Link href="/dashboard" onClick={() => setMenuOpen(false)} className="grid h-11 place-items-center rounded-lg bg-white text-sm font-semibold text-slate-950">{t('experience.start')}</Link><button type="button" onClick={handleLogout} className="grid h-11 place-items-center rounded-lg border border-white/[0.1] text-sm font-medium text-rose-300">{t('userMenu.logout')}</button></div>
                </div>
              ) : <div className="mt-4 grid grid-cols-2 gap-2"><Link href={loginHref('/dashboard')} className="grid h-11 place-items-center rounded-lg border border-white/[0.1] text-sm font-medium text-white">{t('landing.nav.signIn')}</Link><Link href={loginHref('/dashboard')} className="grid h-11 place-items-center rounded-lg bg-white text-sm font-semibold text-slate-950">{t('experience.start')}</Link></div>}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

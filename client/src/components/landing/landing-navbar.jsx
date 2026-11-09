'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ArrowUpRight, BriefcaseBusiness, ChevronDown, Globe2, LayoutDashboard, LogOut, Menu, Phone, ShieldCheck, Sparkles, Target, UserRound, Users, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { authService } from '@/modules/auth/services/auth-service';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { loginHref } from './auth-aware-link';
import styles from './landing-navbar.module.css';

const localeOptions = [
  { code: 'en', label: 'English', short: 'EN', dir: 'ltr' },
  { code: 'de', label: 'Deutsch', short: 'DE', dir: 'ltr' },
  { code: 'fr', label: 'Français', short: 'FR', dir: 'ltr' },
  { code: 'ar', label: 'العربية', short: 'AR', dir: 'rtl' },
];

function userInitials(user) {
  return `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U';
}

function userName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Updata user';
}

function UserAvatar({ user }) {
  return <Avatar className={styles.avatar}><AvatarImage src={user?.avatarUrl || user?.avatar} alt="" /><AvatarFallback className={styles.avatarFallback}>{userInitials(user)}</AvatarFallback></Avatar>;
}

function ProfileMenu({ user, onLogout, t, dir }) {
  return (
    <DropdownMenu dir={dir}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t('userMenu.profile')} className={styles.profileTrigger}>
          <UserAvatar user={user} /><ChevronDown aria-hidden="true" className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={12} collisionPadding={16} className={cn(styles.surface, styles.profileMenu)}>
        <DropdownMenuLabel className={styles.identity}>
          <UserAvatar user={user} />
          <span className="min-w-0"><span className={styles.userName}>{userName(user)}</span><span className={styles.userEmail}>{user?.email}</span></span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className={styles.separator} />
        <DropdownMenuItem asChild className={styles.menuItem}><Link href="/dashboard"><span className={styles.iconTile}><LayoutDashboard /></span>{t('landing.ecosystem.dashboard')}<ArrowUpRight className={styles.trailingIcon} /></Link></DropdownMenuItem>
        <DropdownMenuItem asChild className={styles.menuItem}><Link href="/profile"><span className={styles.iconTile}><UserRound /></span>{t('userMenu.profile')}<ArrowUpRight className={styles.trailingIcon} /></Link></DropdownMenuItem>
        <DropdownMenuSeparator className={styles.separator} />
        <DropdownMenuItem onSelect={onLogout} className={cn(styles.menuItem, styles.logout)}><span className={styles.iconTile}><LogOut /></span>{t('userMenu.logout')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavigationMenu({ label, links, dir }) {
  return (
    <DropdownMenu dir={dir}>
      <DropdownMenuTrigger asChild><button type="button" className={styles.navLink}>{label}<ChevronDown aria-hidden="true" className={styles.chevron} /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={12} collisionPadding={16} className={cn(styles.surface, styles.navigationMenu)}>
        <DropdownMenuLabel className={styles.sectionLabel}>{label}</DropdownMenuLabel>
        {links.map(({ href, label: title, icon: Icon }) => <DropdownMenuItem key={href} asChild className={styles.menuItem}><a href={href}><span className={styles.iconTile}><Icon /></span><span className="min-w-0 flex-1">{title}</span><ArrowUpRight className={styles.trailingIcon} /></a></DropdownMenuItem>)}
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
  const mobileTriggerRef = useRef(null);
  const { t, locale, setLocale } = useLanguage();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
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
    const desktop = window.matchMedia('(min-width: 1280px)');
    const onResize = () => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener('change', onResize);
    return () => desktop.removeEventListener('change', onResize);
  }, []);

  const productLinks = [
    { label: t('experience.leads.nav'), href: `${homeAnchor}#crm`, icon: Users },
    { label: t('landing.nav.leadGeneration'), href: `${homeAnchor}#lead-generation`, icon: Target },
    { label: 'AI Calling Agent', href: '/calling-engine', icon: Phone },
    { label: t('landing.nav.ai'), href: `${homeAnchor}#intelligence`, icon: Sparkles },
  ];
  const solutionLinks = [
    { label: t('landing.footer.work'), href: `${homeAnchor}#operations`, icon: BriefcaseBusiness },
    { label: t('landing.footer.security'), href: `${homeAnchor}#security`, icon: ShieldCheck },
    { label: t('landing.footer.customers'), href: `${homeAnchor}#crm`, icon: Users },
  ];
  const directLinks = [
    { label: t('experience.pricing.nav'), href: `${homeAnchor}#pricing` },
    { label: t('experience.resources.nav'), href: `${homeAnchor}#resources` },
  ];
  const currentLocale = localeOptions.find((item) => item.code === locale) ?? localeOptions[0];
  const startHref = isAuthenticated ? '/dashboard' : loginHref('/dashboard');
  const closeMenu = () => setMenuOpen(false);
  const handleLogout = async () => {
    await authService.logout();
    closeMenu();
    router.replace('/');
  };

  return (
    <header className={cn(styles.header, scrolled && styles.scrolled)}>
      <div className={styles.bar}>
        <Link href="/" className={styles.logo} aria-label="Updata ERP"><Image src="/updata-logo-dark.svg" alt="Updata ERP" width={220} height={56} preload className="h-9 w-auto" /></Link>
        <nav className={styles.desktopNav} aria-label={t('experience.navigation.title')}>
          <NavigationMenu label={t('landing.nav.product')} links={productLinks} dir={dir} />
          <NavigationMenu label={t('landing.nav.solutions')} links={solutionLinks} dir={dir} />
          <Link href="/calling-engine" aria-current={pathname === '/calling-engine' ? 'page' : undefined} className={styles.navLink}>AI Calling Agent</Link>
          {directLinks.map(link => <a key={link.href} href={link.href} className={styles.navLink}>{link.label}</a>)}
        </nav>
        <div className={styles.actions}>
          <div className={styles.desktopActions}>
            <DropdownMenu dir={dir}>
              <DropdownMenuTrigger asChild><button type="button" aria-label={`${t('landing.nav.language')}: ${currentLocale.label}`} className={styles.languageTrigger}><Globe2 aria-hidden="true" className="size-4" />{currentLocale.short}<ChevronDown aria-hidden="true" className={styles.chevron} /></button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={12} collisionPadding={16} className={cn(styles.surface, styles.languageMenu)}>
                <DropdownMenuLabel className={styles.sectionLabel}>{t('landing.nav.language')}</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={locale} onValueChange={setLocale}>{localeOptions.map(item => <DropdownMenuRadioItem key={item.code} value={item.code} className={styles.localeItem}><span dir={item.dir}>{item.label}</span><span className={styles.localeCode}>{item.short}</span></DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className={styles.actionDivider} />
            {isLoading ? <span className={styles.skeleton} aria-label={t('common.loading')} /> : isAuthenticated && user ? <ProfileMenu user={user} onLogout={handleLogout} t={t} dir={dir} /> : <Link href={loginHref('/dashboard')} className={styles.navLink}>{t('landing.nav.signIn')}</Link>}
          </div>
          <Link href={startHref} className={cn(styles.primaryButton, styles.headerCta)}>{t('experience.start')}<ArrowUpRight aria-hidden="true" className="size-4" /></Link>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild><button ref={mobileTriggerRef} type="button" aria-controls="landing-mobile-menu" className={styles.mobileTrigger}><Menu aria-hidden="true" className="size-5" /><span className="sr-only">{t('landing.nav.menu')}</span></button></SheetTrigger>
            <SheetContent id="landing-mobile-menu" side={dir === 'rtl' ? 'left' : 'right'} showCloseButton={false} className={styles.mobilePanel} onCloseAutoFocus={(event) => { if (mobileTriggerRef.current?.getClientRects().length === 0) event.preventDefault(); }}>
              <div className={styles.mobileHeading}><SheetTitle className={styles.mobileTitle}>{t('experience.navigation.title')}</SheetTitle><SheetClose asChild><button type="button" className={styles.closeButton} aria-label={t('common.close')}><X aria-hidden="true" className="size-5" /></button></SheetClose></div>
              <div className={styles.mobileScroll}>
                <nav aria-label={t('experience.navigation.title')}>
                  {[[t('landing.nav.product'), productLinks], [t('landing.nav.solutions'), solutionLinks]].map(([label, links]) => <div key={label} className={styles.mobileGroup}><p className={styles.sectionLabel}>{label}</p>{links.map(({ href, label: title, icon: Icon }) => <a key={href} href={href} onClick={closeMenu} className={styles.mobileLink}><span className={styles.iconTile}><Icon /></span>{title}<ArrowUpRight className={styles.trailingIcon} /></a>)}</div>)}
                  <div className={styles.mobileGroup}>{directLinks.map(link => <a key={link.href} href={link.href} onClick={closeMenu} className={styles.mobileLink}>{link.label}<ArrowUpRight className={styles.trailingIcon} /></a>)}</div>
                </nav>
                <div className={styles.mobileGroup}><p className={styles.sectionLabel}>{t('landing.nav.language')}</p><div className={styles.localeGrid}>{localeOptions.map(item => <button key={item.code} type="button" dir={item.dir} aria-pressed={locale === item.code} onClick={() => setLocale(item.code)} className={styles.mobileLocale}>{item.label}<span className={styles.localeCode}>{item.short}</span></button>)}</div></div>
                {isLoading ? <div className={styles.skeleton} /> : isAuthenticated && user ? <div className={styles.mobileGroup}><div className={styles.identity}><UserAvatar user={user} /><span className="min-w-0"><span className={styles.userName}>{userName(user)}</span><span className={styles.userEmail}>{user.email}</span></span></div><Link href="/profile" onClick={closeMenu} className={styles.mobileLink}><UserRound className="size-4" />{t('userMenu.profile')}</Link><button type="button" onClick={handleLogout} className={cn(styles.mobileLink, styles.logout)}><LogOut className="size-4" />{t('userMenu.logout')}</button></div> : null}
              </div>
              <div className={styles.mobileFooter}>{!isLoading && !isAuthenticated ? <Link href={loginHref('/dashboard')} onClick={closeMenu} className={styles.secondaryButton}>{t('landing.nav.signIn')}</Link> : null}<Link href={startHref} onClick={closeMenu} className={styles.primaryButton}>{t('experience.start')}<ArrowUpRight aria-hidden="true" className="size-4" /></Link></div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

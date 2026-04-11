'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Search, LayoutDashboard, Users, Shield, Monitor, ScrollText,
  User, ArrowRight, Activity,
} from 'lucide-react';
import { userService } from '@/services/user-service';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, section: 'Seiten' },
  { label: 'Benutzer', href: '/settings/users', icon: Users, section: 'Seiten' },
  { label: 'Rollen', href: '/settings/roles', icon: Shield, section: 'Seiten' },
  { label: 'Sitzungen', href: '/settings/sessions', icon: Monitor, section: 'Seiten' },
  { label: 'Audit Log', href: '/settings/audit', icon: ScrollText, section: 'Seiten' },
  { label: 'Mein Profil', href: '/profile', icon: User, section: 'Seiten' },
  { label: 'System', href: '/settings/system', icon: Activity, section: 'Seiten' },
];

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setUsers([]);
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setUsers([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await userService.getUsers({ search: query, pageSize: 5 });
        setUsers(res?.data || []);
      } catch {
        setUsers([]);
      }
    }, 250);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const filteredNav = query.trim()
    ? navItems.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : navItems;

  const allResults = [
    ...filteredNav.map((item) => ({ ...item, type: 'nav' })),
    ...users.map((u) => ({
      label: `${u.firstName} ${u.lastName}`,
      sublabel: u.email,
      href: `/settings/users/${u._id}`,
      icon: User,
      section: 'Benutzer',
      type: 'user',
    })),
  ];

  const navigate = useCallback((href) => {
    setOpen(false);
    router.push(href);
  }, [router]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, allResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && allResults[selectedIndex]) {
      navigate(allResults[selectedIndex].href);
    }
  };

  const sections = {};
  allResults.forEach((item, i) => {
    const section = item.section || 'Ergebnisse';
    if (!sections[section]) sections[section] = [];
    sections[section].push({ ...item, globalIndex: i });
  });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/80 hover:border-border transition-all duration-200 min-w-[200px]"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Suchen...</span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border bg-background px-1.5 text-[0.65rem] font-mono text-muted-foreground">
          Ctrl+K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden" hideClose>
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
              onKeyDown={handleKeyDown}
              placeholder="Seite oder Benutzer suchen..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          <div className="max-h-[300px] overflow-y-auto py-2">
            {Object.entries(sections).map(([sectionName, items]) => (
              <div key={sectionName}>
                <p className="px-4 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  {sectionName}
                </p>
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      onClick={() => navigate(item.href)}
                      className={cn(
                        'flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm transition-colors',
                        item.globalIndex === selectedIndex
                          ? 'bg-primary/8 text-foreground'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{item.label}</span>
                        {item.sublabel && (
                          <span className="text-xs text-muted-foreground ml-2">{item.sublabel}</span>
                        )}
                      </div>
                      <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                    </button>
                  );
                })}
              </div>
            ))}

            {allResults.length === 0 && query.trim() && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Keine Ergebnisse fuer &ldquo;{query}&rdquo;
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

'use client';

import Link from 'next/link';
import { PermissionGate } from '@/shared/components/permission-gate';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  Shield, Lock, Key, Users, Eye, Pencil, Copy, Trash2,
  MoreHorizontal,
} from 'lucide-react';

const PROTECTED_ROLE_NAMES = ['Admin', 'User'];
const isProtectedRole = (role) =>
  !!role?.isSystem || PROTECTED_ROLE_NAMES.includes(role?.name);

const ROLE_ACCENTS = [
  { bg: 'bg-brand-500/10', ring: 'ring-brand-500/20', text: 'text-brand-500', bar: 'from-brand-500 to-transparent' },
  { bg: 'bg-sky-500/10', ring: 'ring-sky-500/20', text: 'text-sky-500', bar: 'from-sky-500 to-transparent' },
  { bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20', text: 'text-emerald-500', bar: 'from-emerald-500 to-transparent' },
  { bg: 'bg-amber-500/10', ring: 'ring-amber-500/20', text: 'text-amber-500', bar: 'from-amber-500 to-transparent' },
  { bg: 'bg-rose-500/10', ring: 'ring-rose-500/20', text: 'text-rose-500', bar: 'from-rose-500 to-transparent' },
  { bg: 'bg-indigo-500/10', ring: 'ring-indigo-500/20', text: 'text-indigo-500', bar: 'from-indigo-500 to-transparent' },
  { bg: 'bg-pink-500/10', ring: 'ring-pink-500/20', text: 'text-pink-500', bar: 'from-pink-500 to-transparent' },
  { bg: 'bg-teal-500/10', ring: 'ring-teal-500/20', text: 'text-teal-500', bar: 'from-teal-500 to-transparent' },
];

export function RoleCard({ role, onEdit, onClone, onDelete }) {
  const permCount = role.permissions?.length || 0;
  const userCount = role.userCount ?? 0;
  const colorIdx = ((role.name || '').charCodeAt(0) || 0) % ROLE_ACCENTS.length;
  const accent = ROLE_ACCENTS[colorIdx];

  return (
    <div className="group relative rounded-xl border border-border bg-card overflow-hidden hover:border-border hover:shadow-theme-md transition-all duration-200">
      {/* Top accent bar */}
      <div className={cn('h-1 bg-linear-to-r', accent.bar)} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <Link href={`/settings/roles/${role._id}`} className="flex items-center gap-3 min-w-0 group/link">
            <div className={cn(
              'h-11 w-11 rounded-xl flex items-center justify-center ring-1 shrink-0',
              accent.bg, accent.ring
            )}>
              <Shield className={cn('h-5 w-5', accent.text)} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-sm truncate group-hover/link:text-primary transition-colors">
                  {role.name}
                </p>
                {role.isSystem && <Lock className="h-3 w-3 text-muted-foreground/60 shrink-0" />}
              </div>
              <span className={cn(
                'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md mt-1',
                role.isSystem
                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              )}>
                <span className={cn('h-1 w-1 rounded-full', role.isSystem ? 'bg-amber-500' : 'bg-emerald-500')} />
                {role.isSystem ? 'System' : 'Custom'}
              </span>
            </div>
          </Link>

          {/* Actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md opacity-0 group-hover:opacity-100 transition-opacity -mt-0.5 -mr-1"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem asChild>
                <Link href={`/settings/roles/${role._id}`} className="gap-2">
                  <Eye className="h-3.5 w-3.5" />
                  Anzeigen
                </Link>
              </DropdownMenuItem>
              <PermissionGate permission="roles:admin">
                <DropdownMenuItem onClick={onEdit} className="gap-2">
                  <Pencil className="h-3.5 w-3.5" />
                  Bearbeiten
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onClone} className="gap-2">
                  <Copy className="h-3.5 w-3.5" />
                  Duplizieren
                </DropdownMenuItem>
                {!isProtectedRole(role) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={onDelete}
                      className="gap-2 text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Loeschen
                    </DropdownMenuItem>
                  </>
                )}
              </PermissionGate>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Description */}
        {role.description ? (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-4 min-h-[2rem]">
            {role.description}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/50 italic mb-4 min-h-[2rem]">
            Keine Beschreibung
          </p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 pt-3 border-t border-border">
          <div className="flex items-center gap-2 flex-1">
            <div className="h-6 w-6 rounded-md bg-brand-500/10 flex items-center justify-center shrink-0">
              <Key className="h-3 w-3 text-brand-500" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">{permCount}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {permCount === 1 ? 'Berechtigung' : 'Berechtigungen'}
              </p>
            </div>
          </div>

          <div className="w-px h-8 bg-border" />

          <div className="flex items-center gap-2 flex-1">
            <div className="h-6 w-6 rounded-md bg-sky-500/10 flex items-center justify-center shrink-0">
              <Users className="h-3 w-3 text-sky-500" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">{userCount}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {userCount === 1 ? 'Benutzer' : 'Benutzer'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

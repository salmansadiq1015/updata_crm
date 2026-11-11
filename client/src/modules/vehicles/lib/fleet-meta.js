'use client';

import { useMemo } from 'react';
import {
  Car, CarFront, Truck, Bus, Motorbike, Caravan, Construction, Forklift, Tractor, Ship, Bike, Container,
  Fuel, Zap, BatteryCharging, Flame, Leaf, CircleSlash,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { intlLocaleFor } from '@/lib/i18n/locale-config';

// Mirrors server/src/modules/vehicles/vehicle.constants.js.
export const VEHICLE_STATUSES = ['available', 'in_use', 'reserved', 'workshop', 'out_of_service', 'retired'];
export const VEHICLE_ASSET_TYPES = ['car', 'van', 'truck', 'bus', 'pickup', 'motorcycle', 'trailer', 'construction', 'forklift', 'agricultural', 'boat', 'ebike', 'other'];
export const VEHICLE_FUEL_TYPES = ['diesel', 'petrol', 'electric', 'hybrid', 'plugin_hybrid', 'lpg', 'cng', 'hydrogen', 'none', 'other'];
export const VEHICLE_METER_UNITS = ['km', 'mi', 'h'];
export const VEHICLE_TRANSMISSIONS = ['manual', 'automatic', 'none'];
export const VEHICLE_OWNERSHIP_TYPES = ['owned', 'leased', 'financed', 'rented', 'employee_owned'];
export const VEHICLE_SERVICE_TYPES = ['maintenance', 'repair', 'inspection', 'tires', 'bodywork', 'cleaning', 'other'];
export const VEHICLE_COST_TYPES = ['fuel', 'charging', 'toll', 'parking', 'insurance', 'tax', 'leasing', 'fine', 'cleaning', 'accessories', 'other'];
export const CURRENCIES = ['CHF', 'EUR', 'USD', 'GBP', 'AED', 'SAR', 'PKR', 'INR'];

export const ASSET_TYPE_ICONS = {
  car: Car, van: CarFront, truck: Truck, bus: Bus, pickup: Truck, motorcycle: Motorbike, trailer: Caravan,
  construction: Construction, forklift: Forklift, agricultural: Tractor, boat: Ship, ebike: Bike, other: Container,
};

export const FUEL_ICONS = {
  diesel: Fuel, petrol: Fuel, electric: Zap, hybrid: BatteryCharging, plugin_hybrid: BatteryCharging,
  lpg: Flame, cng: Flame, hydrogen: Leaf, none: CircleSlash, other: Fuel,
};

/** Status tones — brand blue/cyan family plus semantic green/amber/red; never purple. */
export const STATUS_TONES = {
  available: { dot: 'bg-emerald-400', badge: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-400' },
  in_use: { dot: 'bg-sky-400', badge: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300', bar: 'bg-sky-400' },
  reserved: { dot: 'bg-cyan-300', badge: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200', bar: 'bg-cyan-300' },
  workshop: { dot: 'bg-amber-400', badge: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300', bar: 'bg-amber-400' },
  out_of_service: { dot: 'bg-rose-500', badge: 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300', bar: 'bg-rose-500' },
  retired: { dot: 'bg-slate-400', badge: 'border-slate-500/25 bg-slate-500/10 text-slate-600 dark:text-slate-300', bar: 'bg-slate-400' },
};

export const HEALTH_TONES = {
  ok: 'text-emerald-600 dark:text-emerald-300',
  due_soon: 'text-amber-600 dark:text-amber-300',
  overdue: 'text-rose-600 dark:text-rose-300',
};

export const driverName = (d) => (d && typeof d === 'object' ? [d.firstName, d.lastName].filter(Boolean).join(' ') || d.email || null : null);
export const initialsOf = (d) => `${(d?.firstName || '')[0] || ''}${(d?.lastName || '')[0] || ''}`.toUpperCase() || '?';
export const vehicleTitle = (v) => v?.label || [v?.make, v?.model].filter(Boolean).join(' ') || v?.kennzeichen || '';
export const vehicleSubtitle = (v) => (v?.label ? [v.make, v.model].filter(Boolean).join(' ') : '');
export const toDateInput = (v) => (v ? String(v).slice(0, 10) : '');

/** Locale-aware formatters bound to the current UI language. */
export function useFleetFormat() {
  const { locale } = useLanguage();
  return useMemo(() => {
    const intl = intlLocaleFor(locale);
    const numberFmt = new Intl.NumberFormat(intl, { maximumFractionDigits: 1 });
    const dateFmt = new Intl.DateTimeFormat(intl, { day: '2-digit', month: 'short', year: 'numeric' });
    const dateTimeFmt = new Intl.DateTimeFormat(intl, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const monthFmt = new Intl.DateTimeFormat(intl, { month: 'short' });
    const moneyCache = new Map();
    const money = (amount, currency = 'CHF', digits = 0) => {
      if (amount == null || Number.isNaN(Number(amount))) return '—';
      const key = `${currency}:${digits}`;
      if (!moneyCache.has(key)) {
        try {
          moneyCache.set(key, new Intl.NumberFormat(intl, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }));
        } catch {
          moneyCache.set(key, { format: (n) => `${currency} ${numberFmt.format(n)}` });
        }
      }
      return moneyCache.get(key).format(Number(amount));
    };
    return {
      number: (v) => (v == null || v === '' ? '—' : numberFmt.format(Number(v))),
      meter: (v, unit = 'km') => (v == null || v === '' ? '—' : `${numberFmt.format(Number(v))} ${unit}`),
      date: (v) => (v ? dateFmt.format(new Date(v)) : '—'),
      dateTime: (v) => (v ? dateTimeFmt.format(new Date(v)) : '—'),
      monthShort: (v) => (v ? monthFmt.format(new Date(v)) : ''),
      money,
      relativeDays: (days) => {
        try {
          return new Intl.RelativeTimeFormat(intl, { numeric: 'auto' }).format(days, 'day');
        } catch {
          return `${days} d`;
        }
      },
    };
  }, [locale]);
}

const DAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const toIsoDate = (date: Date) => {
  const local = startOfLocalDay(date);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, '0');
  const day = String(local.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function parseTaskDueInput(input: string, now = new Date()): string | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;

  const today = startOfLocalDay(now);
  if (value === 'today') return toIsoDate(today);
  if (value === 'tomorrow') {
    const date = new Date(today);
    date.setDate(date.getDate() + 1);
    return toIsoDate(date);
  }

  const relativeMatch = value.match(/^\+?\s*(\d+)\s*(d|day|days|w|week|weeks)$/);
  if (relativeMatch) {
    const amount = Number(relativeMatch[1]);
    const unit = relativeMatch[2]?.startsWith('w') ? 7 : 1;
    const date = new Date(today);
    date.setDate(date.getDate() + amount * unit);
    return toIsoDate(date);
  }

  const nextDayMatch = value.match(/^next\s+([a-z]+)$/);
  if (nextDayMatch) {
    const target = DAY_INDEX[nextDayMatch[1] ?? ''];
    if (target !== undefined) {
      const date = new Date(today);
      const current = date.getDay();
      const delta = (target - current + 7) % 7 || 7;
      date.setDate(date.getDate() + delta);
      return toIsoDate(date);
    }
  }

  const parsed = new Date(input);
  if (!Number.isNaN(parsed.getTime())) return toIsoDate(parsed);

  return null;
}

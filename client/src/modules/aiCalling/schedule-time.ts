/** Convert a wall-clock input in an explicit IANA timezone. Reject missing or
 * ambiguous DST times instead of silently using the browser's timezone. */
export function localDateTimeToIso(value: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Choose a launch date and time.');
  const [year, month, day, hour, minute] = value.split(/[-T:]/).map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch { throw new Error('Enter a valid timezone, such as Asia/Karachi.'); }
  const wall = (time: number) => {
    const parts = formatter.formatToParts(new Date(time));
    const part = (type: string) => Number(parts.find(p => p.type === type)?.value);
    return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
  };
  const matches = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 3) {
    const sample = target + hours * 3600000;
    const offset = wall(sample) - sample;
    const candidate = target - offset;
    if (wall(candidate) === target) matches.add(candidate);
  }
  if (!matches.size) throw new Error('This local time does not exist because of a clock change. Choose another time.');
  if (matches.size > 1) throw new Error('This local time occurs twice because of a clock change. Choose an unambiguous time.');
  return new Date([...matches][0]).toISOString();
}

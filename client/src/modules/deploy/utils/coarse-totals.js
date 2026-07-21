// Pure helpers for the coarse-planning matrix. Each row is
// { id, name, weekMap: { [calendarWeek]: Allocation[] } }. A "cell" is one
// (row, week) pair; its value is the summed allocationPercent of every
// allocation in that cell. Anything > 100 means the row is over-allocated for
// that week. All functions here are side-effect free so they can be unit-tested
// and the components stay dumb.

export function cellPercent(allocations) {
  if (!allocations) return 0;
  const list = Array.isArray(allocations) ? allocations : [allocations];
  return list.reduce((sum, item) => sum + (item?.allocationPercent || 0), 0);
}

// Effective load of a (row, week) cell for capacity/utilisation: the greater of
// the coarse allocations and the load from real assignments (Einsätze). Using
// max avoids double-counting when the same work exists as both an allocation
// and a concrete booking (module 08 — Grobplanung must reflect real Termine).
export function effectivePercent(row, week) {
  const coarse = cellPercent(row?.weekMap?.[week]);
  const assignment = row?.assignmentMap?.[week] || 0;
  return Math.max(coarse, assignment);
}

// Average load of a single row across the visible weeks (empty weeks count as 0).
export function rowAverage(row, weeks) {
  if (!weeks.length) return 0;
  const total = weeks.reduce((sum, week) => sum + effectivePercent(row, week), 0);
  return Math.round(total / weeks.length);
}

export function isRowOverAllocated(row, weeks) {
  return weeks.some((week) => effectivePercent(row, week) > 100);
}

// Team load per week: average of every row's cell value for that week.
// Returns { [week]: roundedPercent }.
export function columnAverages(rows, weeks) {
  const result = {};
  weeks.forEach((week) => {
    if (!rows.length) {
      result[week] = 0;
      return;
    }
    const total = rows.reduce((sum, row) => sum + effectivePercent(row, week), 0);
    result[week] = Math.round(total / rows.length);
  });
  return result;
}

export function computeKpis(rows, weeks) {
  const cellValues = [];
  rows.forEach((row) => {
    weeks.forEach((week) => cellValues.push(effectivePercent(row, week)));
  });

  const avgUtilization = cellValues.length
    ? Math.round(cellValues.reduce((a, b) => a + b, 0) / cellValues.length)
    : 0;

  return {
    rowCount: rows.length,
    avgUtilization,
    freeCapacity: Math.max(0, 100 - avgUtilization),
    overAllocatedRows: rows.filter((row) => isRowOverAllocated(row, weeks)).length,
  };
}

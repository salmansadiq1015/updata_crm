import { describe, expect, it } from 'vitest';
import {
  cellPercent,
  rowAverage,
  isRowOverAllocated,
  columnAverages,
  computeKpis,
} from '../utils/coarse-totals';

const rowA = {
  id: 'a',
  name: 'A',
  weekMap: {
    1: [{ allocationPercent: 50 }],
    2: [{ allocationPercent: 100 }],
  },
};

const rowB = {
  id: 'b',
  name: 'B',
  weekMap: {
    1: [{ allocationPercent: 75 }, { allocationPercent: 75 }], // 150% -> over-allocated
  },
};

describe('coarse totals', () => {
  it('sums every allocation in a cell', () => {
    expect(cellPercent([{ allocationPercent: 25 }, { allocationPercent: 50 }])).toBe(75);
    expect(cellPercent({ allocationPercent: 40 })).toBe(40);
    expect(cellPercent(null)).toBe(0);
    expect(cellPercent([])).toBe(0);
  });

  it('averages a row across all visible weeks, counting empty weeks as zero', () => {
    // (50 + 100 + 0 + 0) / 4
    expect(rowAverage(rowA, [1, 2, 3, 4])).toBe(38);
  });

  it('flags a row as over-allocated when any cell exceeds 100%', () => {
    expect(isRowOverAllocated(rowA, [1, 2])).toBe(false);
    expect(isRowOverAllocated(rowB, [1])).toBe(true);
  });

  it('computes per-week team load averaged over rows', () => {
    expect(columnAverages([rowA, rowB], [1, 2])).toEqual({
      1: 100, // (50 + 150) / 2
      2: 50, //  (100 + 0) / 2
    });
  });

  it('returns zeroed column averages when there are no rows', () => {
    expect(columnAverages([], [1, 2])).toEqual({ 1: 0, 2: 0 });
  });

  it('computes range-wide KPIs', () => {
    const kpis = computeKpis([rowA, rowB], [1, 2]);
    expect(kpis.rowCount).toBe(2);
    // cells: 50,100,150,0 -> avg 75
    expect(kpis.avgUtilization).toBe(75);
    expect(kpis.freeCapacity).toBe(25);
    expect(kpis.overAllocatedRows).toBe(1);
  });

  it('handles an empty matrix without dividing by zero', () => {
    expect(computeKpis([], [1, 2])).toEqual({
      rowCount: 0,
      avgUtilization: 0,
      freeCapacity: 100,
      overAllocatedRows: 0,
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  DEPARTMENT_POSITION_PRESETS,
  getPositionPreset,
  getPositionPresets,
  getRoleByPresetName,
} from '../constants/department-position-presets';

describe('department position presets', () => {
  it('returns positions for a predefined department', () => {
    expect(getPositionPresets('Technik').map((position) => position.value)).toEqual([
      'Servicetechniker',
      'Monteur',
      'Lehrling',
    ]);
  });

  it('maps a position to the expected role name', () => {
    expect(getPositionPreset('Finanzen', 'Buchhalter')).toMatchObject({
      value: 'Buchhalter',
      roleName: 'Buchhalter',
    });
  });

  it('resolves role names case-insensitively', () => {
    expect(getRoleByPresetName([{ _id: 'role-1', name: ' techniker ' }], 'Techniker')).toEqual({
      _id: 'role-1',
      name: ' techniker ',
    });
  });

  it('does not auto-map onboarding presets to admin access', () => {
    const roleNames = DEPARTMENT_POSITION_PRESETS.flatMap((department) =>
      department.positions.map((position) => position.roleName),
    );

    expect(roleNames).not.toContain('Admin');
  });

  it('handles malformed role responses safely', () => {
    expect(getRoleByPresetName(null, 'Techniker')).toBeNull();
  });
});

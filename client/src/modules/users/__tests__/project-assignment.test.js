import { describe, expect, it } from 'vitest';
import {
  USER_PROJECT_ASSIGNMENT_TYPES,
  buildUserProjectAssignment,
  canAssignUserAsTeam,
  findAssignmentTargetName,
  getPreferredDepartmentId,
} from '../utils/project-assignment';

describe('user project assignment helpers', () => {
  it('builds manager and team assignment payloads explicitly', () => {
    expect(buildUserProjectAssignment('project-1', USER_PROJECT_ASSIGNMENT_TYPES.MANAGER)).toEqual({
      projectId: 'project-1',
      assignmentType: 'manager',
    });

    expect(buildUserProjectAssignment('project-1', USER_PROJECT_ASSIGNMENT_TYPES.TEAM)).toEqual({
      projectId: 'project-1',
      assignmentType: 'team',
    });
  });

  it('uses manager assignment as the safe fallback', () => {
    expect(buildUserProjectAssignment('project-1', 'unexpected')).toEqual({
      projectId: 'project-1',
      assignmentType: 'manager',
    });
  });

  it('detects whether a user can receive team project assignments', () => {
    expect(canAssignUserAsTeam({ preferences: { preferredDepartmentId: 'team-1' } })).toBe(true);
    expect(canAssignUserAsTeam({ preferences: { preferredDepartmentId: null } })).toBe(false);
  });

  it('resolves preferred team ids and display names from normalized targets', () => {
    const user = { preferences: { preferredDepartmentId: { _id: 'team-1' } } };
    const targets = [{ _id: 'team-1', name: 'Service', code: 'SVC' }];

    expect(getPreferredDepartmentId(user)).toBe('team-1');
    expect(findAssignmentTargetName(targets, 'team-1')).toBe('Service (SVC)');
  });
});

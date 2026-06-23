export const USER_PROJECT_ASSIGNMENT_TYPES = Object.freeze({
  MANAGER: 'manager',
  TEAM: 'team',
});

export function getPreferredDepartmentId(user) {
  const value = user?.preferences?.preferredDepartmentId || user?.preferredDepartmentId || null;
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value._id || value.id || null;
}

export function canAssignUserAsTeam(user) {
  return Boolean(getPreferredDepartmentId(user));
}

export function buildUserProjectAssignment(projectId, assignmentType) {
  return {
    projectId,
    assignmentType: assignmentType === USER_PROJECT_ASSIGNMENT_TYPES.TEAM
      ? USER_PROJECT_ASSIGNMENT_TYPES.TEAM
      : USER_PROJECT_ASSIGNMENT_TYPES.MANAGER,
  };
}

export function findAssignmentTargetName(assignmentTargets, targetId) {
  if (!targetId || !Array.isArray(assignmentTargets)) return null;
  const target = assignmentTargets.find((item) => (item?._id || item?.id)?.toString() === targetId.toString());
  if (!target) return null;
  return [target.name, target.code ? `(${target.code})` : null].filter(Boolean).join(' ');
}

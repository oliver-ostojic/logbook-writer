import type { AssignmentModelValue, RoleDescriptor } from './types';

export function getRoleAssignmentModels(role: RoleDescriptor | undefined): AssignmentModelValue[] {
  if (!role) {
    return [];
  }
  return role.assignmentModels && role.assignmentModels.length > 0
    ? role.assignmentModels
    : (['HOURLY'] as AssignmentModelValue[]);
}

export function roleSupportsAssignmentModel(
  role: RoleDescriptor | undefined,
  assignmentModel: AssignmentModelValue
): boolean {
  const models = getRoleAssignmentModels(role);
  return models.includes(assignmentModel);
}

export function roleSupportsAnyAssignmentModel(
  role: RoleDescriptor | undefined,
  assignmentModels: AssignmentModelValue[]
): boolean {
  const models = getRoleAssignmentModels(role);
  return assignmentModels.some((model) => models.includes(model));
}

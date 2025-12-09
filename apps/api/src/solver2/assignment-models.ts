import type { AssignmentModelValue, RoleDescriptor } from './types';

export function getRoleAssignmentModel(role: RoleDescriptor | undefined): AssignmentModelValue | null {
  if (!role) {
    return null;
  }
  return role.assignmentModel ?? null;
}

export function roleSupportsAssignmentModel(
  role: RoleDescriptor | undefined,
  assignmentModel: AssignmentModelValue
): boolean {
  const model = getRoleAssignmentModel(role);
  return model !== null && model === assignmentModel;
}

export function roleSupportsAnyAssignmentModel(
  role: RoleDescriptor | undefined,
  assignmentModels: AssignmentModelValue[]
): boolean {
  const model = getRoleAssignmentModel(role);
  return model !== null && assignmentModels.includes(model);
}

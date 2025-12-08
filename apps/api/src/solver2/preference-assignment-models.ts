import type { AssignmentModelValue, RoleDescriptor } from './types';
import { getRoleAssignmentModels } from './assignment-models';

export function resolvePreferenceAssignmentModels(
  roleId: number | null,
  roleLookup: Map<number, RoleDescriptor>
): AssignmentModelValue[] {
  if (roleId === null) {
    return [];
  }

  const role = roleLookup.get(roleId);
  return getRoleAssignmentModels(role);
}

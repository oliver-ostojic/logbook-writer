import type { AssignmentModelValue, RoleDescriptor } from './types';
import { getRoleAssignmentModel } from './assignment-models';

export function resolvePreferenceAssignmentModel(
  roleId: number | null,
  roleLookup: Map<number, RoleDescriptor>
): AssignmentModelValue | null {
  if (roleId === null) {
    return null;
  }

  const role = roleLookup.get(roleId);
  return getRoleAssignmentModel(role);
}

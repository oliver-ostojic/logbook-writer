import { ConsecutivePolicy } from '@prisma/client';
import type { AssignmentModelValue, SolverInputV2 } from '../types';

const asAssignments = (values: AssignmentModelValue[]): AssignmentModelValue[] => values;

const sampleInput: SolverInputV2 = {
  store: {
    id: 1,
    timezone: 'EST',
    baseSlotMinutes: 30,
    openMinutesFromMidnight: 480,
    closeMinutesFromMidnight: 1260,
  },
  roles: [
    {
      id: 1,
      code: 'REG',
      displayName: 'Register',
  assignmentModels: asAssignments(['HOURLY', 'HOURLY_OR_WINDOW', 'DAILY']),
      minSlots: 2,
      maxSlots: 10,
      blockSize: 2,
      allowOutsideStoreHours: false,
      consecutivePolicy: 'NONE' as ConsecutivePolicy,
      minShiftLengthForRoleAccess: null,
    },
    {
      id: 2,
      code: 'BRK',
      displayName: 'Break',
  assignmentModels: asAssignments(['SOLVER']),
      minSlots: 0,
      maxSlots: 1,
      blockSize: 1,
      allowOutsideStoreHours: true,
      consecutivePolicy: 'REQUIRED' as ConsecutivePolicy,
      minShiftLengthForRoleAccess: 300,
      windowOffsets: {
        startOffsetMin: 180,
        endOffsetMin: 300,
      },
    },
    {
      id: 3,
      code: 'PROD',
      displayName: 'Product',
  assignmentModels: asAssignments(['HOURLY']),
      minSlots: 0,
      maxSlots: 12,
      blockSize: 1,
      allowOutsideStoreHours: true,
      consecutivePolicy: 'NONE' as ConsecutivePolicy,
      minShiftLengthForRoleAccess: null,
    },
  ],
  crew: [
    {
      id: 'crew-alpha',
      name: 'Crew Alpha',
      roleIds: [1, 2, 3],
      shiftStartMin: 300,
      shiftEndMin: 780,
    },
    {
      id: 'crew-beta',
      name: 'Crew Beta',
      roleIds: [1, 3],
      shiftStartMin: 600,
      shiftEndMin: 1320,
    },
  ],
  hourlyRequirements: [
    { roleId: 1, hour: 8, required: 4 },
    { roleId: 1, hour: 9, required: 4 },
  ],
  windowRequirements: [
    { roleId: 1, startHour: 8, endHour: 12, requiredPerHour: 4 },
  ],
  dailyRequirements: [
    { roleId: 1, crewId: 'crew-alpha', requiredMinutes: 240 },
  ],
  preferences: [],
  bankedPreferences: [],
  fairnessTrackers: [],
  fairnessHistory: [],
};

export default sampleInput;

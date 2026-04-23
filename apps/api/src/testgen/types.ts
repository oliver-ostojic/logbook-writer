export type PercentEntry<T> = {
  value: T;
  percentage: number;
};

export type ShiftSpec = {
  crewId: string;
  startMin: number;
  endMin: number;
};

export type CoverageWindowSpec = {
  roleId: number;
  startMin: number;
  endMin: number;
  crewPerTaskLength: number;
  constraintRule: 'MIN' | 'MAX' | 'EXACTLY';
};

export type CrewQuotaSpec = {
  roleId: number;
  crewId: string;
  startMin: number;
  endMin: number;
  requiredMin: number;
};

export type DayPayload = {
  shifts: ShiftSpec[];
  coverageWindows: CoverageWindowSpec[];
  crewQuotas: CrewQuotaSpec[];
};

export type CrewRecord = {
  id: string;
  roleIds: number[];
  shiftStartMin: number;
  shiftEndMin: number;
};

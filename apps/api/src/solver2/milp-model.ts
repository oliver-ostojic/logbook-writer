// High-level CP-SAT model builder scaffolding. In production this module will wire
// into the real OR-Tools bindings; for now we expose a lightweight in-memory builder
// so tests can verify deterministic variable creation without needing native deps.
import type { PreferenceType } from '@logbook-writer/shared-types';
import type { CoverageConstraintType } from './coverage-constraints';
import type { CoverageConstraint } from './coverage-constraints';
import type { RoleSlotVariable } from './role-slot-variables';
import type { ConsecutivePenaltySource } from './consecutive-policy-penalties';

export interface VariableHandle {
  key: string;
  cpVar: InMemoryBoolVar;
}

export interface BuildModelResult {
  model: InMemoryCpModelBuilder;
  variableHandles: Map<string, VariableHandle>;
}

export interface InMemoryConstraintCoefficient {
  key: string;
  cpVar: InMemoryBoolVar;
  coefficient: number;
}

export type ConstraintFamily = 'COVERAGE' | 'ROLE_TOTAL' | 'BLOCK_SIZE' | 'PER_SLOT' | 'CONSECUTIVE';
export type ConstraintRelation = 'EQ' | 'LE' | 'GE';

export interface CoverageConstraintMetadata {
  coverageType: CoverageConstraintType;
  coverage: CoverageConstraint['metadata'];
}

export interface RoleTotalConstraintMetadata {
  roleId: number;
  crewId: string;
  bound: 'MIN' | 'MAX';
  requestedSlots: number;
  availableSlotCount: number;
  isSatisfiableGivenVariables: boolean;
}

export interface BlockSizeConstraintMetadata {
  roleId: number;
  crewId: string;
  blockSize: number;
  blockStartSlot: number;
  slotPair: [number, number];
  slotIndexes: number[];
}

export interface PerSlotConstraintMetadata {
  crewId: string;
  slotIndex: number;
  slotMinute: number;
  variableCount: number;
}

export type ConsecutiveConstraintKind =
  | 'REQUIRED_BRIDGE'
  | 'REQUIRED_GAP'
  | 'PREFERRED_GAP_POSITIVE'
  | 'PREFERRED_GAP_NEGATIVE';

export interface ConsecutiveConstraintMetadata {
  crewId: string;
  roleId: number;
  kind: ConsecutiveConstraintKind;
  slotIndexes: number[];
  source?: ConsecutivePenaltySource;
  rolePreferenceId?: number;
  preferenceType?: PreferenceType;
}

export type ConstraintMetadata =
  | CoverageConstraintMetadata
  | RoleTotalConstraintMetadata
  | BlockSizeConstraintMetadata
  | PerSlotConstraintMetadata
  | ConsecutiveConstraintMetadata;

export interface InMemoryLinearConstraint {
  family: ConstraintFamily;
  relation: ConstraintRelation;
  metadata: ConstraintMetadata;
  rhs: number;
  coefficients: InMemoryConstraintCoefficient[];
}

export type ObjectiveTermFamily = 'CONSECUTIVE' | 'PREFERENCE' | 'FAIRNESS';

export interface ConsecutiveObjectiveMetadata {
  crewId: string;
  roleId: number;
  slotPair: [number, number];
  source?: ConsecutivePenaltySource;
  rolePreferenceId?: number;
  preferenceType?: PreferenceType;
}

export type PreferenceObjectiveKind = 'FIRST_HOUR' | 'FAVORITE' | 'TIMING' | 'CONSECUTIVE';

export interface PreferenceObjectiveMetadata {
  kind: PreferenceObjectiveKind;
  crewId: string;
  roleId: number | null;
  slotIndex?: number;
  slotPair?: [number, number];
  preferenceType: PreferenceType;
  rolePreferenceId: number;
  normalizedPosition?: number;
  timingPreference?: 'EARLY' | 'LATE';
}

export interface FairnessObjectiveMetadata {
  crewId: string;
  roleId: number;
  surplusMinutes: number;
  averageMinutes: number;
  lookbackDays: number;
  zScore: number;
}

export type ObjectiveTermMetadata =
  | ConsecutiveObjectiveMetadata
  | PreferenceObjectiveMetadata
  | FairnessObjectiveMetadata;

export interface ObjectiveTerm {
  family: ObjectiveTermFamily;
  metadata: ObjectiveTermMetadata;
  coefficient: number;
  key: string;
  cpVar: InMemoryBoolVar;
}

export class InMemoryBoolVar {
  constructor(public readonly name: string) {}
}

export class InMemoryCpModelBuilder {
  private variables: Map<string, InMemoryBoolVar> = new Map();
  private constraints: InMemoryLinearConstraint[] = [];
  private objectiveTerms: ObjectiveTerm[] = [];

  newBoolVar(name: string): InMemoryBoolVar {
    const existing = this.variables.get(name);
    if (existing) {
      return existing;
    }
    const variable = new InMemoryBoolVar(name);
    this.variables.set(name, variable);
    return variable;
  }

  getAllVariables(): InMemoryBoolVar[] {
    return [...this.variables.values()];
  }

  addLinearConstraint(constraint: InMemoryLinearConstraint): void {
    this.constraints.push(constraint);
  }

  getAllConstraints(): InMemoryLinearConstraint[] {
    return [...this.constraints];
  }

  addObjectiveTerm(term: ObjectiveTerm): void {
    this.objectiveTerms.push(term);
  }

  getObjectiveTerms(): ObjectiveTerm[] {
    return [...this.objectiveTerms];
  }
}

function variableKey(variable: RoleSlotVariable): string {
  return `${variable.roleId}:${variable.crewId}:${variable.slotIndex}`;
}

// Create a bool var per role-slot variable and return the handles + model so
// downstream constraint builders can reference consistent CP-SAT variables.
export function buildCoverageModel(roleSlotVariables: RoleSlotVariable[]): BuildModelResult {
  const model = new InMemoryCpModelBuilder();
  const handles = new Map<string, VariableHandle>();

  for (const variable of roleSlotVariables) {
    const key = variableKey(variable);
    const cpVar = model.newBoolVar(key);
    handles.set(key, { key, cpVar });
  }

  return { model, variableHandles: handles };
}

export function getVariableHandleKey(variable: RoleSlotVariable): string {
  return variableKey(variable);
}

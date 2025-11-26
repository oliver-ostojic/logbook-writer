/**
 * Constraint Analysis Tool
 * 
 * Analyzes any schedule (manual or automated) to determine which constraints
 * are satisfied or violated. This is the core validation tool.
 */

import type { 
  HistoricalAssignment,
  HistoricalConstraintAnalysis
} from '@logbook-writer/shared-types/src/constraint-testing';
import type { 
  SolverInput,
  SolverOutput,
  TaskAssignment 
} from '@logbook-writer/shared-types/src/solver';

/**
 * Convert solver output assignments to historical assignment format
 */
export function solverToHistoricalAssignments(
  output: SolverOutput,
  crewNameMap: Map<string, string>
): HistoricalAssignment[] {
  if (!output.assignments) return [];
  
  return output.assignments.map(a => ({
    crewId: a.crewId,
    crewName: crewNameMap.get(a.crewId) || a.crewId,
    role: a.taskType,
    startMinutes: a.startTime,
    endMinutes: a.endTime
  }));
}

/**
 * Analyze a schedule against constraints to produce detailed violation report
 */
export function analyzeConstraintSatisfaction(
  assignments: HistoricalAssignment[],
  solverInput: SolverInput
): HistoricalConstraintAnalysis {
  
  const analysis: HistoricalConstraintAnalysis = {
    assignmentsOutsideStoreHours: 0,
    shiftsRequiringBreakWithoutBreak: 0,
    breaksOutsideWindow: 0,
    hourlyConstraintsViolated: [],
    windowConstraintsViolated: [],
    dailyConstraintsViolated: [],
    roleNonConsecutiveViolations: [],
    slotSizeViolations: [],
    preferencesSatisfied: 0,
    totalPreferences: 0,
    satisfactionScore: 0
  };

  const { store, crew, hourlyRequirements, coverageWindows, crewRoleRequirements, roleMetadata } = solverInput;

  // Check 1: Assignments outside store hours
  assignments.forEach(assignment => {
    const role = roleMetadata?.find(r => r.role === assignment.role);
    const allowOutside = role?.allowOutsideStoreHours || false;
    
    if (!allowOutside) {
      if (assignment.startMinutes < store.openMinutesFromMidnight ||
          assignment.endMinutes > store.closeMinutesFromMidnight) {
        analysis.assignmentsOutsideStoreHours++;
      }
    }
  });

  // Check 2: Break policy violations
  crew.forEach(crewMember => {
    const shiftLength = crewMember.shiftEndMin - crewMember.shiftStartMin;
    
    if (shiftLength >= store.reqShiftLengthForBreak && crewMember.canBreak) {
      // This crew should have a break
      const breaks = assignments.filter(a => 
        a.crewId === crewMember.id && a.role === 'MEAL_BREAK'
      );
      
      if (breaks.length === 0) {
        analysis.shiftsRequiringBreakWithoutBreak++;
      } else {
        // Check if break is in the window
        const breakStart = breaks[0].startMinutes;
        const breakOffset = breakStart - crewMember.shiftStartMin;
        
        if (breakOffset < store.breakWindowStart || breakOffset > store.breakWindowEnd) {
          analysis.breaksOutsideWindow++;
        }
      }
    }
  });

  // Check 3: Hourly constraints
  hourlyRequirements.forEach(req => {
    const hour = req.hour;
    const startMin = hour * 60;
    const endMin = (hour + 1) * 60;
    
    // Check REGISTER
    if (req.requiredRegister > 0) {
      const actualRegister = countCrewAtHour(assignments, 'REGISTER', startMin, endMin);
      if (actualRegister !== req.requiredRegister) {
        analysis.hourlyConstraintsViolated.push({
          hour,
          role: 'REGISTER',
          required: req.requiredRegister,
          actual: actualRegister
        });
      }
    }
    
    // Check PRODUCT
    if (req.requiredProduct > 0) {
      const actualProduct = countCrewAtHour(assignments, 'PRODUCT', startMin, endMin);
      if (actualProduct !== req.requiredProduct) {
        analysis.hourlyConstraintsViolated.push({
          hour,
          role: 'PRODUCT',
          required: req.requiredProduct,
          actual: actualProduct
        });
      }
    }
    
    // Check PARKING_HELM
    if (req.requiredParkingHelm > 0) {
      const actualParking = countCrewAtHour(assignments, 'PARKING_HELM', startMin, endMin);
      if (actualParking !== req.requiredParkingHelm) {
        analysis.hourlyConstraintsViolated.push({
          hour,
          role: 'PARKING_HELM',
          required: req.requiredParkingHelm,
          actual: actualParking
        });
      }
    }
  });

  // Check 4: Coverage window constraints
  coverageWindows.forEach(window => {
    for (let hour = window.startHour; hour < window.endHour; hour++) {
      const startMin = hour * 60;
      const endMin = (hour + 1) * 60;
      const actual = countCrewAtHour(assignments, window.role, startMin, endMin);
      
      if (actual !== window.requiredPerHour) {
        analysis.windowConstraintsViolated.push({
          startHour: window.startHour,
          endHour: window.endHour,
          role: window.role,
          required: window.requiredPerHour,
          actual
        });
        break; // Only report once per window
      }
    }
  });

  // Check 5: Daily crew role requirements
  crewRoleRequirements.forEach(req => {
    const crewAssignments = assignments.filter(a => 
      a.crewId === req.crewId && a.role === req.role
    );
    
    const actualMinutes = crewAssignments.reduce((sum, a) => 
      sum + (a.endMinutes - a.startMinutes), 0
    );
    const actualHours = actualMinutes / 60;
    
    if (Math.abs(actualHours - req.requiredHours) > 0.01) {
      const crewName = crew.find(c => c.id === req.crewId)?.name || req.crewId;
      analysis.dailyConstraintsViolated.push({
        crewId: req.crewId,
        crewName,
        role: req.role,
        requiredHours: req.requiredHours,
        actualHours
      });
    }
  });

  // Check 6: Consecutive role violations
  roleMetadata?.forEach(meta => {
    if (meta.slotsMustBeConsecutive) {
      crew.forEach(crewMember => {
        const roleAssignments = assignments
          .filter(a => a.crewId === crewMember.id && a.role === meta.role)
          .sort((a, b) => a.startMinutes - b.startMinutes);
        
        if (roleAssignments.length > 1) {
          // Check if all assignments form one continuous block
          let fragments = 1;
          for (let i = 1; i < roleAssignments.length; i++) {
            if (roleAssignments[i].startMinutes !== roleAssignments[i-1].endMinutes) {
              fragments++;
            }
          }
          
          if (fragments > 1) {
            analysis.roleNonConsecutiveViolations.push({
              crewId: crewMember.id,
              crewName: crewMember.name,
              role: meta.role,
              fragmentCount: fragments
            });
          }
        }
      });
    }
  });

  // Check 7: Min/max slot size violations
  roleMetadata?.forEach(meta => {
    if (meta.minSlots || meta.maxSlots) {
      crew.forEach(crewMember => {
        const roleAssignments = assignments
          .filter(a => a.crewId === crewMember.id && a.role === meta.role)
          .sort((a, b) => a.startMinutes - b.startMinutes);
        
        // Find continuous blocks
        const blocks: Array<{start: number, end: number, slots: number}> = [];
        let currentBlock: {start: number, end: number} | null = null;
        
        roleAssignments.forEach(a => {
          if (!currentBlock) {
            currentBlock = { start: a.startMinutes, end: a.endMinutes };
          } else if (a.startMinutes === currentBlock.end) {
            currentBlock.end = a.endMinutes;
          } else {
            if (currentBlock) {
              blocks.push({
                start: currentBlock.start,
                end: currentBlock.end,
                slots: (currentBlock.end - currentBlock.start) / store.baseSlotMinutes
              });
            }
            currentBlock = { start: a.startMinutes, end: a.endMinutes };
          }
        });
        
        if (currentBlock) {
          blocks.push({
            start: currentBlock.start,
            end: currentBlock.end,
            slots: (currentBlock.end - currentBlock.start) / store.baseSlotMinutes
          });
        }
        
        // Check each block
        blocks.forEach(block => {
          if ((meta.minSlots && block.slots < meta.minSlots) ||
              (meta.maxSlots && block.slots > meta.maxSlots)) {
            analysis.slotSizeViolations.push({
              crewId: crewMember.id,
              crewName: crewMember.name,
              role: meta.role,
              blockSlots: block.slots,
              minSlots: meta.minSlots || 0,
              maxSlots: meta.maxSlots || 999
            });
          }
        });
      });
    }
  });

  // TODO: Preference satisfaction analysis
  // This requires crew preferences which are in the database, not in solverInput
  // Will need to be passed separately or queried

  return analysis;
}

/**
 * Helper: Count how many crew are assigned to a role during a time period
 */
function countCrewAtHour(
  assignments: HistoricalAssignment[],
  role: string,
  startMin: number,
  endMin: number
): number {
  const crewSet = new Set<string>();
  
  assignments.forEach(a => {
    if (a.role === role) {
      // Check if assignment overlaps with the hour
      if (a.startMinutes < endMin && a.endMinutes > startMin) {
        crewSet.add(a.crewId);
      }
    }
  });
  
  return crewSet.size;
}

/**
 * Generate a human-readable summary of constraint violations
 */
export function summarizeAnalysis(analysis: HistoricalConstraintAnalysis): string {
  const lines: string[] = [];
  
  lines.push('CONSTRAINT ANALYSIS SUMMARY');
  lines.push('═'.repeat(60));
  
  const totalViolations = 
    analysis.assignmentsOutsideStoreHours +
    analysis.shiftsRequiringBreakWithoutBreak +
    analysis.breaksOutsideWindow +
    analysis.hourlyConstraintsViolated.length +
    analysis.windowConstraintsViolated.length +
    analysis.dailyConstraintsViolated.length +
    analysis.roleNonConsecutiveViolations.length +
    analysis.slotSizeViolations.length;
  
  if (totalViolations === 0) {
    lines.push('✓ All constraints satisfied!');
  } else {
    lines.push(`✗ Found ${totalViolations} constraint violations:\n`);
    
    if (analysis.assignmentsOutsideStoreHours > 0) {
      lines.push(`  • ${analysis.assignmentsOutsideStoreHours} assignments outside store hours`);
    }
    
    if (analysis.shiftsRequiringBreakWithoutBreak > 0) {
      lines.push(`  • ${analysis.shiftsRequiringBreakWithoutBreak} shifts missing required breaks`);
    }
    
    if (analysis.breaksOutsideWindow > 0) {
      lines.push(`  • ${analysis.breaksOutsideWindow} breaks outside allowed window`);
    }
    
    if (analysis.hourlyConstraintsViolated.length > 0) {
      lines.push(`  • ${analysis.hourlyConstraintsViolated.length} hourly staffing violations`);
      analysis.hourlyConstraintsViolated.slice(0, 3).forEach(v => {
        lines.push(`    - Hour ${v.hour} ${v.role}: need ${v.required}, have ${v.actual}`);
      });
      if (analysis.hourlyConstraintsViolated.length > 3) {
        lines.push(`    ... and ${analysis.hourlyConstraintsViolated.length - 3} more`);
      }
    }
    
    if (analysis.windowConstraintsViolated.length > 0) {
      lines.push(`  • ${analysis.windowConstraintsViolated.length} coverage window violations`);
      analysis.windowConstraintsViolated.slice(0, 3).forEach(v => {
        lines.push(`    - ${v.role} ${v.startHour}-${v.endHour}: need ${v.required}, have ${v.actual}`);
      });
    }
    
    if (analysis.dailyConstraintsViolated.length > 0) {
      lines.push(`  • ${analysis.dailyConstraintsViolated.length} daily role hour violations`);
      analysis.dailyConstraintsViolated.slice(0, 3).forEach(v => {
        lines.push(`    - ${v.crewName} ${v.role}: need ${v.requiredHours}h, have ${v.actualHours.toFixed(1)}h`);
      });
    }
    
    if (analysis.roleNonConsecutiveViolations.length > 0) {
      lines.push(`  • ${analysis.roleNonConsecutiveViolations.length} consecutive role violations`);
      analysis.roleNonConsecutiveViolations.slice(0, 3).forEach(v => {
        lines.push(`    - ${v.crewName} ${v.role}: fragmented into ${v.fragmentCount} blocks`);
      });
    }
    
    if (analysis.slotSizeViolations.length > 0) {
      lines.push(`  • ${analysis.slotSizeViolations.length} slot size violations`);
      analysis.slotSizeViolations.slice(0, 3).forEach(v => {
        lines.push(`    - ${v.crewName} ${v.role}: ${v.blockSlots} slots (need ${v.minSlots}-${v.maxSlots})`);
      });
    }
  }
  
  lines.push('═'.repeat(60));
  
  if (analysis.totalPreferences > 0) {
    const satPct = (analysis.preferencesSatisfied / analysis.totalPreferences * 100).toFixed(1);
    lines.push(`Preferences: ${analysis.preferencesSatisfied}/${analysis.totalPreferences} satisfied (${satPct}%)`);
    lines.push(`Satisfaction score: ${analysis.satisfactionScore.toFixed(2)}`);
  }
  
  return lines.join('\n');
}

/**
 * Role Rule Template System
 *
 * This module provides a declarative template system for rendering role rules
 * as human-readable sentences with styled components.
 *
 * Syntax:
 * - {path.to.field}           - Plain variable interpolation
 * - {@bubble path.to.field}   - Variable rendered as styled bubble
 * - {transformer:path}        - Variable with transformer applied
 * - {@bubble transformer:path} - Bubble with transformer
 *
 * @example
 * Template: 'Prefers {@bubble role.displayName} {timing:crewRoleRule.valueInt} in shift'
 * Output: [
 *   { type: 'text', content: 'Prefers' },
 *   { type: 'bubble', content: 'Register' },
 *   { type: 'text', content: 'earlier in shift' }
 * ]
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * A transformer function that converts a raw value to a display string.
 * Used for computed/derived values like timing labels or ordinals.
 */
export type ValueTransformer = (value: number | null) => string;

/**
 * A parsed segment of a template.
 * After parsing, a template becomes an array of these segments.
 */
export type TemplatePart =
  | { type: 'text'; content: string }
  | { type: 'bubble'; content: string };

/**
 * Template definition for a single RoleRuleType.
 */
export interface RoleRuleTemplate {
  /**
   * The template string with variable placeholders.
   */
  template: string;

  /**
   * Optional description of what this rule type means.
   * Used for tooltips or help text.
   */
  description?: string;
}

/**
 * Registry mapping RoleRuleType enum values to their templates.
 */
export type RoleRuleTemplateRegistry = Record<string, RoleRuleTemplate>;

/**
 * Registry mapping transformer names to their functions.
 */
export type TransformerRegistry = Record<string, ValueTransformer>;

/**
 * Context object passed to the template parser.
 * Contains all data available for variable resolution.
 */
export interface TemplateContext {
  /** The RoleRule record */
  roleRule: {
    id: number;
    type: string;
    constraintType: string;
    displayName: string | null;
    description: string | null;
  };

  /** The Role that owns this rule */
  role: {
    id: number;
    code: string;
    displayName: string;
  };

  /** The target Role (for rules like CANNOT_BE_ASSIGNED_BEFORE) */
  targetRole: {
    id: number;
    code: string;
    displayName: string;
  } | null;

  /** The CrewRoleRule junction record (contains valueInt, isPriority) */
  crewRoleRule?: {
    id: number;
    isPriority: boolean;
    valueInt: number | null;
  };

  /** The StoreRoleRule junction record (contains valueInt, isPriority) - alternative to crewRoleRule */
  storeRoleRule?: {
    id: number;
    isPriority: boolean;
    valueInt: number | null;
  };
}

// ============================================================================
// Transformers
// ============================================================================

/**
 * Built-in transformers for common value conversions.
 */
export const TRANSFORMERS: TransformerRegistry = {
  /**
   * Converts timing valueInt to human-readable position.
   * -1 => "earlier", 0 => "in the middle", 1 => "later"
   */
  timing: (value: number | null): string => {
    if (value === null) return '';
    if (value === -1) return 'earlier';
    if (value === 0) return 'in the middle';
    if (value === 1) return 'later';
    return String(value);
  },

  /**
   * Converts distribution valueInt to human-readable preference.
   * -1 => "more than" (more of main role), 0 => "balanced with", 1 => "less than" (more of target role)
   */
  distribution: (value: number | null): string => {
    if (value === null) return '';
    if (value === -1) return 'more than';
    if (value === 0) return 'balanced with';
    if (value === 1) return 'less than';
    return String(value);
  },

  /**
   * Converts hour index to ordinal (0-indexed).
   * 0 => "first", 1 => "second", etc.
   */
  ordinal: (value: number | null): string => {
    if (value === null) return '';
    const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
    return ordinals[value] ?? `${value + 1}th`;
  },

  /**
   * Converts store hour in minutes to 12-hour format.
   * 480 => "8:00 AM", 840 => "2:00 PM"
   */
  storeHour: (value: number | null): string => {
    if (value === null) return '';
    // Convert minutes to hours (e.g., 540 minutes = 9 hours = 9:00 AM)
    const hours = Math.floor(value / 60);
    const hour12 = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
    const suffix = hours >= 12 ? 'PM' : 'AM';
    return `${hour12}:00 ${suffix}`;
  },
};

// ============================================================================
// Template Registry
// ============================================================================

/**
 * Template registry for all RoleRuleTypes.
 * Add new rule types here - no parser changes needed.
 */
export const ROLE_RULE_TEMPLATES: RoleRuleTemplateRegistry = {
  // === Ordering constraints ===
  CANNOT_BE_ASSIGNED_BEFORE: {
    template: '{@bubble role.displayName} cannot be assigned before {@bubble targetRole.displayName}',
    description: 'This role must be scheduled before the target role',
  },

  CANNOT_BE_ASSIGNED_AFTER: {
    template: '{@bubble role.displayName} cannot be assigned after {@bubble targetRole.displayName}',
    description: 'This role must be scheduled after the target role',
  },

  // === Duration constraints ===
  MIN_CONSECUTIVE_MINUTES: {
    template: 'Cannot work more than {@bubble crewRoleRule.valueInt} minutes consecutively on {@bubble role.displayName}',
    description: 'Minimum uninterrupted time required on this role',
  },

  MAX_CONSECUTIVE_MINUTES: {
    template: 'Cannot work less than {@bubble crewRoleRule.valueInt} minutes consecutively on {@bubble role.displayName}',
    description: 'Maximum uninterrupted time allowed on this role',
  },

  // === Access restrictions ===
  FORBID_ROLE: {
    template: 'Cannot be assigned {@bubble role.displayName}',
    description: 'Crew member is not allowed to work this role',
  },

  MIN_SHIFT_LENGTH_FOR_ACCESS: {
    template: 'Minimum shift length required for {@bubble role.displayName} is {@bubble crewRoleRule.valueInt} minutes.',
    description: 'Crew must have a minimum shift length to access this role',
  },

  // === Timing preferences ===
  TIMING: {
    template: 'Prefers working {@bubble role.displayName} {@bubble timing:crewRoleRule.valueInt} in shift.',
    description: 'Crew member prefers this role at a specific time in their shift',
  },

  LIKE_ROLE_FOR_HOUR_X: {
    template: '{@bubble ordinal:crewRoleRule.valueInt} hour preference is {@bubble role.displayName}',
    description: 'Crew member prefers this role during a specific hour of their shift',
  },

  DISLIKE_ROLE_FOR_HOUR_X: {
    template: 'Dislike working {@bubble role.displayName} for the {@bubble ordinal:crewRoleRule.valueInt} hour of shift',
    description: 'Crew member prefers to avoid this role during a specific hour',
  },

  // === Shift-relative timing ===
  ASSIGN_BEFORE_SHIFT_MIN_X: {
    template: '{@bubble role.displayName} cannot be assigned after the first {@bubble crewRoleRule.valueInt} minutes into a shift.',
    description: 'Role must be assigned early in the shift',
  },

  ASSIGN_AFTER_SHIFT_MIN_X: {
    template: '{@bubble role.displayName} cannot be assigned during the first {@bubble crewRoleRule.valueInt} minutes of a shift.',
    description: 'Role must be assigned later in the shift',
  },

  CANNOT_ASSIGN_DURING_STORE_HOUR_X: {
    template: 'Cannot assign {@bubble role.displayName} during store hour {@bubble storeHour:crewRoleRule.valueInt}',
    description: 'Role cannot be assigned during a specific store hour',
  },

  // === Capacity constraints ===
  MAX_CREW_ON_AT_A_TIME: {
    template: 'Max {@bubble crewRoleRule.valueInt} crew on {@bubble role.displayName} at a time',
    description: 'Maximum number of crew that can work this role simultaneously',
  },

  // === Distribution preferences ===
  DISTRIBUTION_BETWEEN_ROLE_X: {
    template: 'Prefers working {@bubble role.displayName} {@bubble distribution:crewRoleRule.valueInt} {@bubble targetRole.displayName}',
    description: 'Preference for time distribution between two roles',
  },

  // === Scheduling flexibility ===
  ALLOW_HALF_BLOCKSIZE: {
    template: 'Allow half task-lengths for {@bubble role.displayName}',
    description: 'Permits smaller assignment blocks for scheduling flexibility',
  },
};

// ============================================================================
// Parser Implementation
// ============================================================================

/**
 * Regex to match template variables.
 * Captures: {@bubble}? (transformer:)? path
 *
 * Examples matched:
 * - {role.displayName}
 * - {@bubble role.displayName}
 * - {timing:crewRoleRule.valueInt}
 * - {@bubble timing:crewRoleRule.valueInt}
 */
const VARIABLE_REGEX = /\{(@bubble\s+)?(?:(\w+):)?([a-zA-Z_][a-zA-Z0-9_.]*)\}/g;

/**
 * Resolves a dot-path against a context object.
 * For crewRoleRule paths, automatically falls back to storeRoleRule if crewRoleRule doesn't exist.
 *
 * @example
 * resolvePath('role.displayName', context) => 'Register'
 * resolvePath('crewRoleRule.valueInt', context) => 30 (or from storeRoleRule.valueInt)
 */
function resolvePath(path: string, context: TemplateContext): unknown {
  const parts = path.split('.');
  let current: any = context;

  // Special handling for crewRoleRule - fall back to storeRoleRule
  if (parts[0] === 'crewRoleRule') {
    if (!context.crewRoleRule && context.storeRoleRule) {
      // Use storeRoleRule as fallback
      current = context.storeRoleRule;
      // Skip the first part since we've already resolved it
      for (let i = 1; i < parts.length; i++) {
        if (current === null || current === undefined) {
          return undefined;
        }
        current = current[parts[i]];
      }
      return current;
    }
  }

  // Normal path resolution
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Parses a template string into an array of renderable parts.
 *
 * @param template - The template string with variable placeholders
 * @param context - The data context for variable resolution
 * @param transformers - Registry of transformer functions
 * @returns Array of parts ready for rendering
 */
export function parseTemplate(
  template: string,
  context: TemplateContext,
  transformers: TransformerRegistry = TRANSFORMERS
): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let isFirstPart = true;

  // Reset regex state
  VARIABLE_REGEX.lastIndex = 0;

  while ((match = VARIABLE_REGEX.exec(template)) !== null) {
    const [fullMatch, bubbleMarker, transformerName, path] = match;
    const isBubble = Boolean(bubbleMarker?.trim());

    // Add any text before this match
    if (match.index > lastIndex) {
      let textContent = template.slice(lastIndex, match.index).trim();
      if (textContent) {
        // Capitalize first word of sentence
        if (isFirstPart) {
          textContent = textContent.charAt(0).toUpperCase() + textContent.slice(1);
          isFirstPart = false;
        }
        parts.push({ type: 'text', content: textContent });
      }
    }

    // Resolve the variable value
    let rawValue = resolvePath(path, context);

    // Apply transformer if specified
    let displayValue: string;
    if (transformerName && transformers[transformerName]) {
      displayValue = transformers[transformerName](rawValue as number | null);
    } else {
      // For missing intVal (null/undefined), use placeholder 'x' if it's a bubble
      if ((rawValue === null || rawValue === undefined) && isBubble) {
        displayValue = 'x';
      } else {
        displayValue = rawValue?.toString() ?? '';
      }
    }

    // Add the resolved part
    if (displayValue) {
      // Capitalize first bubble if it's the first part
      let finalDisplayValue = displayValue;
      if (isFirstPart && isBubble) {
        finalDisplayValue = displayValue.charAt(0).toUpperCase() + displayValue.slice(1);
        isFirstPart = false;
      } else if (isFirstPart && !isBubble) {
        finalDisplayValue = displayValue.charAt(0).toUpperCase() + displayValue.slice(1);
        isFirstPart = false;
      }

      parts.push({
        type: isBubble ? 'bubble' : 'text',
        content: finalDisplayValue,
      });
    }

    lastIndex = match.index + fullMatch.length;
  }

  // Add any remaining text after the last match
  if (lastIndex < template.length) {
    let textContent = template.slice(lastIndex).trim();
    if (textContent) {
      // Capitalize first word if this is the only/first text
      if (isFirstPart) {
        textContent = textContent.charAt(0).toUpperCase() + textContent.slice(1);
      }
      parts.push({ type: 'text', content: textContent });
    }
  }

  return parts;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Renders a role rule as an array of styled parts.
 *
 * @param ruleType - The RoleRuleType enum value (e.g., 'TIMING', 'MIN_CONSECUTIVE_MINUTES')
 * @param context - The data context containing role, targetRole, crewRoleRule
 * @returns Array of parts for rendering, or null if no template found
 *
 * @example
 * const parts = renderRoleRule('TIMING', {
 *   roleRule: { id: 1, type: 'TIMING', constraintType: 'SOFT', displayName: null },
 *   role: { id: 10, code: 'REG', displayName: 'Register' },
 *   targetRole: null,
 *   crewRoleRule: { id: 100, isPriority: false, valueInt: -1 },
 * });
 * // Returns: [
 * //   { type: 'text', content: 'Prefers' },
 * //   { type: 'bubble', content: 'Register' },
 * //   { type: 'text', content: 'earlier in shift' },
 * // ]
 */
export function renderRoleRule(
  ruleType: string,
  context: TemplateContext
): TemplatePart[] | null {
  const templateDef = ROLE_RULE_TEMPLATES[ruleType];

  if (!templateDef) {
    // Fallback: no template defined for this rule type
    console.warn(`No template defined for RoleRuleType: ${ruleType}`);
    return null;
  }

  return parseTemplate(templateDef.template, context, TRANSFORMERS);
}

/**
 * Gets the description for a rule type (for tooltips/help).
 */
export function getRoleRuleDescription(ruleType: string): string | undefined {
  return ROLE_RULE_TEMPLATES[ruleType]?.description;
}

export function formatMinutesToReadable(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${mins} min`;
}

export function formatRuleTypeLabel(ruleType: string): string {
  const labels: Record<string, string> = {
    FIRST_HOUR: 'First Hour',
    FAVORITE: 'Favorite',
    CONSECUTIVE: 'Consecutive',
    POSITION_IN_SHIFT: 'Position',
    FORBID_ROLE: 'Avoid Role',
    TIME_ON_ROLE: 'Time On Role',
    MAX_TIME_ON_ROLE: 'Max Time',
    MIN_TIME_ON_ROLE: 'Min Time',
  };
  return labels[ruleType] || ruleType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

export type FairnessTrend =
  | 'significantly_improving'
  | 'improving'
  | 'stable'
  | 'worsening'
  | 'significantly_worsening';

export function calculateFairnessTrend(byDateAverages: any[]): FairnessTrend {
  if (!byDateAverages || byDateAverages.length < 2) {
    return 'stable';
  }

  const values = byDateAverages.map(d => d.avgMinutesPerCrewOnRole);
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = mean > 0 ? (stdDev / mean) * 100 : 0;

  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));
  const firstHalfAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
  const secondHalfAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
  const percentChange = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0;

  if (coefficientOfVariation < 5) {
    return 'stable';
  } else if (coefficientOfVariation < 10) {
    if (percentChange > 10) return 'improving';
    if (percentChange < -10) return 'worsening';
    return 'stable';
  } else if (coefficientOfVariation < 20) {
    if (percentChange > 15) return 'improving';
    if (percentChange < -15) return 'worsening';
    return 'stable';
  } else {
    if (percentChange > 20) return 'significantly_improving';
    if (percentChange < -20) return 'significantly_worsening';
    return 'stable';
  }
}

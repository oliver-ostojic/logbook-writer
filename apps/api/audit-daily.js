const fs = require('fs');
const assigned = JSON.parse(fs.readFileSync('/tmp/assigned_minutes.json'));
const input = JSON.parse(fs.readFileSync('/Users/oliver-ostojic/Desktop/logbook-writer/apps/api/solver_input_v2_768_2025-11-25.json'));

const roleIdToCode = {35: 'SL', 34: 'ART', 30: 'REG', 33: 'PROD', 36: 'BRK', 29: 'P_HELM', 37: 'W_DMO', 38: 'DEMO'};

const results = input.dailyRequirements.map(req => {
  const roleCode = roleIdToCode[req.roleId] || 'UNKNOWN';
  const crewAssigned = assigned[req.crewId] || {};
  const assignedMinutes = crewAssigned[roleCode] || 0;
  return {
    crewId: req.crewId,
    roleCode,
    required: req.requiredMinutes,
    assigned: assignedMinutes,
    diff: assignedMinutes - req.requiredMinutes,
    match: assignedMinutes === req.requiredMinutes
  };
});

console.log('Daily Requirement Audit:');
console.log('Matches:', results.filter(r => r.match).length);
console.log('Mismatches:', results.filter(r => !r.match).length);
console.log('\nMismatches:');
results.filter(r => !r.match).forEach(r => console.log(r));

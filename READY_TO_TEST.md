# Satisfaction Tuning - Ready to Test! 🚀

**Date**: November 21, 2025  
**Status**: ✅ All crew weights randomized, ready for tuning experiments

---

## 📊 **Current Setup**

### **94 Crew Members - Randomized Weight Distribution**

Each crew member has been assigned a **unique random permutation** of weights 1-5 across their 5 preference dimensions:

1. **First Hour Weight** (prefFirstHourWeight)
2. **Task Weight** (prefTaskWeight)  
3. **Break Timing Weight** (prefBreakTimingWeight)
4. **Consecutive Product Weight** (consecutiveProdWeight)
5. **Consecutive Register Weight** (consecutiveRegWeight)

### **Weight Distribution (roughly even)**

| Weight | First Hour | Task | Break Timing | Consec. Prod | Consec. Reg |
|--------|------------|------|--------------|--------------|-------------|
| **1**  | 24 (25.5%) | 20 (21.3%) | 18 (19.1%) | 16 (17.0%) | 16 (17.0%) |
| **2**  | 20 (21.3%) | 14 (14.9%) | 21 (22.3%) | 24 (25.5%) | 15 (16.0%) |
| **3**  | 16 (17.0%) | 19 (20.2%) | 26 (27.7%) | 13 (13.8%) | 20 (21.3%) |
| **4**  | 18 (19.1%) | 23 (24.5%) | 12 (12.8%) | 21 (22.3%) | 20 (21.3%) |
| **5**  | 16 (17.0%) | 18 (19.1%) | 17 (18.1%) | 20 (21.3%) | 23 (24.5%) |

**Perfect for testing!** No systematic bias, all weights evenly distributed.

---

## ⚙️ **Active Satisfaction Tuning Configuration**

### **1. Exponential Weight Scaling** ✅
```
Strategy: exponential
Base: 2.5

Weight 1 → 2.50 points
Weight 2 → 6.25 points  
Weight 3 → 15.63 points
Weight 4 → 39.06 points (HARD CONSTRAINT)
Weight 5 → 97.66 points (SUPER HARD CONSTRAINT!)
```
**Impact**: Weight 5 is **39x** more powerful than weight 1!

### **2. Fairness Constraints** ✅
```
Min Satisfaction: 30% per crew member
Max Variance: 25%
Violation Penalty: 1,000 points
```
**Impact**: No crew member can be consistently ignored.

### **3. Adaptive Boosting** ✅
```
Enabled: true
Boost Unsatisfied: 1.5x multiplier
Damp Over-Satisfied: 0.7x multiplier
History Window: 14 days
```
**Impact**: Underserved crew get preference boosts over time.

### **4. Preference Banking** ✅
```
Enabled: true
Strategy: rotation (7-day cycle)
Expiry: 30 days
```
**Impact**: Unmet preferences saved and prioritized later.

---

## 🧪 **Ready for Testing Scenarios**

### **Scenario 1: Pure Exponential Scaling**
Test how much impact the weight differences make:

```bash
# Run solver and track satisfaction by weight
# Expected: Weight-5 preferences satisfied ~95%
#          Weight-4 preferences satisfied ~80%
#          Weight-3 preferences satisfied ~60%
#          Weight-2 preferences satisfied ~40%
#          Weight-1 preferences satisfied ~25%
```

### **Scenario 2: Fairness Enforcement**
Test minimum satisfaction guarantees:

```bash
# Expected: Even weight-1 crew get ≥30% satisfaction
#          No variance > 25% between highest/lowest
```

### **Scenario 3: Adaptive Rotation (Multi-Week)**
Test historical tracking and boosting:

```bash
# Week 1: Some crew get high satisfaction
# Week 2: Those crew dampened (-30%), others boosted (+50%)
# Week 3: Fair rotation continues
```

### **Scenario 4: Conflict Banking**
Test preference rollover:

```bash
# Schedule 1: Crew A wants PRODUCT-5, but can't get it → Banked
# Schedule 2: Crew A's banked preference prioritized → Satisfied
```

---

## 🎯 **Testing Commands**

### **View Current Weight Distribution**
```bash
cd /Users/oliver-ostojic/Desktop/logbook-writer/apps/api
pnpm tsx << 'EOF'
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const crew = await prisma.crew.findMany({
  select: { name: true, prefFirstHourWeight: true, prefTaskWeight: true, 
           prefBreakTimingWeight: true, consecutiveProdWeight: true, 
           consecutiveRegWeight: true },
  orderBy: { name: 'asc' },
  take: 10
});

crew.forEach(c => {
  console.log(`${c.name}: [${c.prefFirstHourWeight}, ${c.prefTaskWeight}, ${c.prefBreakTimingWeight}, ${c.consecutiveProdWeight}, ${c.consecutiveRegWeight}]`);
});
await prisma.$disconnect();
EOF
```

### **Test All 4 Features**
```bash
pnpm test:satisfaction
```

### **Re-randomize Weights (if needed)**
```bash
pnpm weights:randomize
```

### **Check Database Tracking Tables**
```sql
-- Check banked preferences
SELECT COUNT(*) FROM "BankedPreference" WHERE status = 'ACTIVE';

-- Check satisfaction history
SELECT COUNT(*) FROM "PreferenceSatisfaction";
```

---

## 📈 **Sample Crew Examples**

Here are a few crew members with their randomized weights:

```
Abby Stapleton:     [3, 4, 1, 2, 5]  (Break=1 least important, ConsecReg=5 most)
Adam Carey:         [1, 4, 5, 2, 3]  (FirstHour=1 least, BreakTiming=5 most)
Adam Levi:          [4, 2, 3, 5, 1]  (ConsecReg=1 least, ConsecProd=5 most)
Adrian Pena:        [2, 1, 3, 4, 5]  (Task=1 least, ConsecReg=5 most)
Alexa Adams:        [4, 1, 5, 3, 2]  (Task=1 least, BreakTiming=5 most)
```

**Perfect variety!** Every crew member has different priorities.

---

## 🔬 **What to Track During Tests**

### **1. Satisfaction by Weight**
```sql
SELECT 
  c.prefTaskWeight as weight,
  AVG(
    CASE WHEN ps.taskPrefMet THEN 1.0 ELSE 0.0 END
  ) as satisfaction_rate,
  COUNT(*) as sample_size
FROM PreferenceSatisfaction ps
JOIN Crew c ON c.id = ps.crewId
GROUP BY c.prefTaskWeight
ORDER BY weight DESC;
```

Expected result:
- Weight 5: ~95% satisfaction
- Weight 4: ~80% satisfaction  
- Weight 3: ~60% satisfaction
- Weight 2: ~40% satisfaction
- Weight 1: ~25% satisfaction

### **2. Fairness Metrics**
```sql
SELECT 
  MIN(overallSatisfaction) as min_satisfaction,
  MAX(overallSatisfaction) as max_satisfaction,
  MAX(overallSatisfaction) - MIN(overallSatisfaction) as variance,
  AVG(overallSatisfaction) as avg_satisfaction
FROM PreferenceSatisfaction
WHERE date = '2025-11-21';
```

Expected result:
- Min satisfaction: ≥ 0.30 (30%)
- Variance: ≤ 0.25 (25%)
- Avg satisfaction: ~0.60-0.70 (60-70%)

### **3. Adaptive Boost Effectiveness**
```sql
-- After running schedules for 2+ weeks
SELECT 
  c.name,
  AVG(ps.overallSatisfaction) as avg_satisfaction,
  MAX(ps.adaptiveBoost) as max_boost_applied
FROM Crew c
JOIN PreferenceSatisfaction ps ON ps.crewId = c.id
WHERE ps.date >= CURRENT_DATE - INTERVAL '14 days'
GROUP BY c.id, c.name
HAVING AVG(ps.overallSatisfaction) < 0.5
ORDER BY avg_satisfaction ASC
LIMIT 10;
```

Expected result:
- Underserved crew should show adaptiveBoost > 1.0
- Next schedule should improve their satisfaction

### **4. Banking Success Rate**
```sql
SELECT 
  COUNT(*) FILTER (WHERE status = 'USED') as satisfied_count,
  COUNT(*) FILTER (WHERE status = 'ACTIVE') as pending_count,
  COUNT(*) FILTER (WHERE status = 'EXPIRED') as expired_count,
  AVG(EXTRACT(EPOCH FROM (usedDate - originalDate))/86400) as avg_days_to_satisfy
FROM BankedPreference;
```

Expected result:
- Most banked preferences should eventually be USED
- Few should EXPIRE
- Avg days to satisfy: ~3-7 days

---

## 🚀 **Next Steps**

1. **Run your solver** with actual crew/role data
2. **Record results** in PreferenceSatisfaction table
3. **Check metrics** using queries above
4. **Adjust tuning** in `.env` if needed:
   - Too slow? Reduce `FAIRNESS_PENALTY`
   - Not fair enough? Increase `MIN_SATISFACTION_PER_CREW`
   - Want stronger preferences? Increase `EXPONENTIAL_BASE`
5. **Iterate** until optimal

---

## 📁 **Files & Commands Reference**

| Command | Description |
|---------|-------------|
| `pnpm test:satisfaction` | Test all 4 tuning features |
| `pnpm weights:randomize` | Re-randomize all crew weights |
| `pnpm weights:auto-tune popularity` | Preview auto-tuning (dry run) |
| `pnpm weights:auto-tune:apply rarity` | Apply auto-tuned weights |

**Config File**: `/apps/api/.env`  
**Test Script**: `/apps/api/test-satisfaction-features.ts`  
**Randomizer**: `/apps/api/randomize-preference-weights.ts`  
**Schema**: `/apps/api/prisma/schema.prisma`

---

**Status**: 🟢 **READY TO BEGIN TUNING EXPERIMENTS!**

Your crew has perfectly randomized weights with no systematic bias.  
All 4 satisfaction features are enabled and tested.  
Database schema supports historical tracking and banking.  

**Let the optimization begin!** 🎯

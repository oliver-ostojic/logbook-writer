# Satisfaction Tuning - Quick Reference

## 🚀 Quick Commands

```bash
# Test all 4 features
pnpm test:satisfaction

# Get tuning recommendations (popularity mode)
curl "http://localhost:4000/tuning/preferences?mode=popularity&min=1&max=4"

# Get tuning recommendations (rarity mode - fairness)
curl "http://localhost:4000/tuning/preferences?mode=rarity&min=1&max=4"

# Clean test data
pnpm db:cleanup-test-data
```

---

## 📊 Current Configuration

| Feature | Status | Key Setting | Value |
|---------|--------|-------------|-------|
| **Exponential Scaling** | ✅ Enabled | `EXPONENTIAL_BASE` | 2.5 (weight 4 = 15.6x weight 1) |
| **Fairness Constraints** | ✅ Enabled | `MIN_SATISFACTION_PER_CREW` | 0.3 (30% minimum) |
| **Adaptive Boosting** | ✅ Enabled | `BOOST_MULTIPLIER` | 1.5 (50% boost) |
| **Preference Banking** | ✅ Enabled | `BANKING_CARRYOVER_DAYS` | 30 days |

---

## 🎯 Your Crew Stats (94 members)

### Popularity Mode Recommendations
- **PRODUCT tasks**: Weight 3 (77% of crew want this)
- **REGISTER tasks**: Weight 2 (18% want this)
- **Late breaks**: Weight 4 (90% want this) ⭐
- **Early breaks**: Weight 1 (4% want this)

### Weight Distribution
```
Weight 1 → 2.50 points
Weight 2 → 6.25 points
Weight 3 → 15.63 points
Weight 4 → 39.06 points (HARD CONSTRAINT)
```

---

## ⚙️ Tuning Adjustments

### Make Strong Preferences Even Stronger
```env
EXPONENTIAL_BASE=3.0  # Weight 4 becomes 27x weight 1
```

### Increase Fairness
```env
MIN_SATISFACTION_PER_CREW=0.4   # 30% → 40%
MAX_SATISFACTION_VARIANCE=0.15  # 25% → 15%
FAIRNESS_PENALTY=2000           # 1000 → 2000
```

### More Aggressive Adaptive Boosting
```env
BOOST_MULTIPLIER=2.0      # 1.5x → 2.0x
DAMP_MULTIPLIER=0.5       # 0.7x → 0.5x
HISTORY_WINDOW_DAYS=21    # 14 → 21 days
```

### Longer Banking Window
```env
BANKING_CARRYOVER_DAYS=60  # 30 → 60 days
```

---

## 📈 Database Queries

### Check Satisfaction History
```sql
SELECT 
  c.name, 
  ps.date,
  ps.overallSatisfaction,
  ps.adaptiveBoost,
  ps.fairnessAdjustment
FROM PreferenceSatisfaction ps
JOIN Crew c ON c.id = ps.crewId
ORDER BY ps.date DESC, ps.overallSatisfaction ASC
LIMIT 20;
```

### Check Banked Preferences
```sql
SELECT 
  c.name,
  bp.preferenceType,
  bp.preferenceValue,
  bp.weight,
  bp.originalDate,
  bp.expiresAt
FROM BankedPreference bp
JOIN Crew c ON c.id = bp.crewId
WHERE bp.status = 'ACTIVE'
ORDER BY bp.originalDate;
```

### Find Underserved Crew
```sql
SELECT 
  c.name,
  AVG(ps.overallSatisfaction) as avg_satisfaction,
  COUNT(*) as schedule_count
FROM Crew c
JOIN PreferenceSatisfaction ps ON ps.crewId = c.id
WHERE ps.date >= CURRENT_DATE - INTERVAL '14 days'
GROUP BY c.id, c.name
HAVING AVG(ps.overallSatisfaction) < 0.5
ORDER BY avg_satisfaction ASC;
```

---

## 🔍 Monitoring

### After Each Schedule Run

1. **Check overall satisfaction**
   ```sql
   SELECT AVG(overallSatisfaction), MIN(overallSatisfaction), MAX(overallSatisfaction)
   FROM PreferenceSatisfaction
   WHERE date = '2025-11-21';
   ```

2. **Identify unfair outcomes**
   ```sql
   SELECT crewId, overallSatisfaction
   FROM PreferenceSatisfaction
   WHERE date = '2025-11-21' AND overallSatisfaction < 0.3;
   ```

3. **Check banked preferences count**
   ```sql
   SELECT COUNT(*), AVG(weight)
   FROM BankedPreference
   WHERE status = 'ACTIVE';
   ```

---

## 🎨 Satisfaction Modes Comparison

| Mode | Philosophy | Weight Strategy | Best For |
|------|------------|-----------------|----------|
| **Popularity** | Maximize total satisfaction | High weight to common preferences | Majority happiness |
| **Rarity** | Protect minorities | High weight to rare preferences | Fairness, equity |

**Current**: Popularity mode with fairness constraints = Best of both worlds

---

## 🚨 Troubleshooting

### Solver Running Too Slow?
```env
# Reduce fairness strictness
MAX_SATISFACTION_VARIANCE=0.3  # 25% → 30%
FAIRNESS_PENALTY=500           # 1000 → 500
```

### Some Crew Never Get Preferences?
```env
# Increase adaptive boost
BOOST_MULTIPLIER=2.0
MIN_SATISFACTION_PER_CREW=0.4
```

### Too Many Banked Preferences?
```env
# Shorten banking window
BANKING_CARRYOVER_DAYS=14
```

---

## 📚 Files

- **Config**: `apps/api/.env`
- **Test Script**: `apps/api/test-satisfaction-features.ts`
- **Results**: `SATISFACTION_TUNING_RESULTS.md`
- **Guide**: `SATISFACTION_TUNING_GUIDE.md`
- **Schema**: `apps/api/prisma/schema.prisma`

---

**Last Updated**: November 21, 2025  
**Status**: 🟢 All features enabled and tested

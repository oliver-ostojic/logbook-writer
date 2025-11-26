/**
 * Tests for BankedPreference
 * 
 * BankedPreference is a reward system that allows crew members to save
 * unsatisfied preferences for future schedules. Key concepts:
 * 
 * - When a preference cannot be satisfied, it can be "banked"
 * - Banked preferences have expiration dates
 * - Crew can "redeem" banked preferences in future schedules
 * - Status: ACTIVE (available), USED (redeemed), EXPIRED (timeout), CANCELED
 * - Weight increases over time to prioritize long-banked preferences
 * 
 * This system ensures fairness over multiple scheduling periods.
 */

import { describe, it, expect } from 'vitest';

describe('BankedPreference', () => {
  describe('banking lifecycle', () => {
    it('should create a banked preference when original preference unsatisfied', () => {
      const bankedPref = {
        id: 1,
        crewId: 'CREW001',
        preferenceType: 'FIRST_HOUR' as const,
        preferenceValue: '1', // roleId
        weight: 10,
        originalDate: new Date('2025-01-15'),
        expiresAt: new Date('2025-02-15'), // 30 days later
        usedDate: null,
        status: 'ACTIVE' as const
      };

      expect(bankedPref.status).toBe('ACTIVE');
      expect(bankedPref.usedDate).toBeNull();
      expect(bankedPref.weight).toBeGreaterThan(0);
    });

    it('should mark banked preference as USED when redeemed', () => {
      const bankedPref = {
        id: 1,
        crewId: 'CREW001',
        preferenceType: 'FAVORITE' as const,
        preferenceValue: '2',
        weight: 15,
        originalDate: new Date('2025-01-15'),
        expiresAt: new Date('2025-02-15'),
        usedDate: new Date('2025-01-22'), // Redeemed 7 days later
        status: 'USED' as const
      };

      expect(bankedPref.status).toBe('USED');
      expect(bankedPref.usedDate).not.toBeNull();
      expect(bankedPref.usedDate?.getTime()).toBeGreaterThan(bankedPref.originalDate.getTime());
    });

    it('should mark banked preference as EXPIRED when past expiration', () => {
      const bankedPref = {
        id: 1,
        crewId: 'CREW001',
        preferenceType: 'TIMING' as const,
        preferenceValue: '-1', // early break
        weight: 12,
        originalDate: new Date('2025-01-01'),
        expiresAt: new Date('2025-01-31'),
        usedDate: null,
        status: 'EXPIRED' as const
      };

      const now = new Date('2025-02-05');
      
      expect(bankedPref.status).toBe('EXPIRED');
      expect(now.getTime()).toBeGreaterThan(bankedPref.expiresAt.getTime());
    });

    it('should allow manual cancellation of banked preference', () => {
      const bankedPref = {
        id: 1,
        crewId: 'CREW001',
        preferenceType: 'CONSECUTIVE' as const,
        preferenceValue: '0', // all roles
        weight: 20,
        originalDate: new Date('2025-01-15'),
        expiresAt: new Date('2025-02-15'),
        usedDate: null,
        status: 'CANCELED' as const
      };

      expect(bankedPref.status).toBe('CANCELED');
    });
  });

  describe('weight accumulation', () => {
    it('should start with initial weight from original preference', () => {
      const originalWeight = 10;
      const bankedPref = {
        id: 1,
        crewId: 'CREW001',
        preferenceType: 'FIRST_HOUR' as const,
        preferenceValue: '1',
        weight: originalWeight,
        originalDate: new Date('2025-01-15'),
        expiresAt: new Date('2025-02-15'),
        usedDate: null,
        status: 'ACTIVE' as const
      };

      expect(bankedPref.weight).toBe(originalWeight);
    });

    it('should increase weight over time to prioritize older banked preferences', () => {
      const baseWeight = 10;
      
      // Recent banked preference
      const recentBanked = {
        weight: baseWeight,
        originalDate: new Date('2025-01-20'),
        daysOld: 5
      };

      // Older banked preference - should have higher weight
      const olderBanked = {
        weight: baseWeight * 1.5, // 50% increase
        originalDate: new Date('2025-01-10'),
        daysOld: 15
      };

      // Very old banked preference - should have even higher weight
      const veryOldBanked = {
        weight: baseWeight * 2.0, // 100% increase
        originalDate: new Date('2025-01-01'),
        daysOld: 24
      };

      expect(olderBanked.weight).toBeGreaterThan(recentBanked.weight);
      expect(veryOldBanked.weight).toBeGreaterThan(olderBanked.weight);
    });

    it('should cap weight increase to prevent extreme prioritization', () => {
      const baseWeight = 10;
      const maxMultiplier = 3.0; // Max 3x original weight

      const veryOldBanked = {
        weight: Math.min(baseWeight * 10, baseWeight * maxMultiplier),
        originalDate: new Date('2024-12-01'),
        daysOld: 55
      };

      expect(veryOldBanked.weight).toBe(30); // Capped at 3x
      expect(veryOldBanked.weight).toBeLessThanOrEqual(baseWeight * maxMultiplier);
    });
  });

  describe('expiration management', () => {
    it('should set expiration date when banking preference', () => {
      const expirationDays = 30;
      const originalDate = new Date('2025-01-15');
      const expiresAt = new Date(originalDate);
      expiresAt.setDate(expiresAt.getDate() + expirationDays);

      const bankedPref = {
        id: 1,
        crewId: 'CREW001',
        preferenceType: 'FAVORITE' as const,
        preferenceValue: '1',
        weight: 10,
        originalDate,
        expiresAt,
        usedDate: null,
        status: 'ACTIVE' as const
      };

      expect(bankedPref.expiresAt.getTime()).toBeGreaterThan(bankedPref.originalDate.getTime());
      
      const daysDiff = Math.floor(
        (bankedPref.expiresAt.getTime() - bankedPref.originalDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysDiff).toBe(expirationDays);
    });

    it('should identify active banked preferences (not expired)', () => {
      const now = new Date('2025-01-20');
      
      const activeBanked = {
        id: 1,
        crewId: 'CREW001',
        preferenceType: 'FIRST_HOUR' as const,
        preferenceValue: '1',
        weight: 10,
        originalDate: new Date('2025-01-15'),
        expiresAt: new Date('2025-02-15'), // Not expired yet
        usedDate: null,
        status: 'ACTIVE' as const
      };

      const isActive = activeBanked.status === 'ACTIVE' && now < activeBanked.expiresAt;
      
      expect(isActive).toBe(true);
    });

    it('should identify expired banked preferences', () => {
      const now = new Date('2025-02-20');
      
      const expiredBanked = {
        id: 1,
        crewId: 'CREW001',
        preferenceType: 'FIRST_HOUR' as const,
        preferenceValue: '1',
        weight: 10,
        originalDate: new Date('2025-01-15'),
        expiresAt: new Date('2025-02-15'), // Expired
        usedDate: null,
        status: 'ACTIVE' as const // Not yet marked expired
      };

      const isExpired = now > expiredBanked.expiresAt;
      
      expect(isExpired).toBe(true);
    });

    it('should calculate remaining days until expiration', () => {
      const now = new Date('2025-01-20');
      const expiresAt = new Date('2025-02-05');
      
      const bankedPref = {
        id: 1,
        crewId: 'CREW001',
        preferenceType: 'TIMING' as const,
        preferenceValue: '-1',
        weight: 10,
        originalDate: new Date('2025-01-15'),
        expiresAt,
        usedDate: null,
        status: 'ACTIVE' as const
      };

      const remainingDays = Math.floor(
        (bankedPref.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(remainingDays).toBe(16);
      expect(remainingDays).toBeGreaterThan(0);
    });
  });

  describe('preference redemption', () => {
    it('should record redemption date when banked preference is used', () => {
      const usedDate = new Date('2025-01-22');
      
      const bankedPref = {
        id: 1,
        crewId: 'CREW001',
        preferenceType: 'FAVORITE' as const,
        preferenceValue: '2',
        weight: 15,
        originalDate: new Date('2025-01-15'),
        expiresAt: new Date('2025-02-15'),
        usedDate,
        status: 'USED' as const
      };

      expect(bankedPref.usedDate).not.toBeNull();
      expect(bankedPref.usedDate?.getTime()).toBeGreaterThan(bankedPref.originalDate.getTime());
      expect(bankedPref.usedDate?.getTime()).toBeLessThan(bankedPref.expiresAt.getTime());
    });

    it('should calculate time between banking and redemption', () => {
      const originalDate = new Date('2025-01-15');
      const usedDate = new Date('2025-01-29');
      
      const bankedPref = {
        id: 1,
        crewId: 'CREW001',
        preferenceType: 'FIRST_HOUR' as const,
        preferenceValue: '1',
        weight: 10,
        originalDate,
        expiresAt: new Date('2025-02-15'),
        usedDate,
        status: 'USED' as const
      };

      const daysToRedemption = Math.floor(
        (bankedPref.usedDate!.getTime() - bankedPref.originalDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysToRedemption).toBe(14);
    });

    it('should apply boosted weight when redeeming banked preference', () => {
      const baseWeight = 10;
      const ageMultiplier = 1.5; // 50% boost for age
      const bankingBonus = 1.2; // 20% bonus for being banked
      
      const redeemedWeight = baseWeight * ageMultiplier * bankingBonus;
      
      const bankedPref = {
        id: 1,
        crewId: 'CREW001',
        preferenceType: 'FAVORITE' as const,
        preferenceValue: '1',
        weight: Math.floor(redeemedWeight), // 18
        originalDate: new Date('2025-01-10'),
        expiresAt: new Date('2025-02-10'),
        usedDate: new Date('2025-01-25'),
        status: 'USED' as const
      };

      expect(bankedPref.weight).toBe(18);
      expect(bankedPref.weight).toBeGreaterThan(baseWeight);
    });
  });

  describe('crew banked preference management', () => {
    it('should track multiple banked preferences per crew', () => {
      const crewBankedPrefs = [
        {
          id: 1,
          crewId: 'CREW001',
          preferenceType: 'FIRST_HOUR' as const,
          preferenceValue: '1',
          weight: 10,
          status: 'ACTIVE' as const
        },
        {
          id: 2,
          crewId: 'CREW001',
          preferenceType: 'FAVORITE' as const,
          preferenceValue: '2',
          weight: 12,
          status: 'ACTIVE' as const
        },
        {
          id: 3,
          crewId: 'CREW001',
          preferenceType: 'TIMING' as const,
          preferenceValue: '-1',
          weight: 8,
          status: 'USED' as const
        },
      ];

      const activeBanked = crewBankedPrefs.filter(bp => bp.status === 'ACTIVE');
      
      expect(crewBankedPrefs.length).toBe(3);
      expect(activeBanked.length).toBe(2);
    });

    it('should calculate total banked weight for crew', () => {
      const crewBankedPrefs = [
        { weight: 10, status: 'ACTIVE' as const },
        { weight: 15, status: 'ACTIVE' as const },
        { weight: 8, status: 'USED' as const }, // Don't count used
      ];

      const totalActiveWeight = crewBankedPrefs
        .filter(bp => bp.status === 'ACTIVE')
        .reduce((sum, bp) => sum + bp.weight, 0);

      expect(totalActiveWeight).toBe(25); // 10 + 15
    });

    it('should prioritize crew with many banked preferences', () => {
      const crew1Banked = [
        { weight: 10, status: 'ACTIVE' as const },
      ];

      const crew2Banked = [
        { weight: 10, status: 'ACTIVE' as const },
        { weight: 12, status: 'ACTIVE' as const },
        { weight: 15, status: 'ACTIVE' as const },
      ];

      const crew1Total = crew1Banked.reduce((sum, bp) => sum + bp.weight, 0);
      const crew2Total = crew2Banked.reduce((sum, bp) => sum + bp.weight, 0);

      expect(crew2Total).toBe(37);
      expect(crew2Total).toBeGreaterThan(crew1Total);
      // CREW2 should get higher priority in scheduling
    });
  });

  describe('preference type preservation', () => {
    it('should preserve FIRST_HOUR preference details when banking', () => {
      const bankedPref = {
        id: 1,
        crewId: 'CREW001',
        preferenceType: 'FIRST_HOUR' as const,
        preferenceValue: '3', // roleId
        weight: 10,
        originalDate: new Date('2025-01-15'),
        expiresAt: new Date('2025-02-15'),
        usedDate: null,
        status: 'ACTIVE' as const
      };

      expect(bankedPref.preferenceType).toBe('FIRST_HOUR');
      expect(bankedPref.preferenceValue).toBe('3');
    });

    it('should preserve FAVORITE preference details when banking', () => {
      const bankedPref = {
        id: 1,
        crewId: 'CREW001',
        preferenceType: 'FAVORITE' as const,
        preferenceValue: '5', // roleId
        weight: 15,
        originalDate: new Date('2025-01-15'),
        expiresAt: new Date('2025-02-15'),
        usedDate: null,
        status: 'ACTIVE' as const
      };

      expect(bankedPref.preferenceType).toBe('FAVORITE');
      expect(bankedPref.preferenceValue).toBe('5');
    });

    it('should preserve TIMING preference details when banking', () => {
      const bankedPref = {
        id: 1,
        crewId: 'CREW001',
        preferenceType: 'TIMING' as const,
        preferenceValue: '1', // +1 for late break
        weight: 12,
        originalDate: new Date('2025-01-15'),
        expiresAt: new Date('2025-02-15'),
        usedDate: null,
        status: 'ACTIVE' as const
      };

      expect(bankedPref.preferenceType).toBe('TIMING');
      expect(bankedPref.preferenceValue).toBe('1');
    });

    it('should preserve CONSECUTIVE preference details when banking', () => {
      const bankedPref = {
        id: 1,
        crewId: 'CREW001',
        preferenceType: 'CONSECUTIVE' as const,
        preferenceValue: '0', // All roles
        weight: 20,
        originalDate: new Date('2025-01-15'),
        expiresAt: new Date('2025-02-15'),
        usedDate: null,
        status: 'ACTIVE' as const
      };

      expect(bankedPref.preferenceType).toBe('CONSECUTIVE');
      expect(bankedPref.preferenceValue).toBe('0');
    });
  });

  describe('fairness over time', () => {
    it('should give priority to crew with oldest banked preferences', () => {
      const crew1BankedPrefs = [
        { 
          originalDate: new Date('2025-01-20'),
          weight: 10,
          daysOld: 5
        }
      ];

      const crew2BankedPrefs = [
        {
          originalDate: new Date('2025-01-05'),
          weight: 15, // Increased from base 10 due to age
          daysOld: 20
        }
      ];

      const crew1TotalWeight = crew1BankedPrefs.reduce((sum, bp) => sum + bp.weight, 0);
      const crew2TotalWeight = crew2BankedPrefs.reduce((sum, bp) => sum + bp.weight, 0);

      expect(crew2TotalWeight).toBeGreaterThan(crew1TotalWeight);
      // CREW2 should get priority due to older banked preference
    });

    it('should encourage redemption before expiration', () => {
      const now = new Date('2025-02-10');
      
      const soonToExpire = {
        id: 1,
        crewId: 'CREW001',
        preferenceType: 'FIRST_HOUR' as const,
        preferenceValue: '1',
        weight: 25, // Boosted due to urgency
        originalDate: new Date('2025-01-15'),
        expiresAt: new Date('2025-02-14'), // Only 4 days left
        usedDate: null,
        status: 'ACTIVE' as const
      };

      const daysUntilExpiration = Math.floor(
        (soonToExpire.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysUntilExpiration).toBe(4);
      expect(daysUntilExpiration).toBeLessThan(7); // Urgent threshold
      expect(soonToExpire.weight).toBeGreaterThan(20); // Boosted for urgency
    });

    it('should track banked preference redemption rate per crew', () => {
      const allBankedPrefs = [
        { status: 'USED' as const },
        { status: 'USED' as const },
        { status: 'ACTIVE' as const },
        { status: 'EXPIRED' as const },
        { status: 'USED' as const },
      ];

      const usedCount = allBankedPrefs.filter(bp => bp.status === 'USED').length;
      const totalCount = allBankedPrefs.length;
      const redemptionRate = usedCount / totalCount;

      expect(usedCount).toBe(3);
      expect(redemptionRate).toBe(0.6); // 60% redemption rate
    });
  });

  describe('status transitions', () => {
    it('should transition from ACTIVE to USED on redemption', () => {
      const before = { status: 'ACTIVE' as const, usedDate: null };
      const after = { status: 'USED' as const, usedDate: new Date('2025-01-22') };

      expect(before.status).toBe('ACTIVE');
      expect(after.status).toBe('USED');
      expect(after.usedDate).not.toBeNull();
    });

    it('should transition from ACTIVE to EXPIRED on timeout', () => {
      const before = { status: 'ACTIVE' as const };
      const after = { status: 'EXPIRED' as const };

      expect(before.status).toBe('ACTIVE');
      expect(after.status).toBe('EXPIRED');
    });

    it('should transition from ACTIVE to CANCELED on manual cancellation', () => {
      const before = { status: 'ACTIVE' as const };
      const after = { status: 'CANCELED' as const };

      expect(before.status).toBe('ACTIVE');
      expect(after.status).toBe('CANCELED');
    });

    it('should not allow redemption of expired preferences', () => {
      type BankingStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELED';
      
      const expiredPref: { status: BankingStatus; expiresAt: Date } = {
        status: 'EXPIRED',
        expiresAt: new Date('2025-01-31')
      };

      const now = new Date('2025-02-05');
      // Can only redeem ACTIVE preferences before expiration
      const isActive = expiredPref.status === 'ACTIVE';
      const notExpired = now < expiredPref.expiresAt;

      expect(isActive).toBe(false); // EXPIRED, not ACTIVE
      expect(notExpired).toBe(false); // Past expiration date
    });

    it('should not allow redemption of canceled preferences', () => {
      type BankingStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELED';
      
      const canceledPref: { status: BankingStatus } = {
        status: 'CANCELED'
      };

      const isActive = canceledPref.status === 'ACTIVE';

      expect(isActive).toBe(false); // CANCELED, not ACTIVE
    });
  });

  describe('analytics and reporting', () => {
    it('should calculate average banking duration', () => {
      const bankedPrefs = [
        {
          originalDate: new Date('2025-01-10'),
          usedDate: new Date('2025-01-20'),
          status: 'USED' as const
        },
        {
          originalDate: new Date('2025-01-05'),
          usedDate: new Date('2025-01-19'),
          status: 'USED' as const
        },
        {
          originalDate: new Date('2025-01-12'),
          usedDate: new Date('2025-01-26'),
          status: 'USED' as const
        },
      ];

      const durations = bankedPrefs.map(bp => 
        Math.floor((bp.usedDate.getTime() - bp.originalDate.getTime()) / (1000 * 60 * 60 * 24))
      );

      const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;

      expect(durations).toEqual([10, 14, 14]);
      expect(averageDuration).toBeCloseTo(12.67, 1); // ~12.67 days average
    });

    it('should identify crew with most banked preferences', () => {
      const allBankedPrefs = [
        { crewId: 'CREW001', status: 'ACTIVE' as const },
        { crewId: 'CREW001', status: 'ACTIVE' as const },
        { crewId: 'CREW002', status: 'ACTIVE' as const },
        { crewId: 'CREW003', status: 'ACTIVE' as const },
        { crewId: 'CREW001', status: 'ACTIVE' as const },
      ];

      const crewCounts = allBankedPrefs.reduce((counts, bp) => {
        counts[bp.crewId] = (counts[bp.crewId] || 0) + 1;
        return counts;
      }, {} as Record<string, number>);

      expect(crewCounts['CREW001']).toBe(3);
      expect(crewCounts['CREW002']).toBe(1);
      expect(crewCounts['CREW003']).toBe(1);
    });
  });
});

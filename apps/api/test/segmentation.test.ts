import { describe, it, expect } from 'vitest';
import { segmentShiftByRegisterWindow, hhmmToMin, summarizeBuckets, type Allocation } from '../src/services/segmentation';

function mins(hhmm: string) { return hhmmToMin(hhmm); }

describe('segmentShiftByRegisterWindow', () => {
  it('splits into PRODUCT + FLEX + PRODUCT when spanning both edges', () => {
    const res = segmentShiftByRegisterWindow(mins('05:00'), mins('22:00'), mins('09:00'), mins('21:00'));
    expect(res.segments).toEqual([
      { startMin: mins('05:00'), endMin: mins('09:00'), kind: 'PRODUCT' },
      { startMin: mins('09:00'), endMin: mins('21:00'), kind: 'FLEX' },
      { startMin: mins('21:00'), endMin: mins('22:00'), kind: 'PRODUCT' },
    ]);
    expect(res.productMinutes).toBe((4 + 1) * 60);
    expect(res.flexMinutes).toBe(12 * 60);
  });

  it('all PRODUCT when completely outside window (morning)', () => {
    const res = segmentShiftByRegisterWindow(mins('05:00'), mins('08:30'), mins('09:00'), mins('21:00'));
    expect(res.segments).toEqual([
      { startMin: mins('05:00'), endMin: mins('08:30'), kind: 'PRODUCT' }
    ]);
    expect(res.productMinutes).toBe(210);
    expect(res.flexMinutes).toBe(0);
  });

  it('all FLEX when inside window', () => {
    const res = segmentShiftByRegisterWindow(mins('10:00'), mins('12:00'), mins('09:00'), mins('21:00'));
    expect(res.segments).toEqual([
      { startMin: mins('10:00'), endMin: mins('12:00'), kind: 'FLEX' }
    ]);
    expect(res.productMinutes).toBe(0);
    expect(res.flexMinutes).toBe(120);
  });

  it('boundary-touching generates no zero-length segments', () => {
    const res = segmentShiftByRegisterWindow(mins('09:00'), mins('21:00'), mins('09:00'), mins('21:00'));
    expect(res.segments).toEqual([
      { startMin: mins('09:00'), endMin: mins('21:00'), kind: 'FLEX' }
    ]);
  });
});

describe('summarizeBuckets', () => {
  it('counts roles as PRODUCT and splits buckets correctly', () => {
    const { segments } = segmentShiftByRegisterWindow(mins('05:00'), mins('22:00'), mins('09:00'), mins('21:00'));
    const allocations: Allocation[] = [
      { startMin: mins('09:00'), endMin: mins('10:00'), type: 'REGISTER' },
      { startMin: mins('10:00'), endMin: mins('12:00'), type: 'PRODUCT' },
      { startMin: mins('12:00'), endMin: mins('12:30'), type: 'BREAK' },
      { startMin: mins('12:30'), endMin: mins('14:00'), type: 'ART' },
      { startMin: mins('14:00'), endMin: mins('16:00'), type: 'DEMO' },
      { startMin: mins('16:00'), endMin: mins('18:00'), type: 'ORDER_WRITER' },
      { startMin: mins('18:00'), endMin: mins('20:00'), type: 'REGISTER' },
    ];
    const buckets = summarizeBuckets(segments, allocations);
    // Base PRODUCT from edges = 05:00-09:00 (240) + 21:00-22:00 (60) = 300
    // Explicit PRODUCT inside FLEX = 10:00-12:00 = 120
    // Roles = ART(90) + DEMO(120) + ORDER_WRITER(120) = 330
    // REGISTER = 09:00-10:00 (60) + 18:00-20:00 (120) = 180
    // BREAK = 12:00-12:30 = 30
    expect(buckets.productMinutes).toBe(300 + 120 + 330);
    expect(buckets.registerMinutes).toBe(180);
    expect(buckets.breakMinutes).toBe(30);
    expect(buckets.roleMinutesByType.ART).toBe(90);
    expect(buckets.roleMinutesByType.DEMO).toBe(120);
    expect(buckets.roleMinutesByType.ORDER_WRITER).toBe(120);
  });
});

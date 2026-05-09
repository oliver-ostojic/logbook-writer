import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { startOfDay } from '../utils';
import { DayGeneratorConfig } from '../testgen/configs/DayGeneratorConfig';
import { StartTimeConfig } from '../testgen/configs/StartTimeConfig';
import { ShiftLengthConfig } from '../testgen/configs/ShiftLengthConfig';
import { QuotaConfig } from '../testgen/configs/QuotaConfig';
import { CoverageWindowConfig } from '../testgen/configs/CoverageWindowConfig';
import { WindowCoverageConfig } from '../testgen/configs/WindowCoverageConfig';
import { generateDayPayload } from '../testgen/generator';
import { persistDayPayload } from '../testgen/persist';
import { CrewRecord } from '../testgen/types';
import { generateLogbookPdf, deletePdf } from '../services/pdf-generator';

const prisma = new PrismaClient();

const RequestSchema = z.object({
  storeId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dayCount: z.number().int().min(1).default(1),
  seed: z.number().int().optional(),
  config: z.object({
    crewCountMin: z.number().int().positive(),
    crewCountMax: z.number().int().positive(),
    startTimes: z.array(z.object({
      timeMin: z.number().int().min(0).max(1439),
      percentageMin: z.number().positive(),
      percentageMax: z.number().positive(),
    })).min(1),
    shiftLengths: z.array(z.object({ lengthMin: z.number().int().positive(), percentage: z.number().positive() })).min(1),
    quotas: z.array(z.object({
      roleId: z.number().int().positive(),
      coverageRateMin: z.number().min(0).max(1),
      coverageRateMax: z.number().min(0).max(1),
      lengths: z.array(z.object({
        lengthMin: z.number().int().positive(),
        percentageMin: z.number().positive(),
        percentageMax: z.number().positive(),
      })).min(1),
    })),
    coverage: z.array(z.object({
      roleId: z.number().int().positive(),
      startMin: z.number().int().min(0).max(1440),
      endMin: z.number().int().min(1).max(1440),
      pctPerHourMin: z.number().min(0).max(1),
      pctPerHourMax: z.number().min(0).max(1),
      constraintRule: z.enum(['MIN', 'MAX', 'EXACTLY']).default('MIN'),
    })),
    windowCoverage: z.array(z.object({
      roleId: z.number().int().positive(),
      startMin: z.number().int().min(0).max(1440),
      endMin: z.number().int().min(1).max(1440),
      crewCount: z.number().int().min(0),
      constraintRule: z.enum(['MIN', 'MAX', 'EXACTLY']).default('EXACTLY'),
      usageProbability: z.number().min(0).max(1).default(1),
    })).default([]),
  }),
});

export function registerTestGenRoutes(app: FastifyInstance) {
  app.post('/testgen/generate', async (req, reply) => {
    const parsed = RequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request', details: parsed.error.issues });
    }

    const { storeId, date, dayCount, seed, config } = parsed.data;

    const crewRows = await prisma.crew.findMany({
      where: { storeId },
      include: { CrewRole: { select: { roleId: true } } },
      orderBy: { id: 'asc' },
    });

    const allCrew: CrewRecord[] = crewRows.map(c => ({
      id: c.id,
      roleIds: c.CrewRole.map(r => r.roleId),
      shiftStartMin: 0,
      shiftEndMin: 1440,
    }));

    const dayConfig = new DayGeneratorConfig(
      config.crewCountMin,
      config.crewCountMax,
      new StartTimeConfig(config.startTimes),
      new ShiftLengthConfig(config.shiftLengths),
      config.quotas.map(q => new QuotaConfig(q.roleId, q.coverageRateMin, q.coverageRateMax, q.lengths)),
      config.coverage.map(c => new CoverageWindowConfig(c.roleId, c.startMin, c.endMin, c.pctPerHourMin, c.pctPerHourMax, c.constraintRule)),
      config.windowCoverage.map(w => new WindowCoverageConfig(w.roleId, w.startMin, w.endMin, w.crewCount, w.constraintRule, w.usageProbability)),
    );

    const startDate = startOfDay(date);
    const baseSeed = seed ?? Date.now();
    const days: { date: string; summary: object }[] = [];

    for (let i = 0; i < dayCount; i++) {
      const dayDate = new Date(startDate);
      dayDate.setUTCDate(dayDate.getUTCDate() + i);
      const dateStr = dayDate.toISOString().slice(0, 10);

      let payload;
      try {
        payload = generateDayPayload(dayConfig, allCrew, baseSeed + i);
      } catch (err: any) {
        return reply.code(422).send({ error: `Day ${dateStr}: ${err.message}` });
      }

      await persistDayPayload(storeId, dayDate, payload);

      days.push({
        date: dateStr,
        summary: {
          crewUsed: payload.shifts.map(s => s.crewId),
          shiftsWritten: payload.shifts.length,
          coverageWindowsWritten: payload.coverageWindows.length,
          quotasWritten: payload.crewQuotas.length,
        },
      });
    }

    return { ok: true, days };
  });

  const PublishSchema = z.object({
    logbookId: z.string().uuid(),
  });

  app.post('/testgen/publish', async (req, reply) => {
    const parsed = PublishSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request', details: parsed.error.issues });
    }

    const { logbookId } = parsed.data;

    const logbook = await prisma.logbook.findUnique({ where: { id: logbookId } });
    if (!logbook) return reply.code(404).send({ error: 'Logbook not found' });

    const existingPublished = await prisma.logbook.findFirst({
      where: { storeId: logbook.storeId, date: logbook.date, status: 'PUBLISHED', id: { not: logbookId } },
    });

    if (logbook.storedFilePath) deletePdf(logbook.storedFilePath);

    let pdfPath: string;
    try {
      pdfPath = await generateLogbookPdf(logbookId, logbook.storeId, logbook.date);
    } catch (err: any) {
      return reply.code(500).send({ error: 'PDF generation failed', details: err.message });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (existingPublished) {
        await tx.logbook.update({
          where: { id: existingPublished.id },
          data: { status: 'SUPERSEDED', supersededById: logbookId },
        });
      }
      return tx.logbook.update({
        where: { id: logbookId },
        data: { status: 'PUBLISHED', storedFilePath: pdfPath, publishedAt: new Date() },
      });
    });

    return { success: true, logbookId: updated.id, pdfPath, status: updated.status };
  });
}

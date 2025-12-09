/**
 * PDF Generator Service
 * 
 * Generates a simple PDF logbook with a schedule table.
 * Y-axis: Crew names
 * X-axis: Timeline (30-minute slots)
 */

import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Font paths
const FONTS_DIR = path.join(__dirname, '../../fonts');
const FONT_REGULAR = path.join(FONTS_DIR, 'OpenSans-Regular.ttf');
const FONT_BOLD = path.join(FONTS_DIR, 'OpenSans-Bold.ttf');
const FONT_SEMIBOLD = path.join(FONTS_DIR, 'OpenSans-SemiBold.ttf');

interface ProcessedAssignment {
  crewId: string;
  roleId: number;
  startMinute: number;
  endMinute: number;
}

// Role colors for the PDF (simplified palette)
const ROLE_COLORS: Record<string, [number, number, number]> = {
  REGISTER: [59, 130, 246],    // Blue
  PRODUCT: [34, 197, 94],      // Green
  DEMO: [168, 85, 247],        // Purple
  ORDER_WRITER: [249, 115, 22], // Orange
  BREAK: [156, 163, 175],      // Gray
};

// Default color for unknown roles
const DEFAULT_COLOR: [number, number, number] = [107, 114, 128];

/**
 * Convert a Date to minutes since midnight (UTC)
 */
function dateToMinutes(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

/**
 * Generate a PDF for a logbook and save it to disk
 * @returns The file path where the PDF was saved
 */
export async function generateLogbookPdf(
  logbookId: string,
  storeId: number,
  date: Date
): Promise<string> {
  // Fetch store info for store hours
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { openMinutesFromMidnight: true, closeMinutesFromMidnight: true },
  });

  if (!store) {
    throw new Error('Store not found');
  }

  // Fetch assignments for this logbook
  const rawAssignments = await prisma.assignment.findMany({
    where: { logbookId },
    orderBy: [{ crewId: 'asc' }, { startTime: 'asc' }],
  });

  if (rawAssignments.length === 0) {
    throw new Error('No assignments found for this logbook');
  }

  // Convert to processed format with minutes
  const assignments: ProcessedAssignment[] = rawAssignments.map(a => ({
    crewId: a.crewId,
    roleId: a.roleId,
    startMinute: dateToMinutes(a.startTime),
    endMinute: dateToMinutes(a.endTime),
  }));

  // Get unique crew IDs and fetch crew info
  const crewIds = [...new Set(assignments.map(a => a.crewId))];
  const crewRecords = await prisma.crew.findMany({
    where: { id: { in: crewIds } },
    select: { id: true, name: true },
  });
  const crewMap = new Map(crewRecords.map(c => [c.id, c]));

  // Calculate earliest start time for each crew member
  const earliestStartByCrewId = new Map<string, number>();
  for (const assignment of assignments) {
    const current = earliestStartByCrewId.get(assignment.crewId);
    if (current === undefined || assignment.startMinute < current) {
      earliestStartByCrewId.set(assignment.crewId, assignment.startMinute);
    }
  }

  // Sort crew IDs: first by earliest start time, then alphabetically by name
  const sortedCrewIds = [...crewIds].sort((a, b) => {
    const startA = earliestStartByCrewId.get(a) ?? Infinity;
    const startB = earliestStartByCrewId.get(b) ?? Infinity;
    
    if (startA !== startB) {
      return startA - startB; // Earlier start time first
    }
    
    // Same start time - sort alphabetically by name
    const nameA = crewMap.get(a)?.name?.toLowerCase() ?? a.toLowerCase();
    const nameB = crewMap.get(b)?.name?.toLowerCase() ?? b.toLowerCase();
    return nameA.localeCompare(nameB);
  });

  // Fetch role info for this store
  const roles = await prisma.role.findMany({
    where: { storeId },
    select: { id: true, code: true, displayName: true },
  });
  const roleMap = new Map(roles.map(r => [r.id, r]));

  // Generate time slots (30-minute intervals) based on store hours
  const timeSlots: number[] = [];
  for (let min = store.openMinutesFromMidnight; min < store.closeMinutesFromMidnight; min += 30) {
    timeSlots.push(min);
  }

  // Create PDF document (portrait mode)
  const doc = new PDFDocument({ 
    size: 'LETTER',
    layout: 'portrait',
    margins: { top: 40, bottom: 40, left: 40, right: 40 }
  });

  // Register Open Sans fonts
  doc.registerFont('OpenSans', FONT_REGULAR);
  doc.registerFont('OpenSans-Bold', FONT_BOLD);
  doc.registerFont('OpenSans-SemiBold', FONT_SEMIBOLD);

  // Ensure pdfs directory exists
  const pdfDir = path.join(process.cwd(), 'pdfs');
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  // Generate filename
  const dateStr = date.toISOString().split('T')[0];
  const filename = `logbook_${storeId}_${dateStr}_${logbookId.substring(0, 8)}.pdf`;
  const filePath = path.join(pdfDir, filename);

  // Pipe to file
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // Title
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  
  doc.fontSize(18).font('OpenSans-Bold').text(`Logbook - ${formattedDate}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).font('OpenSans').text(`Store ${storeId}`, { align: 'center' });
  doc.moveDown(1);

  // Table dimensions
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const nameColumnWidth = 100;
  const tableWidth = pageWidth;
  const slotWidth = (tableWidth - nameColumnWidth) / timeSlots.length;
  const rowHeight = 24;
  const headerHeight = 20; // Reduced from 30

  const tableLeft = doc.page.margins.left;
  let tableTop = doc.y;

  // Helper to format hour label (e.g., "8AM", "12PM", "2:30PM")
  const formatHourLabel = (minutes: number): string => {
    const hour = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const hour12 = hour % 12 || 12;
    const amPm = hour < 12 ? 'AM' : 'PM';
    if (mins === 0) {
      return `${hour12}${amPm}`;
    }
    return `${hour12}:${mins.toString().padStart(2, '0')}${amPm}`;
  };

  // Helper to vertically center text - pdfkit uses baseline positioning
  // so we need to offset by roughly 70% of font size to center visually
  const verticalCenter = (containerHeight: number, fontSize: number) => {
    return (containerHeight - fontSize) / 2 - fontSize * 0.15;
  };

  // Draw header row with hourly time labels only
  doc.rect(tableLeft, tableTop, nameColumnWidth, headerHeight)
    .fillAndStroke('#f3f4f6', '#d1d5db');
  
  const headerFontSize = 9;
  doc.fillColor('#374151')
    .fontSize(headerFontSize)
    .font('OpenSans-SemiBold')
    .text('Crew', tableLeft + 5, tableTop + verticalCenter(headerHeight, headerFontSize), { width: nameColumnWidth - 10 });

  // Draw the timeline header area (single background)
  const timelineWidth = tableWidth - nameColumnWidth;
  doc.rect(tableLeft + nameColumnWidth, tableTop, timelineWidth, headerHeight)
    .fillAndStroke('#f3f4f6', '#d1d5db');

  // Draw hourly labels and vertical lines
  const timeFontSize = 8;
  timeSlots.forEach((min, i) => {
    const x = tableLeft + nameColumnWidth + (i * slotWidth);
    const isFullHour = min % 60 === 0;
    
    if (isFullHour) {
      // Draw vertical line at hour mark
      doc.strokeColor('#d1d5db')
        .moveTo(x, tableTop)
        .lineTo(x, tableTop + headerHeight)
        .stroke();
      
      // Draw hour label - centered horizontally and vertically
      const hourWidth = slotWidth * 2; // Hour spans 2 slots (2x 30min)
      doc.fillColor('#374151')
        .fontSize(timeFontSize)
        .font('OpenSans-SemiBold')
        .text(formatHourLabel(min), x, tableTop + verticalCenter(headerHeight, timeFontSize), { 
          width: hourWidth, 
          align: 'center' 
        });
    }
  });

  tableTop += headerHeight;

  // Draw rows for each crew member
  let currentRowIndex = 0;
  for (const crewId of sortedCrewIds) {
    const crew = crewMap.get(crewId);
    const crewName = crew?.name || crewId;
    const crewAssignments = assignments.filter(a => a.crewId === crewId);
    
    let rowY = tableTop + (currentRowIndex * rowHeight);
    
    // Check if we need a new page
    if (rowY + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      tableTop = doc.page.margins.top;
      currentRowIndex = 0;
      
      // Redraw header on new page
      doc.rect(tableLeft, tableTop, nameColumnWidth, headerHeight)
        .fillAndStroke('#f3f4f6', '#d1d5db');
      doc.fillColor('#374151')
        .fontSize(headerFontSize)
        .font('OpenSans-SemiBold')
        .text('Crew', tableLeft + 5, tableTop + verticalCenter(headerHeight, headerFontSize), { width: nameColumnWidth - 10 });
      
      // Draw the timeline header area (single background)
      doc.rect(tableLeft + nameColumnWidth, tableTop, timelineWidth, headerHeight)
        .fillAndStroke('#f3f4f6', '#d1d5db');

      // Draw hourly labels and vertical lines
      timeSlots.forEach((min, i) => {
        const x = tableLeft + nameColumnWidth + (i * slotWidth);
        const isFullHour = min % 60 === 0;
        
        if (isFullHour) {
          doc.strokeColor('#d1d5db')
            .moveTo(x, tableTop)
            .lineTo(x, tableTop + headerHeight)
            .stroke();
          
          const hourWidth = slotWidth * 2;
          doc.fillColor('#374151')
            .fontSize(timeFontSize)
            .font('OpenSans-SemiBold')
            .text(formatHourLabel(min), x, tableTop + verticalCenter(headerHeight, timeFontSize), { 
              width: hourWidth, 
              align: 'center' 
            });
        }
      });
      
      tableTop += headerHeight;
      rowY = tableTop;
    }

    // Crew name cell - solid white background
    doc.rect(tableLeft, rowY, nameColumnWidth, rowHeight)
      .fillAndStroke('#ffffff', '#d1d5db');
    
    // Alternating row color for shift cells
    const shiftRowBg = currentRowIndex % 2 === 0 ? '#ffffff' : '#f9fafb';
    // Empty cells get white background
    const emptyBg = '#ffffff';
    
    // Check if name fits on one line
    const nameWidth = nameColumnWidth - 30;
    const crewFontSize = 8;
    doc.font('OpenSans').fontSize(crewFontSize);
    const singleLineHeight = doc.heightOfString('Test', { width: nameWidth });
    const nameHeight = doc.heightOfString(crewName, { width: nameWidth });
    const isTwoLines = nameHeight > singleLineHeight * 1.5;
    
    // Center vertically based on actual text height
    const nameY = isTwoLines 
      ? rowY + (rowHeight - nameHeight) / 2  // center two-line text
      : rowY + verticalCenter(rowHeight, crewFontSize);
    
    doc.fillColor('#111827')
      .text(crewName, tableLeft + 5, nameY, { width: nameWidth });

    // Shift time right-aligned (start time on top, end time below)
    if (crewAssignments.length > 0) {
      const shiftStart = Math.min(...crewAssignments.map(a => a.startMinute));
      const shiftEnd = Math.max(...crewAssignments.map(a => a.endMinute));
      const shiftFontSize = 6;
      const lineHeight = shiftFontSize + 1;
      const shiftBlockHeight = lineHeight * 2;
      const shiftTopY = rowY + (rowHeight - shiftBlockHeight) / 2;
      
      doc.fillColor('#6b7280')
        .fontSize(shiftFontSize)
        .font('OpenSans')
        .text(formatHourLabel(shiftStart), tableLeft + 5, shiftTopY, { 
          width: nameColumnWidth - 10, 
          align: 'right' 
        })
        .text(formatHourLabel(shiftEnd), tableLeft + 5, shiftTopY + lineHeight, { 
          width: nameColumnWidth - 10, 
          align: 'right' 
        });
    }

    // Draw time slot cells - first pass: fill all backgrounds
    timeSlots.forEach((slotStart, i) => {
      const x = tableLeft + nameColumnWidth + (i * slotWidth);
      
      // Find assignment that covers this slot
      const assignment = crewAssignments.find(a => 
        a.startMinute <= slotStart && a.endMinute > slotStart
      );
      
      if (assignment) {
        const role = roleMap.get(assignment.roleId);
        const roleCode = role?.code?.toUpperCase() || 'UNKNOWN';
        const color = ROLE_COLORS[roleCode] || DEFAULT_COLOR;
        
        // Apply alternating row tint to role color
        const tintFactor = currentRowIndex % 2 === 0 ? 1 : 0.92;
        const tintedColor = [
          Math.round(color[0] * tintFactor),
          Math.round(color[1] * tintFactor),
          Math.round(color[2] * tintFactor)
        ];
        
        // Fill with role color (with alternating tint)
        doc.rect(x, rowY, slotWidth, rowHeight)
          .fill(`rgb(${tintedColor[0]}, ${tintedColor[1]}, ${tintedColor[2]})`);
      } else {
        // Empty cell - white background
        doc.rect(x, rowY, slotWidth, rowHeight)
          .fill(emptyBg);
      }
    });

    // Second pass: draw borders for all cells (same color)
    const borderColor = '#d1d5db';
    timeSlots.forEach((slotStart, i) => {
      const x = tableLeft + nameColumnWidth + (i * slotWidth);
      doc.rect(x, rowY, slotWidth, rowHeight)
        .strokeColor(borderColor)
        .stroke();
    });
    
    currentRowIndex++;
  }

  // Add legend at the bottom
  const legendY = tableTop + (currentRowIndex * rowHeight) + 20;
  
  if (legendY < doc.page.height - doc.page.margins.bottom - 60) {
    doc.moveDown(2);
    doc.fontSize(10).font('OpenSans-Bold').fillColor('#374151').text('Legend:', tableLeft);
    doc.moveDown(0.3);
    
    let legendX = tableLeft;
    const legendSpacing = 100;
    
    Object.entries(ROLE_COLORS).forEach(([name, color]) => {
      if (legendX + legendSpacing > pageWidth + tableLeft) {
        doc.moveDown(0.5);
        legendX = tableLeft;
      }
      
      doc.rect(legendX, doc.y, 12, 12)
        .fill(`rgb(${color[0]}, ${color[1]}, ${color[2]})`);
      
      doc.fillColor('#374151')
        .fontSize(8)
        .font('OpenSans')
        .text(name, legendX + 16, doc.y + 2);
      
      legendX += legendSpacing;
    });
  }

  // Footer with generation timestamp
  doc.fontSize(8)
    .font('OpenSans')
    .fillColor('#9ca3af')
    .text(
      `Generated: ${new Date().toLocaleString()}`,
      tableLeft,
      doc.page.height - doc.page.margins.bottom - 20,
      { align: 'right', width: pageWidth }
    );

  // Finalize PDF
  doc.end();

  // Wait for stream to finish
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return filePath;
}

/**
 * Delete a PDF file if it exists
 */
export function deletePdf(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

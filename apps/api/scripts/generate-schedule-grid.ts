/**
 * Generate a visual grid schedule from logbook assignments
 * 
 * Features:
 * - Sorted by start time, then alphabetically
 * - Solid lines at :00, dotted at :30
 * - Color-coded by role
 * - Exports to HTML
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const STORE_ID = 768;
const SLOT_MINUTES = 30;

// Role color mapping
const ROLE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  'REGISTER': { bg: '#E3F2FD', text: '#1565C0', label: 'Register' },
  'PRODUCT': { bg: '#F3E5F5', text: '#6A1B9A', label: 'Product' },
  'PARKING_HELM': { bg: '#FFF3E0', text: '#E65100', label: 'Parking' },
  'ORDER_WRITER': { bg: '#E8F5E9', text: '#2E7D32', label: 'Order Writer' },
  'ART': { bg: '#FCE4EC', text: '#C2185B', label: 'Art' },
  'BREAK': { bg: '#ECEFF1', text: '#455A64', label: 'Break' },
  'MEAL_BREAK': { bg: '#ECEFF1', text: '#455A64', label: 'Break' },
  'DEMO': { bg: '#FFF9C4', text: '#F57F17', label: 'Demo' },
  'WINE_DEMO': { bg: '#F8BBD0', text: '#880E4F', label: 'Wine Demo' },
  'TRUCK': { bg: '#CFD8DC', text: '#37474F', label: 'Truck' },
};

interface CrewSchedule {
  crewId: string;
  crewName: string;
  shiftStart: number; // minutes from midnight
  shiftEnd: number;
  assignments: Array<{
    roleCode: string;
    roleLabel: string;
    startMin: number;
    endMin: number;
    color: { bg: string; text: string };
  }>;
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(mins).padStart(2, '0')} ${ampm}`;
}

async function generateScheduleGrid(date: string, outputPath: string) {
  console.log(`📅 Generating schedule grid for ${date}\n`);

  // Get the logbook
  const logbook = await prisma.logbook.findFirst({
    where: {
      storeId: STORE_ID,
      date: new Date(date),
      status: 'DRAFT',
    },
    include: {
      assignments: {
        include: {
          crew: true,
          role: true,
        },
        orderBy: [
          { startTime: 'asc' },
          { crew: { name: 'asc' } },
        ],
      },
    },
    orderBy: { generatedAt: 'desc' },
  });

  if (!logbook) {
    console.log(`❌ No logbook found for ${date}`);
    return;
  }

  console.log(`✅ Found logbook: ${logbook.id}`);
  console.log(`   Assignments: ${logbook.assignments.length}\n`);

  // Group assignments by crew
  const crewMap = new Map<string, CrewSchedule>();

  for (const assignment of logbook.assignments) {
    const crewId = assignment.crewId;
    const crewName = assignment.crew.name;
    const roleCode = assignment.role.code;
    const startMin = assignment.startTime.getHours() * 60 + assignment.startTime.getMinutes();
    const endMin = assignment.endTime.getHours() * 60 + assignment.endTime.getMinutes();

    if (!crewMap.has(crewId)) {
      crewMap.set(crewId, {
        crewId,
        crewName,
        shiftStart: startMin,
        shiftEnd: endMin,
        assignments: [],
      });
    }

    const crew = crewMap.get(crewId)!;
    crew.shiftStart = Math.min(crew.shiftStart, startMin);
    crew.shiftEnd = Math.max(crew.shiftEnd, endMin);

    const roleConfig = ROLE_COLORS[roleCode] || { bg: '#F5F5F5', text: '#424242', label: roleCode };

    crew.assignments.push({
      roleCode,
      roleLabel: roleConfig.label,
      startMin,
      endMin,
      color: { bg: roleConfig.bg, text: roleConfig.text },
    });
  }

  // Sort crew by shift start, then alphabetically
  const sortedCrew = Array.from(crewMap.values()).sort((a, b) => {
    if (a.shiftStart !== b.shiftStart) {
      return a.shiftStart - b.shiftStart;
    }
    return a.crewName.localeCompare(b.crewName);
  });

  // Determine time range
  const earliestStart = Math.min(...sortedCrew.map(c => c.shiftStart));
  const latestEnd = Math.max(...sortedCrew.map(c => c.shiftEnd));

  // Round to nearest hour
  const startHour = Math.floor(earliestStart / 60);
  const endHour = Math.ceil(latestEnd / 60);

  console.log(`⏰ Schedule Range: ${minutesToTime(startHour * 60)} - ${minutesToTime(endHour * 60)}`);
  console.log(`👥 Crew Members: ${sortedCrew.length}\n`);

  // Generate HTML
  const html = generateHTML(sortedCrew, startHour, endHour, date);

  fs.writeFileSync(outputPath, html);
  console.log(`✅ Schedule grid saved to: ${outputPath}\n`);
}

function generateHTML(crew: CrewSchedule[], startHour: number, endHour: number, date: string): string {
  const slots: Array<{ hour: number; minute: number; label: string; isDotted: boolean }> = [];

  // Generate time slots (every 30 minutes)
  for (let hour = startHour; hour < endHour; hour++) {
    slots.push({ hour, minute: 0, label: `${hour % 12 || 12}:00`, isDotted: false });
    slots.push({ hour, minute: 30, label: `${hour % 12 || 12}:30`, isDotted: true });
  }
  slots.push({ hour: endHour, minute: 0, label: `${endHour % 12 || 12}:00`, isDotted: false });

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Schedule Grid - ${date}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      padding: 20px;
      background: #f5f5f5;
    }
    
    .container {
      max-width: 100%;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      padding: 20px;
      overflow-x: auto;
    }
    
    h1 {
      margin-bottom: 10px;
      color: #333;
    }
    
    .meta {
      color: #666;
      margin-bottom: 20px;
      font-size: 14px;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    
    th, td {
      border: 1px solid #e0e0e0;
      padding: 4px 8px;
      text-align: center;
    }
    
    th {
      background: #f5f5f5;
      font-weight: 600;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    
    th.crew-name {
      text-align: left;
      min-width: 150px;
      background: #fff;
      border-right: 2px solid #333;
    }
    
    td.crew-name {
      text-align: left;
      font-weight: 500;
      background: #fafafa;
      border-right: 2px solid #333;
      white-space: nowrap;
    }
    
    th.time-slot {
      min-width: 60px;
      font-size: 11px;
    }
    
    th.dotted {
      border-left: 1px dotted #999;
    }
    
    th.solid {
      border-left: 2px solid #333;
    }
    
    td.dotted {
      border-left: 1px dotted #999;
    }
    
    td.solid {
      border-left: 2px solid #333;
    }
    
    .assignment {
      padding: 4px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .legend {
      margin-top: 20px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
    }
    
    .legend-color {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      border: 1px solid #ddd;
    }
    
    @media print {
      body {
        padding: 0;
        background: white;
      }
      
      .container {
        box-shadow: none;
      }
      
      .legend {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Daily Schedule Grid</h1>
    <div class="meta">
      <strong>Date:</strong> ${date} &nbsp;|&nbsp; 
      <strong>Crew Members:</strong> ${crew.length} &nbsp;|&nbsp;
      <strong>Generated:</strong> ${new Date().toLocaleString()}
    </div>
    
    <table>
      <thead>
        <tr>
          <th class="crew-name">Crew Member</th>`;

  // Time slot headers
  for (const slot of slots) {
    const borderClass = slot.isDotted ? 'dotted' : 'solid';
    html += `\n          <th class="time-slot ${borderClass}">${slot.label}</th>`;
  }

  html += `\n        </tr>
      </thead>
      <tbody>`;

  // Crew rows
  for (const member of crew) {
    html += `\n        <tr>
          <td class="crew-name">${member.crewName}</td>`;

    // For each time slot, check if there's an assignment
    for (const slot of slots) {
      const slotMin = slot.hour * 60 + slot.minute;
      const borderClass = slot.isDotted ? 'dotted' : 'solid';

      // Find assignment that covers this slot
      const assignment = member.assignments.find(
        a => a.startMin <= slotMin && a.endMin > slotMin
      );

      if (assignment) {
        // Check if this is the start of the assignment (to avoid repeating labels)
        const isStart = assignment.startMin === slotMin;
        const content = isStart ? assignment.roleLabel : '';

        html += `
          <td class="${borderClass}">
            <div class="assignment" style="background-color: ${assignment.color.bg}; color: ${assignment.color.text};">
              ${content}
            </div>
          </td>`;
      } else {
        html += `\n          <td class="${borderClass}"></td>`;
      }
    }

    html += `\n        </tr>`;
  }

  html += `\n      </tbody>
    </table>
    
    <div class="legend">
      <strong style="width: 100%; margin-bottom: 8px;">Role Legend:</strong>`;

  // Generate legend from used roles
  const usedRoles = new Set<string>();
  for (const member of crew) {
    for (const assignment of member.assignments) {
      usedRoles.add(assignment.roleCode);
    }
  }

  for (const roleCode of Array.from(usedRoles).sort()) {
    const config = ROLE_COLORS[roleCode] || { bg: '#F5F5F5', text: '#424242', label: roleCode };
    html += `
      <div class="legend-item">
        <div class="legend-color" style="background-color: ${config.bg};"></div>
        <span>${config.label}</span>
      </div>`;
  }

  html += `
    </div>
  </div>
</body>
</html>`;

  return html;
}

async function main() {
  const date = process.argv[2] || '2025-11-22';
  const outputPath = path.join(process.cwd(), `schedule-grid-${date}.html`);

  await generateScheduleGrid(date, outputPath);
  await prisma.$disconnect();

  console.log(`🌐 Open in browser: file://${outputPath}\n`);
}

main().catch(console.error);

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import type { ScheduleEntryData } from '@/components/schedules/schedule-entry-card';
import { buildWeekList, isoWeekKey } from '@/components/schedules/week-navigator';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

type RGB = [number, number, number];

const NEUTRAL_FILL: RGB = [241, 245, 249];   // slate-100
const NEUTRAL_BORDER: RGB = [203, 213, 225]; // slate-300
const TEXT_DARK: RGB = [15, 23, 42];          // slate-900

function parseHex(hex: string | null | undefined): RGB | null {
  if (!hex) return null;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function mixWithWhite([r, g, b]: RGB, alpha: number): RGB {
  const blend = (c: number) => Math.round(255 * (1 - alpha) + c * alpha);
  return [blend(r), blend(g), blend(b)];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface CellStyles {
  fillColor: RGB;
  textColor: RGB;
  lineColor: RGB;
  lineWidth: number;
}

type PdfCell = string | { content: string; styles: CellStyles };

function entryColors(entry: ScheduleEntryData): CellStyles {
  const groupRgb = parseHex(entry.groupColor ?? null);
  if (groupRgb) {
    return {
      fillColor: mixWithWhite(groupRgb, 0.2),
      textColor: TEXT_DARK,
      lineColor: groupRgb,
      lineWidth: 0.4,
    };
  }
  return {
    fillColor: NEUTRAL_FILL,
    textColor: TEXT_DARK,
    lineColor: NEUTRAL_BORDER,
    lineWidth: 0.3,
  };
}

function buildWeekPage(
  doc: jsPDF,
  weekEntries: ScheduleEntryData[],
  weekLabel: string,
  scheduleName: string,
  filterLabels: string[],
  isFirstPage: boolean,
): void {
  if (!isFirstPage) {
    doc.addPage();
  }

  const activeDays = [...new Set(weekEntries.map((e) => e.dayOfWeek))].sort(
    (a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b),
  );
  const timeRows = [...new Set(weekEntries.map((e) => e.startTime))].sort();

  // Build lookup: "day|startTime" → entries
  const cellMap = new Map<string, ScheduleEntryData[]>();
  for (const e of weekEntries) {
    const key = `${e.dayOfWeek}|${e.startTime}`;
    const arr = cellMap.get(key) ?? [];
    arr.push(e);
    cellMap.set(key, arr);
  }

  // Page header
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(scheduleName, 14, 15);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(weekLabel, 14, 21);

  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 26);

  let startY = 29;
  if (filterLabels.length > 0) {
    doc.setFont('helvetica', 'italic');
    doc.text(`Filtered by: ${filterLabels.join(', ')}`, 14, 31);
    startY = 34;
  }

  doc.setDrawColor(200);
  doc.line(14, startY, 283, startY);
  startY += 3;

  // Build table
  const dayHeaders = activeDays.map(capitalize);
  const head: PdfCell[][] = [['Time', ...dayHeaders]];
  const body: PdfCell[][] = [];

  if (weekEntries.length === 0) {
    body.push([
      {
        content: 'No entries match the current filters.',
        styles: {
          fillColor: [255, 255, 255],
          textColor: [17, 24, 39],
          lineColor: [200, 200, 200],
          lineWidth: 0.3,
        },
      },
    ]);
  } else {
    for (const time of timeRows) {
      const row: PdfCell[] = [time];

      for (const day of activeDays) {
        const cellEntries = cellMap.get(`${day}|${time}`) ?? [];
        if (cellEntries.length === 0) {
          row.push('');
        } else {
          const content = cellEntries
            .map((e) => {
              const lines = [`${e.courseCode} (${capitalize(e.sessionType)})`];
              lines.push(`Room: ${e.roomName}`);
              const lec = e.assignedLecturerName ?? e.lecturerName;
              if (lec) lines.push(lec);
              return lines.join('\n');
            })
            .join('\n\n');

          row.push({ content, styles: entryColors(cellEntries[0]!) });
        }
      }

      body.push(row);
    }
  }

  autoTable(doc, {
    startY,
    head,
    body,
    theme: 'grid',
    headStyles: { fillColor: [51, 65, 85], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7, valign: 'top' as const, overflow: 'linebreak' as const, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 22, fontStyle: 'bold' } },
    styles: { minCellHeight: 12 },
  });
}

export function exportSchedulePdf(params: {
  entries: ScheduleEntryData[];
  scheduleName: string;
  filterLabels: string[];
}): void {
  const { entries, scheduleName, filterLabels } = params;

  // Group entries by ISO week
  const weekList = buildWeekList(entries.map((e) => e.date));

  // If there are no weeks (no entries), generate a single empty page
  if (weekList.length === 0) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    buildWeekPage(doc, [], 'No entries', scheduleName, filterLabels, true);
    const fileName = `${scheduleName.toLowerCase().replace(/\s+/g, '-')}-timetable.pdf`;
    doc.save(fileName);
    return;
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  let firstPageWritten = false;
  for (const week of weekList) {
    const weekKey = `${week.year}-W${String(week.isoWeek).padStart(2, '0')}`;
    const weekEntries = entries.filter((e) => isoWeekKey(e.date) === weekKey);

    // Skip weeks with no entries after filtering
    if (weekEntries.length === 0) continue;

    buildWeekPage(doc, weekEntries, week.label, scheduleName, filterLabels, !firstPageWritten);
    firstPageWritten = true;
  }

  // If every week was filtered out, produce a single "no entries" page
  if (!firstPageWritten) {
    buildWeekPage(doc, [], 'No matching entries', scheduleName, filterLabels, true);
  }

  const fileName = `${scheduleName.toLowerCase().replace(/\s+/g, '-')}-timetable.pdf`;
  doc.save(fileName);
}

import type { jsPDF } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';

import type { AppointmentExport } from '@/utils/appointmentExport';
import { parseIsoDate } from '@/utils/startTime';

type AutoTableFn = (doc: jsPDF, options: UserOptions) => void;

const MARGIN_X = 14;
/** mm reserved at the bottom of the page for the print margin and the "Seite X von Y" footer. */
const PAGE_BOTTOM_MARGIN = 20;
/** mm the cursor resets to when a section is pushed onto a fresh page. */
const PAGE_TOP_MARGIN = 20;
/** mm needed for a section heading line plus the first line of whatever follows it. */
const SECTION_HEADING_HEIGHT = 14;

/**
 * Renders the schedule as an A4 PDF and hands it to the browser as a download.
 *
 * jsPDF is imported here rather than at module scope so it is fetched only when an export actually
 * happens, which keeps roughly 150KB out of the page's initial bundle.
 */
export async function downloadAppointmentPdf(data: AppointmentExport, today: Date): Promise<void> {
  const [{ jsPDF: JsPdf }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new JsPdf({ unit: 'mm', format: 'a4' });

  // The source logo is 2065 x 2268, a ratio of 0.9105, so the box is deliberately not square.
  const logo = await loadLogoDataUrl();
  const textLeft = logo ? MARGIN_X + 24 : MARGIN_X;
  if (logo) {
    doc.addImage({
      imageData: logo,
      format: 'PNG',
      x: MARGIN_X,
      y: 14,
      width: 18,
      height: 19.8,
      compression: 'SLOW',
    });
  }

  renderAppointmentSections(doc, autoTable, data, today, textLeft);

  doc.save(`schichtplan-${formatFilenameDate(today)}.pdf`);
}

/**
 * Draws the title, both tables and the page footer onto an already-created document. Kept apart from
 * the logo fetch and the save step above so it can be driven directly with a real jsPDF document in a
 * test, without touching the DOM.
 */
export function renderAppointmentSections(
  doc: jsPDF,
  autoTable: AutoTableFn,
  data: AppointmentExport,
  today: Date,
  textLeft: number,
): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('1. FC Egenhausen 1921 - Dienstplan', textLeft, 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(buildSubtitle(data, today), textLeft, 28);

  let cursorY = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Termine', MARGIN_X, cursorY);
  cursorY += 4;

  if (data.appointments.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Keine Termine im gewählten Zeitraum.', MARGIN_X, cursorY + 5);
    cursorY += 14;
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: MARGIN_X, right: MARGIN_X },
      head: [['Datum', 'Uhrzeit', 'Veranstaltung', 'Besetzung', 'Eingeteilte Personen']],
      body: data.appointments.map(appointment => [
        formatLongDate(appointment.date),
        appointment.startTime ?? '-',
        appointment.name ?? '-',
        `${appointment.assignedNames.length} / ${appointment.requiredPeople}`,
        appointment.assignedNames.join(', ') || '-',
      ]),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [0, 0, 0], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 16 },
        3: { cellWidth: 16, halign: 'center' },
      },
    });
    cursorY = readFinalY(doc) + 12;
  }

  // A table that ended near the bottom of its page would otherwise draw this heading past the print
  // area, or leave it orphaned above a table that autoTable itself pushes to the next page.
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursorY + SECTION_HEADING_HEIGHT > pageHeight - PAGE_BOTTOM_MARGIN) {
    doc.addPage();
    cursorY = PAGE_TOP_MARGIN;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Mitglieder mit mehreren Diensten', MARGIN_X, cursorY);
  cursorY += 4;

  if (data.frequentMembers.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Kein Mitglied hat mehr als einen Dienst.', MARGIN_X, cursorY + 5);
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: MARGIN_X, right: MARGIN_X },
      head: [['Name', 'Anzahl', 'Termine']],
      body: data.frequentMembers.map(member => [
        member.name,
        String(member.count),
        member.dates.map(formatShortDate).join(', '),
      ]),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [0, 0, 0], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      columnStyles: {
        1: { cellWidth: 18, halign: 'center' },
      },
    });
  }

  // Drawn in a second pass because "von Y" is only knowable once the last page exists. Doing this in
  // autoTable's didDrawPage hook would stamp "Seite 1 von 1" on every page of a multi-page export.
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Seite ${page} von ${pageCount}`, MARGIN_X, doc.internal.pageSize.getHeight() - 8);
  }
}

/**
 * The logo as a data URL, downscaled to print resolution, or null when it cannot be read or drawn.
 * A missing or unprocessable crest must not lose the export.
 */
async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const response = await fetch('/fce-logo.png');
    if (!response.ok) return null;

    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    try {
      return renderLogoToDataUrl(bitmap);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

/**
 * Draws the source crest onto an offscreen canvas sized for print before jsPDF embeds it. The source
 * is 2065 x 2268, about twenty times wider than the 18mm box needs, and jsPDF otherwise embeds
 * whatever pixels it is given. 213 x 234 is 18mm at 300dpi, and 234 preserves the source's 0.9105
 * ratio, so the crest is never squashed.
 */
function renderLogoToDataUrl(bitmap: ImageBitmap): string | null {
  const width = 213;
  const height = 234;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) return null;

  context.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

/**
 * autoTable records where it stopped on the document, but the jsPDF types do not know about it. This
 * is only ever called right after an autoTable call, so a missing value means that call did not
 * record one, which is a bug in the calling convention rather than something to paper over.
 */
function readFinalY(doc: jsPDF): number {
  const withTable = doc as unknown as { lastAutoTable?: { finalY?: number } };
  const finalY = withTable.lastAutoTable?.finalY;
  if (finalY === undefined) {
    throw new Error('autoTable did not record a finalY position after drawing the appointments table.');
  }
  return finalY;
}

function buildSubtitle(data: AppointmentExport, today: Date): string {
  const generatedDate = today.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const generated = `Erstellt am ${generatedDate}`;
  if (!data.range) return generated;

  return `${formatLongDate(data.range.from)} bis ${formatLongDate(data.range.to)} · ${generated}`;
}

function formatLongDate(isoDate: string): string {
  return parseIsoDate(isoDate).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatShortDate(isoDate: string): string {
  return parseIsoDate(isoDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

/** Local calendar date, because toISOString would roll over to the next day late in the evening. */
function formatFilenameDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

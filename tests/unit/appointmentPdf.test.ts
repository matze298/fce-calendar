import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { renderAppointmentSections } from '@/utils/appointmentPdf';
import type { AppointmentExport } from '@/utils/appointmentExport';

const TODAY = new Date(2026, 8, 15);

/**
 * `count` appointments with no members assigned, which is enough to push the first table's finalY
 * close to the bottom of the page without autoTable itself needing to paginate the table (that only
 * starts happening around 36 rows at this font size and column layout). An empty frequentMembers list
 * keeps the second table as the short note rather than a table, isolating any page break seen below to
 * the guard under test rather than autoTable's own pagination of either table.
 */
function makeAppointments(count: number): AppointmentExport {
  return {
    appointments: Array.from({ length: count }, () => ({
      date: '2026-09-20',
      name: 'Veranstaltung',
      startTime: '19:00',
      requiredPeople: 2,
      assignedNames: ['Max Mustermann'],
    })),
    frequentMembers: [],
    range: { from: '2026-09-20', to: '2026-09-20' },
  };
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('renderAppointmentSections page break guard', () => {
  it('keeps the second heading on the current page when the first table leaves enough room', () => {
    // GIVEN a first table whose last row ends comfortably above the bottom margin
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    // WHEN rendering both sections
    renderAppointmentSections(doc, autoTable, makeAppointments(31), TODAY, 14);

    // THEN no page break was needed
    expect(doc.getNumberOfPages()).toBe(1);
    expect(countOccurrences(doc.output(), 'Mitglieder mit mehreren Diensten')).toBe(1);
  });

  it('moves the second heading to a fresh page when the first table would push it past the bottom margin', () => {
    // GIVEN one more row than above, which is enough to cross the guard's threshold but still well
    // short of the row count where the first table would paginate on its own
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    // WHEN rendering both sections
    renderAppointmentSections(doc, autoTable, makeAppointments(32), TODAY, 14);

    // THEN the guard added a page rather than drawing the heading off the bottom margin
    expect(doc.getNumberOfPages()).toBe(2);

    // THEN the heading and its note are drawn exactly once, on the new page, not orphaned or duplicated
    const raw = doc.output();
    expect(countOccurrences(raw, 'Mitglieder mit mehreren Diensten')).toBe(1);
    expect(countOccurrences(raw, 'Kein Mitglied hat mehr als einen Dienst.')).toBe(1);

    // THEN the footer correctly reports the total once the second page exists
    expect(raw).toContain('Seite 1 von 2');
    expect(raw).toContain('Seite 2 von 2');
  });
});

describe('renderAppointmentSections empty-state text', () => {
  it('renders placeholder text for both tables without calling autoTable', () => {
    // GIVEN no appointments and no frequent members
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const data: AppointmentExport = { appointments: [], frequentMembers: [], range: null };

    // WHEN rendering both sections
    renderAppointmentSections(doc, autoTable, data, TODAY, 14);

    // THEN both placeholder notes appear on a single page, since there was nothing to trigger the
    // page-break guard
    expect(doc.getNumberOfPages()).toBe(1);
    const raw = doc.output();
    expect(raw).toContain('Keine Termine im gewählten Zeitraum.');
    expect(raw).toContain('Kein Mitglied hat mehr als einen Dienst.');
  });
});

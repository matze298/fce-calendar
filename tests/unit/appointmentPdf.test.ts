import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { renderAppointmentSections } from '@/utils/appointmentPdf';
import type { AppointmentExport } from '@/utils/appointmentExport';

const TODAY = new Date(2026, 8, 15);

/**
 * `count` appointments with no members assigned, which is enough to push the first table's finalY
 * close to the bottom of the page without autoTable itself needing to paginate the table (that only
 * starts happening around 36 rows at this font size and column layout). An empty memberShifts list
 * keeps the second table as the short note rather than a table, isolating any page break seen below to
 * the guard under test rather than autoTable's own pagination of either table.
 */
function makeAppointments(count: number): AppointmentExport {
  return {
    appointments: Array.from({ length: count }, () => ({
      date: '2026-09-20',
      name: 'Veranstaltung',
      startTime: '19:00',
      assignedNames: ['Max Mustermann'],
    })),
    memberShifts: [],
    range: { from: '2026-09-20', to: '2026-09-20' },
  };
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('renderAppointmentSections page break guard', () => {
  it('keeps the second heading on the current page when the first table leaves room', () => {
    // GIVEN a short first table
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    // WHEN rendering both sections
    renderAppointmentSections(doc, autoTable, makeAppointments(5), TODAY, 14);

    // THEN nothing paginated and the heading is drawn once
    expect(doc.getNumberOfPages()).toBe(1);
    expect(countOccurrences(doc.output(), 'Dienste je Mitglied')).toBe(1);
  });

  it('adds a page for the second heading before the first table itself has to spill', () => {
    // GIVEN we locate the guard's own window at runtime rather than hardcoding a row count, because
    // that window shifts with any change to fonts, column widths or padding. Removing one column
    // already moved it once.
    //
    // The discriminator is that autoTable repeats a table's header on every page it spans. So a second
    // page while the appointments header still appears exactly once can only have been created by the
    // guard, not by the first table running out of room. Without the guard no such row count exists,
    // which is what makes this test fail if the guard is deleted.
    let boundary = 0;
    for (let rows = 1; rows <= 120; rows += 1) {
      const probe = new jsPDF({ unit: 'mm', format: 'a4' });
      renderAppointmentSections(probe, autoTable, makeAppointments(rows), TODAY, 14);
      const output = probe.output();
      if (probe.getNumberOfPages() === 2 && countOccurrences(output, 'Eingeteilte Personen') === 1) {
        boundary = rows;
        break;
      }
    }

    // THEN such a row count exists. If it does not, the guard is gone and everything below is vacuous
    expect(boundary).toBeGreaterThan(0);

    // WHEN rendering at that row count
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    renderAppointmentSections(doc, autoTable, makeAppointments(boundary), TODAY, 14);
    const raw = doc.output();

    // THEN the heading and its note are drawn exactly once, so the guard neither orphaned the heading
    // on the full page nor drew it twice
    expect(countOccurrences(raw, 'Dienste je Mitglied')).toBe(1);
    expect(countOccurrences(raw, 'Keine Dienste im gewählten Zeitraum vergeben.')).toBe(1);

    // THEN the footer reports the real total, which is only knowable once the last page exists
    expect(raw).toContain('Seite 1 von 2');
    expect(raw).toContain('Seite 2 von 2');
  });
});

describe('renderAppointmentSections empty-state text', () => {
  it('renders placeholder text for both tables without calling autoTable', () => {
    // GIVEN no appointments and no assigned duties
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const data: AppointmentExport = { appointments: [], memberShifts: [], range: null };

    // WHEN rendering both sections
    renderAppointmentSections(doc, autoTable, data, TODAY, 14);

    // THEN both placeholder notes appear on a single page, since there was nothing to trigger the
    // page-break guard
    expect(doc.getNumberOfPages()).toBe(1);
    const raw = doc.output();
    expect(raw).toContain('Keine Termine im gewählten Zeitraum.');
    expect(raw).toContain('Keine Dienste im gewählten Zeitraum vergeben.');
  });
});

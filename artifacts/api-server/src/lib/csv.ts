/** Minimal CSV helpers: escape a single field, and render a set of rows to a CSV string. */

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsvRow(fields: unknown[]): string {
  return fields.map(escapeCsvField).join(",");
}

/** Builds a CSV document from an array of row-sections, each with an optional heading, a header row, and data rows. */
export function buildCsvDocument(sections: { heading?: string; header: string[]; rows: unknown[][] }[]): string {
  const lines: string[] = [];
  for (const section of sections) {
    if (lines.length > 0) lines.push("");
    if (section.heading) lines.push(toCsvRow([section.heading]));
    lines.push(toCsvRow(section.header));
    for (const row of section.rows) lines.push(toCsvRow(row));
  }
  return lines.join("\r\n");
}

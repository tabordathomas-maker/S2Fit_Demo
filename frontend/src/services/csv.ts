/** CSV para Excel en español: separador «;», comillas dobles escapadas y BOM UTF-8 para conservar las tildes. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return "\uFEFF" + rows.map((row) => row.map(cell).join(";")).join("\r\n");
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]): void {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

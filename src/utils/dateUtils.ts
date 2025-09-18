export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

export function calculateDayDiff(start: Date, end: Date): number {
  if (!(start instanceof Date) || isNaN(start.getTime()) ||
      !(end instanceof Date) || isNaN(end.getTime())) {
    return NaN; // invalid input
  }

  // Normalize to UTC midnight
  const startDate = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endDate = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());

  const diffMs = endDate - startDate;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

export function calculateDayDiff(start: Date, end: Date): number {
  const startInKolkata = new Date(start.toLocaleString("en-CA", { timeZone: "Asia/Kolkata" }));
  const endInKolkata = new Date(end.toLocaleString("en-CA", { timeZone: "Asia/Kolkata" }));
  
  const startDate = new Date(startInKolkata.getFullYear(), startInKolkata.getMonth(), startInKolkata.getDate());
  const endDate = new Date(endInKolkata.getFullYear(), endInKolkata.getMonth(), endInKolkata.getDate());
  
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}
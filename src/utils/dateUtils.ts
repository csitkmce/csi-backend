// All times should be in IST (Asia/Kolkata)
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
  if (!(start instanceof Date) || isNaN(start.getTime()) ||
      !(end instanceof Date) || isNaN(end.getTime())) {
    return NaN;
  }

  // Convert to IST and normalize to midnight
  const istStart = new Date(start.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const istEnd = new Date(end.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  
  const startDate = Date.UTC(
    istStart.getFullYear(), 
    istStart.getMonth(), 
    istStart.getDate()
  );
  const endDate = Date.UTC(
    istEnd.getFullYear(), 
    istEnd.getMonth(), 
    istEnd.getDate()
  );

  const diffMs = endDate - startDate;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays;
}

// Helper function to get current IST time
export function getCurrentISTTime(): Date {
  return new Date();
}

// Helper to convert any date to IST string for logging
export function toISTString(date: Date): string {
  return date.toLocaleString("en-IN", { 
    timeZone: "Asia/Kolkata",
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}
/**
 * Ghana timezone date utilities.
 * Ghana is UTC+0 with no DST. All Supabase timestamps are stored in UTC.
 * These functions force Africa/Accra timezone for consistent display
 * regardless of the viewer's device timezone or clock.
 */

const GHANA_TZ = 'Africa/Accra';

/**
 * Format a DB timestamp as a date-only string in Ghana time.
 * Example: "25 Aug 2026"
 */
export const formatGhanaDate = (dateStr: string): string =>
  new Date(dateStr).toLocaleDateString('en-GB', { timeZone: GHANA_TZ });

/**
 * Format a DB timestamp as date+time in Ghana time.
 * Example: "25 Aug 2026, 08:42 AM"
 */
export const formatGhanaDateTime = (dateStr: string): string =>
  new Date(dateStr).toLocaleString('en-GB', {
    timeZone: GHANA_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

/**
 * Format a DB timestamp as a short date in Ghana time (US format).
 * Example: "Aug 25, 2026"
 */
export const formatGhanaDateUS = (dateStr: string): string =>
  new Date(dateStr).toLocaleDateString('en-US', {
    timeZone: GHANA_TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

/**
 * Format a DB timestamp as date+time in Ghana time (US format).
 * Example: "Aug 25, 2026, 8:42 AM"
 */
export const formatGhanaDateTimeUS = (dateStr: string): string =>
  new Date(dateStr).toLocaleString('en-US', {
    timeZone: GHANA_TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

/**
 * Get the current time in Ghana timezone as a Date object.
 * Used for relative time calculations so device clock doesn't affect output.
 */
const getGhanaNow = (): Date => {
  const now = new Date();
  const ghanaStr = now.toLocaleString('en-US', { timeZone: GHANA_TZ });
  return new Date(ghanaStr);
};

/**
 * Relative time ago string using Ghana timezone as "now".
 * Example: "5m ago", "2h ago", "Yesterday", "Aug 20"
 */
export const formatGhanaTimeAgo = (dateStr: string): string => {
  const now = getGhanaNow();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', {
    timeZone: GHANA_TZ,
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Get a date label ("Today", "Yesterday", "This Week", "Older")
 * using Ghana timezone for the current date.
 */
export const getGhanaDateLabel = (dateStr: string): string => {
  const now = getGhanaNow();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This Week';
  return 'Older';
};

/**
 * Check if a DB timestamp falls on the same day in Ghana timezone
 * as the current Ghana time.
 */
export const isGhanaSameDay = (dateStr: string): boolean => {
  const now = getGhanaNow();
  const date = new Date(dateStr);
  const ghanaDate = new Date(date.toLocaleString('en-US', { timeZone: GHANA_TZ }));
  return (
    ghanaDate.getFullYear() === now.getFullYear() &&
    ghanaDate.getMonth() === now.getMonth() &&
    ghanaDate.getDate() === now.getDate()
  );
};

/**
 * Check if a DB timestamp is within the last 7 days in Ghana timezone.
 */
export const isGhanaLastWeek = (dateStr: string): boolean => {
  const now = getGhanaNow();
  const date = new Date(dateStr);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return date >= weekAgo;
};

/**
 * Check if a DB timestamp is in the current month in Ghana timezone.
 */
export const isGhanaSameMonth = (dateStr: string): boolean => {
  const now = getGhanaNow();
  const date = new Date(dateStr);
  const ghanaDate = new Date(date.toLocaleString('en-US', { timeZone: GHANA_TZ }));
  return (
    ghanaDate.getMonth() === now.getMonth() &&
    ghanaDate.getFullYear() === now.getFullYear()
  );
};

/**
 * Get today's date string in YYYY-MM-DD format using Ghana timezone.
 * Useful for CSV filenames and date comparisons.
 */
export const getGhanaTodayISO = (): string => {
  const now = getGhanaNow();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

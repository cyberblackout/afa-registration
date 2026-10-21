import type { Notification } from '../types';

export type NotificationCategory = 'financial' | 'approvals' | 'system';

const FINANCIAL_RE = /payment|wallet|refund|revenue|top[- ]?up|transaction|invoice|billing|cashback|settlem/i;
const APPROVALS_RE = /approv|registration|agent|verif|review|pending|kyc|document/i;

/** Heuristic category — notifications carry no category field. */
export const categorizeNotification = (n: Notification): NotificationCategory => {
  const text = `${n.title} ${n.message}`;
  if (FINANCIAL_RE.test(text)) return 'financial';
  if (APPROVALS_RE.test(text)) return 'approvals';
  return 'system';
};

/**
 * API functions for notifications
 */

import { getNotifications } from '@/app/actions/notifications';
import { getFriendlyActionError } from '@/lib/action-ux';

export async function fetchNotifications() {
  const result = await getNotifications();
  if (!result.success) throw new Error(getFriendlyActionError(result.error) || 'Failed to fetch notifications');
  return result.data || [];
}

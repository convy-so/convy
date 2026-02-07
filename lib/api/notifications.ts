/**
 * API functions for notifications
 */

import { getNotifications } from '@/app/actions/notifications';

export async function fetchNotifications() {
  const result = await getNotifications();
  if (!result.success) throw new Error(result.error || 'Failed to fetch notifications');
  return result.data || [];
}

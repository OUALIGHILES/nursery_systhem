export const KAFKA = {
  TOPICS: [
    'child.enrolled',
    'child.updated',
    'attendance.checked_in',
    'attendance.checked_out',
    'attendance.absent',
    'invoice.created',
    'payment.received',
    'enrollment.approved',
    'enrollment.rejected',
    'enrollment.submitted',
    'meal.recorded',
    'activity.created',
    'incident.reported',
    'notification.requested',
    'chat.message.created',
    'chat.message.read',
    'chat.notification.requested',
  ] as const,
  DLQ_SUFFIX: '.dlq',
  MAX_PUBLISH_ATTEMPTS: 5,
  MAX_CONSUME_RETRIES: 3,
  GROUPS: {
    NOTIFICATIONS: 'nursery-notifications',
    EMAIL: 'nursery-email',
    ATTENDANCE: 'nursery-attendance',
    FINANCIAL: 'nursery-financial',
    AUDIT: 'nursery-audit',
  },
} as const;

export type KafkaTopicName = (typeof KAFKA.TOPICS)[number];

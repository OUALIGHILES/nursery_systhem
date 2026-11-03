export const CHAT_CLIENT_EVENTS = {
  JOIN: "conversation:join",
  SEND: "message:send",
  DELIVERED: "message:delivered",
  READ: "message:read",
  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",
} as const;

export const CHAT_SERVER_EVENTS = {
  MESSAGE: "message:new",
  DELIVERED: "message:delivered",
  READ: "message:read",
  TYPING: "typing:update",
  PRESENCE: "user:presence",
  NOTIFICATION: "notification:new",
} as const;

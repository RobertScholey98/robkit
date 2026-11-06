/**
 * Where robkit says what went wrong when nobody calling it can handle it:
 * core's `logError`, the guard's default `onUnavailable` and the command
 * lines' fault printing. The message says what robkit was doing; the cause
 * is the error underneath, if there is one.
 */
export type Report = (message: string, cause?: unknown) => void;

/**
 * The default {@link Report}: the message on stderr, then the cause on its
 * own, with its stack and causes.
 */
export const reportToConsole: Report = (message, cause) => {
  console.error(message);
  if (cause !== undefined) console.error(cause);
};

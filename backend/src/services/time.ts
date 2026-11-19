/**
 * Server-authoritative time and timezone utilities.
 */

export interface TimeContext {
  utcTimestamp: string;
  localDate: string; // YYYY-MM-DD in user's timezone
  timezone: string;
}

/**
 * Computes the server-authoritative UTC timestamp and the local date (YYYY-MM-DD)
 * calculated within the user's configured IANA timezone.
 *
 * @param userTimezone IANA timezone string (e.g. "Asia/Kolkata", "UTC", "America/New_York")
 * @returns TimeContext containing UTC timestamp, local date string, and resolved timezone
 */
export function getServerTimeContext(userTimezone?: string): TimeContext {
  const now = new Date();
  const utcTimestamp = now.toISOString();

  let resolvedTimezone = "UTC";
  if (userTimezone) {
    try {
      // Validate timezone identifier
      Intl.DateTimeFormat(undefined, { timeZone: userTimezone });
      resolvedTimezone = userTimezone;
    } catch {
      console.warn(`[TimeService] Invalid timezone '${userTimezone}' provided. Falling back to UTC.`);
      resolvedTimezone = "UTC";
    }
  }

  // Format local date YYYY-MM-DD in the resolved timezone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolvedTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const localDate = formatter.format(now); // en-CA outputs YYYY-MM-DD format

  return {
    utcTimestamp,
    localDate,
    timezone: resolvedTimezone,
  };
}

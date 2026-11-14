/**
 * Date and Timezone conversion utilities for TimeSafe
 * Ensures zero-leakage, point-in-time correct conversion between
 * user local time / UTC and FastAPI backend UTC ISO-8601 strings.
 */

export function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Detect the user's local IANA timezone and formatted offset string.
 */
export function getUserTimezone(referenceDate = new Date()) {
  try {
    const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
    const offsetMin = -referenceDate.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const h = pad(Math.floor(Math.abs(offsetMin) / 60));
    const m = pad(Math.abs(offsetMin) % 60);
    const offsetString = `UTC${sign}${h}:${m}`;

    // Try to get short abbreviation (e.g. IST, EST, GMT+5:30)
    let shortName = '';
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(referenceDate);
      shortName = parts.find((p) => p.type === 'timeZoneName')?.value || '';
    } catch (_) {
      shortName = offsetString;
    }

    return {
      name: tzName,
      shortName,
      offsetString,
      label: `${tzName} (${offsetString})`,
    };
  } catch (err) {
    return {
      name: 'Local',
      shortName: 'Local',
      offsetString: 'UTC+00:00',
      label: 'Local Time',
    };
  }
}

/**
 * Parse a UTC ISO-8601 string into separate date ('YYYY-MM-DD') and time ('HH:MM') strings.
 * Supports either 'local' timezone decomposition or 'utc' decomposition.
 */
export function utcIsoToParts(isoString, mode = 'local') {
  if (!isoString) {
    return { date: '', time: '', isValid: false };
  }
  const d = new Date(isoString);
  if (isNaN(d.getTime())) {
    return { date: '', time: '', isValid: false };
  }

  if (mode === 'utc') {
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    return { date, time, isValid: true };
  }

  // Local timezone
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { date, time, isValid: true };
}

/**
 * Convert calendar date ('YYYY-MM-DD') and time ('HH:MM') into an ISO-8601 UTC string.
 * Handles daylight saving transitions correctly via standard JavaScript Date objects.
 */
export function partsToUtcIso(dateStr, timeStr, mode = 'local') {
  if (!dateStr || !timeStr) {
    return {
      utcIso: '',
      isValid: false,
      error: 'Both date and time are required.',
    };
  }

  const dateParts = dateStr.split('-').map(Number);
  const timeParts = timeStr.split(':').map(Number);

  if (
    dateParts.length !== 3 ||
    timeParts.length < 2 ||
    dateParts.some(isNaN) ||
    timeParts.some(isNaN)
  ) {
    return {
      utcIso: '',
      isValid: false,
      error: 'Please enter a valid date and time.',
    };
  }

  const [year, month, day] = dateParts;
  const [hours, minutes] = timeParts;

  if (month < 1 || month > 12 || day < 1 || day > 31 || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return {
      utcIso: '',
      isValid: false,
      error: 'Values are outside valid calendar bounds.',
    };
  }

  let d;
  if (mode === 'utc') {
    d = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
    // Verify calendar rollover (e.g. Feb 31)
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
      return {
        utcIso: '',
        isValid: false,
        error: 'The specified day does not exist in the selected month.',
      };
    }
  } else {
    // Local timezone
    d = new Date(year, month - 1, day, hours, minutes, 0, 0);
    // Verify calendar rollover
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
      return {
        utcIso: '',
        isValid: false,
        error: 'The specified day does not exist in the selected month.',
      };
    }
  }

  if (isNaN(d.getTime())) {
    return {
      utcIso: '',
      isValid: false,
      error: 'Failed to construct valid timestamp.',
    };
  }

  // Return standard UTC ISO-8601 string: YYYY-MM-DDTHH:MM:SSZ
  const utcIso = d.toISOString().replace('.000Z', 'Z');
  const isFuture = d.getTime() > Date.now();

  return {
    utcIso,
    isValid: true,
    isFuture,
    dateObj: d,
  };
}

/**
 * Format a UTC ISO-8601 string for preview display: "YYYY-MM-DD HH:MM UTC"
 */
export function formatUtcPreview(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'Invalid timestamp';
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

/**
 * Format a UTC ISO-8601 string in user's local readable format: e.g. "06 Nov 2026, 01:30 PM"
 */
export function formatLocalPreview(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'Invalid timestamp';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}


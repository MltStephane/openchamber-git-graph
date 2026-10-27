/** "2 hr. ago", "yesterday", "in 3 min."; `timestamp` in unix seconds, `now` in milliseconds. */
export const relativeDate = (timestamp: number, locale: string, now = Date.now()): string => {
  const seconds = timestamp - now / 1000;
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60],
  ];
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(Math.round(seconds), 'second');
};

export const absoluteDate = (timestamp: number, locale: string): string =>
  new Date(timestamp * 1000).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

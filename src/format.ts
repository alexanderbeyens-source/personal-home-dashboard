export const LOCALE = "nl-BE";

function parseDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatNumber(value: number, fractionDigits = 2) {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatSigned(value: number, fractionDigits = 2) {
  const formatted = formatNumber(Math.abs(value), fractionDigits);
  if (value > 0) return `▲ ${formatted}`;
  if (value < 0) return `▼ ${formatted}`;
  return `= ${formatted}`;
}

export function formatEuro(value: number, fractionDigits = 2) {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatTime(value: string | Date) {
  const date = parseDate(value);
  if (!date) return "Tijdstip niet beschikbaar";
  return new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatPublishedDate(value: string | null) {
  const date = parseDate(value);
  if (!date) return "Datum niet beschikbaar";
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatMatchDate(value: string) {
  const date = parseDate(value);
  if (!date) return "Tijdstip niet beschikbaar";
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDay(value: string) {
  const date = parseDate(value);
  if (!date) return "Datum niet beschikbaar";
  return new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short" }).format(date);
}

export function formatRelative(value: string | Date | null, currentTime = Date.now()) {
  const date = parseDate(value);
  if (!date) return "nog niet bijgewerkt";
  const minutes = Math.round((currentTime - date.getTime()) / 60000);
  if (minutes < 1) return "zonet bijgewerkt";
  if (minutes < 60) return `${minutes} min geleden bijgewerkt`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} u geleden bijgewerkt`;
  return `bijgewerkt ${formatPublishedDate(date.toISOString())}`;
}

export function formatEconomicPeriod(period: string) {
  const semester = period.match(/^(\d{4})-S([12])$/);
  if (semester) return `S${semester[2]} ${semester[1]}`;
  const month = period.match(/^(\d{4})-(\d{2})$/);
  if (month) {
    return new Intl.DateTimeFormat(LOCALE, { month: "short", year: "numeric" })
      .format(new Date(Number(month[1]), Number(month[2]) - 1, 1));
  }
  if (/^\d{4}$/.test(period)) return period;
  const dateOnly = period.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(period);
  if (Number.isNaN(date.getTime())) return period;
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function weatherLabel(code: number, isDay: boolean) {
  if (code === 0) return isDay ? "Onbewolkt" : "Heldere nacht";
  if (code <= 3) return "Gedeeltelijk bewolkt";
  if (code <= 48) return "Mistig";
  if (code <= 67) return "Regenbuien";
  if (code <= 77) return "Sneeuw";
  if (code <= 82) return "Regenbuien";
  if (code <= 86) return "Sneeuwbuien";
  return "Onweer";
}

export const NEWS_CATEGORIES = [
  { id: "belgium", label: "België" },
  { id: "international", label: "Internationaal" },
  { id: "technology-ai", label: "Technologie & AI" },
  { id: "economy-business", label: "Economie & business" },
  { id: "sport", label: "Sport" },
] as const;

export function newsCategoryLabel(categoryId: string) {
  return NEWS_CATEGORIES.find((category) => category.id === categoryId)?.label ?? categoryId;
}

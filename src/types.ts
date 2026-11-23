export interface LiveResource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  updatedAt: Date | null;
}

export interface WeatherData {
  location: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  isDay: boolean;
}

export interface NewsArticle {
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
}

export interface ScoreEvent {
  id: string;
  name: string;
  date: string;
  status: string;
  shortStatus: string;
  competitors: {
    name: string;
    abbreviation: string;
    score: string;
    homeAway: string;
    logo: string | null;
    winner: boolean;
  }[];
}

export interface SportsData {
  events: ScoreEvent[];
  news: NewsArticle[];
  featuredPlayers?: { name: string; team: string; url: string }[];
}

export interface CalendarEvent {
  title: string;
  start: string;
  location: string | null;
}

export interface CalendarData {
  events: CalendarEvent[];
}

export interface HomeData {
  configured: boolean;
  devices: { name: string; state: string; domain: string }[];
  temperature: { name: string; value: string; unit: string } | null;
  vacuum: { name: string; state: string } | null;
}

export interface FinanceData {
  base: string;
  date: string;
  rates: Record<string, number>;
}

export interface Project {
  name: string;
  url: string;
  description?: string;
}

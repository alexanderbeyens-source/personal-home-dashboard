export interface LiveResource<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  notConfigured: boolean;
  updatedAt: Date | null;
  refresh: () => Promise<void>;
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
  id: string;
  title: string;
  link: string;
  sourceId: string;
  source: string;
  sourceKind: "journalism" | "official-company" | "official-institution" | "personal-blog" | "community-aggregator";
  category: string;
  language: string;
  publishedAt: string | null;
  description?: string;
  tags?: string[];
  feedPosition?: number;
  sportGroup?: "jupiler-pro-league" | "red-devils";
  coverage: {
    sourceId: string;
    source: string;
    sourceKind: NewsArticle["sourceKind"];
    category: string;
    language: string;
    title: string;
    link: string;
    publishedAt: string | null;
    description?: string;
    tags?: string[];
    feedPosition?: number;
    sportGroup?: NewsArticle["sportGroup"];
  }[];
}

export interface NewsSource {
  id: string;
  name: string;
  category: string;
  language: string;
  kind: NewsArticle["sourceKind"];
}

export interface NewsWarning {
  sourceId: string;
  source: string;
  message: string;
  stale: boolean;
  fetchedAt: string | null;
  latestPublishedAt?: string;
}

export interface NewsResponse {
  articles: NewsArticle[];
  availableCount: number;
  hasMore: boolean;
  sources: NewsSource[];
  feedStatus: {
    sourceId: string;
    fetchedAt: string | null;
    stale: boolean;
    contentStale: boolean;
    itemCount: number;
  }[];
  warnings: NewsWarning[];
  stale: boolean;
  updatedAt: string;
}

export interface ScoreEvent {
  id: string;
  name: string;
  date: string;
  state: "pre" | "in" | "post" | null;
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
  warnings?: string[];
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

export interface EconomicMetric {
  value: number;
  unit: string;
  period: string;
  previousValue: number | null;
  change: number | null;
  history: { period: string; value: number }[];
  frequency: string;
  source: string;
  sourceUrl: string;
  sourceUpdatedAt?: string;
  observationStale?: boolean;
  stale: boolean;
  fetchedAt: string | null;
  disclaimer?: string;
  consumptionBand?: string;
}

export interface EconomicPolicyRate {
  id: string;
  label: string;
  value: number;
  unit: string;
  period: string;
  lastChangeDate: string | null;
  history: { period: string; value: number }[];
  frequency: string;
  source: string;
  sourceUrl: string;
  observationStale?: boolean;
  stale: boolean;
  fetchedAt: string | null;
}

export interface EconomicSnapshot {
  value: number;
  unit: string;
  period: string;
  frequency: string;
  source: string;
  sourceUrl: string;
  priceType: string;
  observationStale: boolean;
  stale: boolean;
  fetchedAt: string | null;
}

export interface EconomicData {
  generatedAt: string;
  policyRates: {
    rates: EconomicPolicyRate[];
    source: string;
    sourceUrl: string;
  } | null;
  worldGrowth: EconomicMetric | null;
  belgiumInflation: EconomicMetric | null;
  euroAreaInflation: EconomicMetric | null;
  mortgageRates: EconomicMetric | null;
  electricityPrices: EconomicMetric | null;
  gasPrices: EconomicMetric | null;
  imiePrice: EconomicSnapshot | null;
  imieQuote: ImieQuote | null;
  warnings: { source: string; message: string; stale: boolean }[];
}

export interface BriefingStory {
  id: string;
  title: string;
  summary: string | null;
  whySelected: string | null;
  source: string;
  sourceKind: NewsArticle["sourceKind"];
  category: string;
  language: string;
  publishedAt: string | null;
  link: string;
  coverage: { source: string; link: string }[];
  sportGroup: NewsArticle["sportGroup"] | null;
}

export interface BriefingMatch extends ScoreEvent {
  link: string;
  label: "Live" | "Uitslag" | "Gepland";
  source: "ESPN";
}

export interface DailyBriefing {
  generatedAt: string;
  stale: boolean;
  topStories: BriefingStory[];
  sections: {
    belgiumInternational: BriefingStory[];
    technology: BriefingStory[];
  };
  economy: {
    stories: BriefingStory[];
    referenceRates: FinanceData | null;
    referenceLabel: string;
    indicatorDevelopments: {
      id: string;
      title: string;
      summary: string;
      source: string;
      sourceUrl: string;
      period: string;
    }[];
  };
  sports: {
    nba: {
      matches: BriefingMatch[];
      featuredPlayers: { name: string; team: string; url: string }[];
      headlines: BriefingStory[];
    };
    premierLeague: { matches: BriefingMatch[]; headlines: BriefingStory[] };
    belgianFootball: BriefingStory[];
  };
  today: {
    agendaStatus: "not-configured" | "available" | "unavailable";
    agendaEvents: CalendarEvent[];
    weather: WeatherData | null;
  };
  warnings: { source: string; message: string; stale: boolean }[];
}

export interface Project {
  name: string;
  url: string;
  description?: string;
}

export interface ImieQuote extends EconomicSnapshot {
  venue: string;
  ticker: string;
  isin: string;
  previousClose: number | null;
  changePercent: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  tradingOpen: boolean;
}

export type SportLeagueId = "nba" | "pro-league" | "premier-league";

export interface StandingEntry {
  teamId: string;
  name: string;
  shortName: string;
  abbreviation: string;
  logo: string | null;
  rank: number;
  gamesPlayed: number | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  points: number | null;
  goalDifference: number | null;
  winPercent: string | null;
  gamesBehind: string | null;
  streak: string | null;
  focus: boolean;
}

export interface StandingGroup {
  name: string;
  entries: StandingEntry[];
}

export interface FeaturedPlayerLine {
  name: string;
  team: string | null;
  profile: string | null;
  lastGame: {
    date: string;
    opponent: string | null;
    atVs: string | null;
    result: string | null;
    score: string | null;
    minutes: string | null;
    points: string | null;
    rebounds: string | null;
    assists: string | null;
    link: string | null;
  } | null;
}

export interface SportLeagueInfo {
  id: SportLeagueId;
  label: string;
  standingsLink: string;
}

export interface SportWarning {
  source: string;
  message: string;
  stale: boolean;
}

export interface SportOverview {
  league: SportLeagueInfo;
  live: ScoreEvent[];
  past: ScoreEvent[];
  upcoming: ScoreEvent[];
  standings: StandingGroup | null;
  players: FeaturedPlayerLine[];
  stale: boolean;
  warnings: SportWarning[];
}

export interface SportDetail {
  league: SportLeagueInfo;
  live: ScoreEvent[];
  past: ScoreEvent[];
  upcoming: ScoreEvent[];
  standings: StandingGroup[];
  news: NewsArticle[];
  players: FeaturedPlayerLine[];
  stale: boolean;
  warnings: SportWarning[];
}

export interface TaskItem {
  id: string;
  text: string;
  done: boolean;
  doneDate: string | null;
  due: string | null;
  overdue: boolean;
}

export interface TaskSection {
  id: "daily" | "weekly" | "monthly" | "once";
  title: string;
  period: string;
  items: TaskItem[];
}

export interface TasksData {
  today: string;
  sections: TaskSection[];
  overdue: number;
  open: number;
  total: number;
  stale: boolean;
  updatedAt: string;
}

import { useState } from "react";
import { AppShell, type PageProps } from "../components/AppShell";
import { Panel, ResourceState } from "../components/Panel";
import { NEWS_CATEGORIES, formatPublishedDate, newsCategoryLabel } from "../format";
import { useLiveResource } from "../hooks/useLiveResource";
import type { NewsResponse } from "../types";

function sourceKindLabel(kind: string) {
  const labels: Record<string, string> = {
    journalism: "Onafhankelijke journalistiek",
    "official-company": "Officiële bedrijfsupdate",
    "official-institution": "Officiële update van een instelling",
    "personal-blog": "Persoonlijke blog",
    "community-aggregator": "Community / aggregator",
  };
  return labels[kind] ?? "Brontype niet beschikbaar";
}

function NewsWarnings({ warnings }: { warnings: NewsResponse["warnings"] }) {
  if (!warnings.length) return null;
  return (
    <div className="notice-list" role="status">
      {warnings.map((warning) => (
        <p key={`${warning.sourceId}-${warning.message}`}>
          <strong>{warning.source}:</strong> {warning.message}
          {warning.stale && warning.fetchedAt && ` Laatste geslaagde update ${formatPublishedDate(warning.fetchedAt)}.`}
          {warning.latestPublishedAt && ` Recentste item: ${formatPublishedDate(warning.latestPublishedAt)}.`}
        </p>
      ))}
    </div>
  );
}

export function NewsPage(props: PageProps) {
  const [category, setCategory] = useState<(typeof NEWS_CATEGORIES)[number]["id"]>("belgium");
  const [sourceId, setSourceId] = useState("all");
  const [since, setSince] = useState("7d");
  const [sort, setSort] = useState("relevant");
  const [limit, setLimit] = useState(10);
  const sourceQuery = sourceId === "all" ? "" : `&source=${encodeURIComponent(sourceId)}`;
  const resource = useLiveResource<NewsResponse>(`/api/news?category=${category}&since=${since}&sort=${sort}&limit=${limit}${sourceQuery}`);
  const articles = resource.data?.articles ?? [];
  const sources = resource.data?.sources ?? [];
  const reset = () => setLimit(10);

  return (
    <AppShell {...props} title="Nieuws" intro={<p>Relevant nieuws uit België, de wereld, technologie, economie en sport.</p>}>
      <div className="page-grid">
        <Panel
          title={newsCategoryLabel(category)}
          eyebrow="Nieuwscentrum"
          icon="news"
          className="span-12"
          resource={resource}
          headerExtra={(
            <div className="filter-bar">
              <div className="segmented" role="group" aria-label="Nieuwscategorie">
                {NEWS_CATEGORIES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`segment${category === item.id ? " is-active" : ""}`}
                    aria-pressed={category === item.id}
                    onClick={() => { reset(); setSourceId("all"); setCategory(item.id); }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="filters">
                <label>
                  <span>Bron</span>
                  <select value={sourceId} onChange={(event) => { reset(); setSourceId(event.target.value); }}>
                    <option value="all">Alle bronnen</option>
                    {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Gepubliceerd</span>
                  <select value={since} onChange={(event) => { reset(); setSince(event.target.value); }}>
                    <option value="24h">Afgelopen 24 uur</option>
                    <option value="7d">Afgelopen 7 dagen</option>
                    <option value="30d">Afgelopen 30 dagen</option>
                    <option value="all">Alle data</option>
                  </select>
                </label>
                <label>
                  <span>Sorteren op</span>
                  <select value={sort} onChange={(event) => { reset(); setSort(event.target.value); }}>
                    <option value="relevant">Meest relevant</option>
                    <option value="recent">Meest recent</option>
                  </select>
                </label>
              </div>
            </div>
          )}
        >
          <NewsWarnings warnings={resource.data?.warnings ?? []} />
          {articles.length ? (
            <ul className="news-list">
              {articles.map((article, index) => (
                <li className="news-item" key={article.id || `${article.link}-${index}`}>
                  <p className="news-kicker"><span>{sourceKindLabel(article.sourceKind)}</span><span className="tag">{article.language.toUpperCase()}</span></p>
                  <a className="story-title" href={article.link} target="_blank" rel="noopener noreferrer">{article.title}</a>
                  {article.description && <p className="story-summary">{article.description}</p>}
                  <p className="story-meta"><span>{article.source}</span><span aria-hidden="true">·</span><time dateTime={article.publishedAt ?? undefined}>{formatPublishedDate(article.publishedAt)}</time></p>
                  {article.coverage.length > 1 && (
                    <details className="coverage">
                      <summary>Ook gebracht door {article.coverage.length - 1} {article.coverage.length === 2 ? "andere bron" : "andere bronnen"}</summary>
                      <ul>
                        {article.coverage
                          .filter((variant) => variant.sourceId !== article.sourceId || variant.link !== article.link)
                          .map((variant) => (
                            <li key={`${variant.sourceId}-${variant.link}`}><a href={variant.link} target="_blank" rel="noopener noreferrer">{variant.source}</a></li>
                          ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <ResourceState loading={resource.loading} empty="Geen artikels voor deze filters." />
          )}
          {resource.data?.hasMore && limit < 20 && (
            <button className="button-secondary" type="button" onClick={() => setLimit((current) => Math.min(20, current + 10))}>Meer artikels tonen</button>
          )}
          {resource.data?.hasMore && limit >= 20 && <p className="panel-source">Het maximum van 20 artikels voor deze weergave wordt getoond.</p>}
          <p className="panel-source">Koppen worden getoond in hun oorspronkelijke taal. Links openen bij de bron.</p>
        </Panel>
      </div>
    </AppShell>
  );
}

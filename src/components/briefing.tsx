import { Icon } from "./Icon";
import { formatMatchDate, formatPublishedDate, newsCategoryLabel } from "../format";
import type { BriefingMatch, BriefingStory } from "../types";

export function StoryMeta({ story }: { story: Pick<BriefingStory, "source" | "category" | "publishedAt" | "link"> }) {
  return (
    <p className="story-meta">
      <a href={story.link} target="_blank" rel="noopener noreferrer">{story.source}</a>
      <span aria-hidden="true">·</span>
      <span>{newsCategoryLabel(story.category)}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={story.publishedAt ?? undefined}>{formatPublishedDate(story.publishedAt)}</time>
    </p>
  );
}

export function CompactStory({ story, rank }: { story: BriefingStory; rank: number }) {
  return (
    <li className="compact-story">
      <span className="story-rank" aria-hidden="true">{rank}</span>
      <div>
        <a className="story-title" href={story.link} target="_blank" rel="noopener noreferrer">{story.title}</a>
        {story.summary && <p className="story-summary clamp-2">{story.summary}</p>}
        <StoryMeta story={story} />
      </div>
    </li>
  );
}

export function StoryCard({ story, featured = false }: { story: BriefingStory; featured?: boolean }) {
  return (
    <article className={`story-card${featured ? " is-featured" : ""}`}>
      <a className="story-title" href={story.link} target="_blank" rel="noopener noreferrer">
        {story.title} <Icon name="arrow" size={14} className="inline-icon" />
      </a>
      <p className="story-summary">
        {story.summary ?? "De bron gaf geen samenvatting; open het originele artikel voor details."}
      </p>
      {featured && story.whySelected && <p className="story-why"><strong>Waarom geselecteerd:</strong> {story.whySelected}</p>}
      <StoryMeta story={story} />
      {story.coverage.length > 0 && (
        <p className="story-coverage">
          Ook gebracht door{" "}
          {story.coverage.map((item, index) => (
            <span key={`${item.source}-${item.link}`}>
              {index > 0 && ", "}
              <a href={item.link} target="_blank" rel="noopener noreferrer">{item.source}</a>
            </span>
          ))}
        </p>
      )}
    </article>
  );
}

export function StoryList({ stories, empty }: { stories: BriefingStory[]; empty: string }) {
  return stories.length
    ? <div className="story-list">{stories.map((story) => <StoryCard key={story.id} story={story} />)}</div>
    : <p className="empty-state">{empty}</p>;
}

export function BriefingMatches({ matches }: { matches: BriefingMatch[] }) {
  if (!matches.length) return <p className="empty-state">Geen wedstrijden in de afgelopen of komende 24 uur.</p>;
  return (
    <ul className="match-list">
      {matches.map((match) => (
        <li key={match.id}>
          <a className="match-row" href={match.link} target="_blank" rel="noopener noreferrer">
            <span className={`match-label label-${match.label === "Live" ? "live" : match.label === "Uitslag" ? "result" : "scheduled"}`}>{match.label}</span>
            <span className="match-teams">
              {match.competitors.map((team) => (
                <span key={`${match.id}-${team.homeAway}`}>
                  {team.name} <strong className="score">{match.label === "Gepland" ? "" : team.score || "—"}</strong>
                </span>
              ))}
            </span>
            <time dateTime={match.date}>{formatMatchDate(match.date)}</time>
          </a>
        </li>
      ))}
    </ul>
  );
}

import Link from "next/link";

import { ToolAppSummary } from "@/lib/types";

type AppCardProps = {
  app: ToolAppSummary;
};

export function AppCard({ app }: AppCardProps) {
  return (
    <Link className="app-card" href={`/apps/${app.slug}`}>
      <div className="app-card__header">
        <p className={`status-pill status-pill--${app.status}`}>{app.status}</p>
        <span className="app-card__arrow">Open</span>
      </div>
      <div className="app-card__body">
        <h3>{app.title}</h3>
        <p>{app.summary}</p>
      </div>
      <div className="app-card__tags">
        {app.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </Link>
  );
}


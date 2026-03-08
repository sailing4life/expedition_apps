import { AppCard } from "@/components/app-card";
import { fetchApps } from "@/lib/api";

export default async function HomePage() {
  const apps = await fetchApps();

  return (
    <div className="page-stack">
      <section className="catalog panel catalog-panel">
        <div className="catalog__header">
          <div>
            <h2>Select an app workspace</h2>
          </div>
          <p className="catalog__hint">{apps.length} apps available</p>
        </div>
        <div className="catalog__grid">
          {apps.map((app) => (
            <AppCard app={app} key={app.slug} />
          ))}
        </div>
      </section>
    </div>
  );
}

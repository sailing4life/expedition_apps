import Link from "next/link";
import { notFound } from "next/navigation";

import { AppWorkspace } from "@/components/app-workspace";
import { ModelAgreementWorkspace } from "@/components/model-agreement-workspace";
import { RoutingFiguresWorkspace } from "@/components/routing-figures-workspace";
import { WeatherWorkspace } from "@/components/weather-workspace";
import { fetchAppDetail, getApiBaseUrl } from "@/lib/api";

type AppPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function AppPage({ params }: AppPageProps) {
  const { slug } = await params;
  const app = await fetchAppDetail(slug);
  const apiBaseUrl = getApiBaseUrl();

  if (!app) {
    notFound();
  }

  return (
    <div className="page-stack">
      <section className="panel app-hero">
        <Link className="back-link" href="/">
          Back to catalog
        </Link>
        <div className="app-hero__body">
          <div>
            <p className="eyebrow">Tool workspace</p>
            <h1>{app.title}</h1>
            <p>{app.summary}</p>
          </div>
          <div className={`status-pill status-pill--${app.status}`}>{app.status}</div>
        </div>
      </section>
      {app.slug === "model-agreement" ? (
        <ModelAgreementWorkspace apiBaseUrl={apiBaseUrl} app={app} />
      ) : app.slug === "routing-figures" ? (
        <RoutingFiguresWorkspace apiBaseUrl={apiBaseUrl} app={app} />
      ) : app.slug === "weather-app" ? (
        <WeatherWorkspace apiBaseUrl={apiBaseUrl} app={app} />
      ) : (
        <AppWorkspace apiBaseUrl={apiBaseUrl} app={app} />
      )}
    </div>
  );
}

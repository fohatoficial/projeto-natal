import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { initDisplayMode, isTotemDebug } from "../lib/pipoca/displayMode";


import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Pipoca & Cena — Tela Brasil" },
      {
        name: "description",
        content:
          "Experiência interativa Tela Brasil: escolha um filme brasileiro, tire sua foto e entre em cena.",
      },
      { name: "author", content: "Tela Brasil" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: "Pipoca & Cena — Tela Brasil" },
      { name: "twitter:title", content: "Pipoca & Cena — Tela Brasil" },
      { name: "description", content: "Tela Brasil: Cine Scene Creator lets users star in movie scenes." },
      { property: "og:description", content: "Tela Brasil: Cine Scene Creator lets users star in movie scenes." },
      { name: "twitter:description", content: "Tela Brasil: Cine Scene Creator lets users star in movie scenes." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d62278a8-0123-485a-b09f-94488a9d83df/id-preview-5695388c--a41771ec-482f-4dc3-9092-09c6c271363e.lovable.app-1781437037003.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d62278a8-0123-485a-b09f-94488a9d83df/id-preview-5695388c--a41771ec-482f-4dc3-9092-09c6c271363e.lovable.app-1781437037003.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <DisplayModeBoot />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}

function DisplayModeBoot() {
  const [debug, setDebug] = useState(false);
  const [box, setBox] = useState({ vw: 0, vh: 0, rw: 0, rh: 0, cw: 0, ch: 0 });

  useEffect(() => {
    initDisplayMode();
    const dbg = isTotemDebug();
    setDebug(dbg);
    if (!dbg) return;
    const measure = () => {
      const root = document.body.firstElementChild as HTMLElement | null;
      const choose = document.querySelector(".pipoca-film-choose-screen") as HTMLElement | null;
      setBox({
        vw: window.innerWidth,
        vh: window.innerHeight,
        rw: root?.clientWidth ?? 0,
        rh: root?.clientHeight ?? 0,
        cw: choose?.clientWidth ?? 0,
        ch: choose?.clientHeight ?? 0,
      });
    };
    measure();
    const id = window.setInterval(measure, 500);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, []);

  if (!debug) return null;
  return (
    <div className="pipoca-totem-debug-badge">
      {`TOTEM MODE
viewport: ${box.vw} × ${box.vh}
root: ${box.rw} × ${box.rh}
choose: ${box.cw} × ${box.ch}`}
    </div>
  );
}


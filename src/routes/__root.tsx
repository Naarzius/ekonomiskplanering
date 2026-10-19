import { createRootRoute, HeadContent, Link, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Sidan finns inte</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Adressen du gick till finns inte eller har flyttats.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Till planeringen
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Ekonomisk planering" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  // Följer systemets ljusa eller mörka läge, precis som planeringsvyn gör.
  useEffect(() => {
    const fraga = window.matchMedia("(prefers-color-scheme: dark)");
    const stall = () => document.documentElement.classList.toggle("dark", fraga.matches);
    stall();
    fraga.addEventListener("change", stall);
    return () => fraga.removeEventListener("change", stall);
  }, []);

  return (
    <>
      <HeadContent />
      <Outlet />
    </>
  );
}

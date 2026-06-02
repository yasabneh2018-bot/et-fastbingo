import { createFileRoute } from "@tanstack/react-router";

const manifest = {
  name: "Fast Keno",
  short_name: "FastKeno",
  description: "Fast Keno game",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#0b1518",
  theme_color: "#0b1518",
  orientation: "portrait",
};

export const Route = createFileRoute("/api/public/manifest")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(manifest, {
          headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
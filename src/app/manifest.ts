import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Beeexy — Your Health AI",
    short_name: "Beeexy",
    description: "Understand your symptoms, prepare for care, and keep your health journey in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#4340E8",
    orientation: "portrait",
    categories: ["health", "medical", "lifestyle"],
    icons: [
      { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

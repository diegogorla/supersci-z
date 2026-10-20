import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SUPER SCI-Z",
    short_name: "SCI-Z",
    description: "Revista científica internacional em sete idiomas.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/logo-z-orbit.png?v=60a283f03d83", sizes: "512x512", type: "image/png" },
      { src: "/apple-touch-icon.png?v=60a283f03d83", sizes: "180x180", type: "image/png" },
    ],
  };
}

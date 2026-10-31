import type { Metadata } from "next";
import "./globals.css";
import "../features/office/components/hud-glass.css";

export const metadata: Metadata = {
  title: "Virtual Office — A little closer, wherever you work",
  description:
    "A shared place for distributed teams. Discover the vision for Virtual Office, a thoughtful pixel-art workspace built around people.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

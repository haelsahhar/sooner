import type { Metadata, Viewport } from "next";
import RegisterSW from "./components/RegisterSW";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sooner · earlier appointment alerts",
  description: "Get an email when your doctor at Rouse Hill Town Medical Centre has an earlier appointment.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "Sooner", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0F766E",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}

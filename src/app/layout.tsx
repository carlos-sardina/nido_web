import type { Metadata, Viewport } from "next";
import { ViewportLock } from "@/components/nido/ViewportLock";
import "../styles/index.css";

export const metadata: Metadata = {
  title: "Nido app",
  applicationName: "Nido",
  description:
    "Nido connects users with local childcare providers, offering a platform to find, compare, and book trusted caregivers for their children.",
  robots: {
    index: false,
    follow: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nido",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#F8F5F0",
  interactiveWidget: "overlays-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-MX" className="min-h-dvh">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-dvh m-0 font-sans">
        <ViewportLock />
        {children}
      </body>
    </html>
  );
}

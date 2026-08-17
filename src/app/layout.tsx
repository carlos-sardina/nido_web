import type { Metadata } from "next";
import "../styles/index.css";

export const metadata: Metadata = {
  title: "Nido app",
  description:
    "Nido connects users with local childcare providers, offering a platform to find, compare, and book trusted caregivers for their children.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-MX" className="h-full">
      <body className="h-full m-0 font-sans">{children}</body>
    </html>
  );
}

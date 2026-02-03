import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Tracker",
  description: "Track job applications with AI-powered JD parsing",
  applicationName: "Job Tracker",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Job Tracker",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "Job Tracker",
    title: "Job Tracker",
    description: "Track job applications with AI-powered JD parsing",
  },
  twitter: {
    card: "summary",
    title: "Job Tracker",
    description: "Track job applications with AI-powered JD parsing",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#f97316",
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-beige-50 font-sans text-stone-800 antialiased">
        {children}
      </body>
    </html>
  );
}

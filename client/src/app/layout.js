import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

export const metadata = {
  title: "MB Boiler ERP",
  description: "MB Boiler & Heizung AG — Enterprise Resource Planning",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MB Techniker",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="de"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col font-sans antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

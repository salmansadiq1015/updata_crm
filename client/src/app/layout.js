import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AppProviders } from "@/providers/app-providers";
import { APP_DESCRIPTION, APP_PRODUCT_NAME } from "@/shared/constants/application";
import "./globals.css";

export const metadata = {
  title: APP_PRODUCT_NAME,
  description: APP_DESCRIPTION,
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

import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AppProviders } from "@/providers/app-providers";
import { APP_DESCRIPTION, APP_PRODUCT_NAME } from "@/shared/constants/application";
import { LOCALE_COOKIE, normalizeLocale, directionFor } from "@/lib/i18n/locale-config";
import "./globals.css";

export const metadata = {
  title: APP_PRODUCT_NAME,
  description: APP_DESCRIPTION,
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default async function RootLayout({ children }) {
  // Read the persisted locale from the cookie so the server renders the user's
  // actual language. This keeps SSR and the first client render in agreement —
  // including subtrees that hydrate inside a Suspense boundary (e.g. the login
  // form via `useSearchParams`) — which a client-only, localStorage-derived
  // locale cannot, and which previously caused a hydration mismatch.
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);

  return (
    <html
      lang={locale}
      dir={directionFor(locale)}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col font-sans antialiased">
        <AppProviders initialLocale={locale}>{children}</AppProviders>
      </body>
    </html>
  );
}

import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Script from "next/script";
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

const devServiceWorkerCleanupScript = `
(function () {
  if (!("serviceWorker" in navigator)) return;
  var reloadKey = "dev-sw-cleanup-before-app";
  var hadController = Boolean(navigator.serviceWorker.controller);
  var clearCaches = function () {
    if (!("caches" in window)) return Promise.resolve();
    return window.caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key.indexOf("serwist") !== -1 ||
          key.indexOf("workbox") !== -1 ||
          key.indexOf("precache") !== -1 ||
          key.indexOf("mobile-") === 0;
      }).map(function (key) { return window.caches.delete(key); }));
    }).catch(function () {});
  };
  navigator.serviceWorker.getRegistrations()
    .then(function (registrations) {
      return Promise.all(registrations.map(function (registration) {
        return registration.unregister();
      }));
    })
    .then(clearCaches)
    .then(function () {
      if (hadController && !sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, "1");
        window.location.reload();
      }
    })
    .catch(function () {});
})();
`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="de"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col font-sans antialiased">
        {process.env.NODE_ENV === "development" && (
          <Script
            id="dev-service-worker-cleanup"
            strategy="beforeInteractive"
            dangerouslySetInnerHTML={{ __html: devServiceWorkerCleanupScript }}
          />
        )}
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

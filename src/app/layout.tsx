import { AdminEntry } from "@/components/admin-entry";
import { Providers } from "@/components/providers";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Market — FINN scrape",
  description: "FINN.no market pricing for the rental fleet",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#d1fae5_0%,_#eef2f1_40%,_#f3f6f5_100%)]">
          <header className="border-b border-stone-200/80 bg-white/80 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
              <div className="font-semibold tracking-tight text-teal-900">
                Varebil Market
              </div>
              <AdminEntry
                adminUrl={
                  process.env.PUBLIC_ADMIN_APP_URL || "http://localhost:5173"
                }
                accessCode={process.env.PUBLIC_ADMIN_ACCESS_CODE || ""}
              />
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6">
            <Providers>{children}</Providers>
          </main>
        </div>
      </body>
    </html>
  );
}

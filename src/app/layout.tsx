import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "KOINO Agency",
  description: "AI-powered insurance team management — built for agency owners.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-ink min-h-screen">
        <div className="flex">
          <Sidebar />
          <main className="flex-1 min-h-screen">
            <div className="px-8 py-8 max-w-7xl mx-auto">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}

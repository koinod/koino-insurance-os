import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "KOINO Insurance OS",
  description: "Operating system for insurance teams. Pipeline → Policy → Payout.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg-base text-ink-primary">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 ml-64 min-h-screen">{children}</main>
        </div>
      </body>
    </html>
  );
}

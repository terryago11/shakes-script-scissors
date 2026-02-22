import type { Metadata } from "next";
import "./globals.css";
import { ProjectProvider } from "@/lib/project/ProjectStore";

export const metadata: Metadata = {
  title: "ShakesScriptScissors",
  description: "Interactively cut Shakespeare scripts for production",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <ProjectProvider>{children}</ProjectProvider>
      </body>
    </html>
  );
}

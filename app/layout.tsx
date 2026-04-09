import type { Metadata } from "next";
import "./globals.css";
import { ProjectProvider } from "@/lib/project/ProjectStore";
import { ThemeProvider } from "@/lib/ui/ThemeContext";

export const metadata: Metadata = {
  title: "ShakesScriptScissors",
  description: "Interactively cut Shakespeare scripts for production",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✂</text></svg>",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&family=UnifrakturMaguntia&display=swap"
          rel="stylesheet"
          precedence="default"
        />
      </head>
      <body className="min-h-screen font-sans bg-white dark:bg-stone-950 dark:text-stone-100">
        <ThemeProvider>
          <ProjectProvider>{children}</ProjectProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CalmSense",
  description: "Your warm and soothing relaxation companion",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col font-sans bg-clay-soft text-slate-text">
        {children}
      </body>
    </html>
  );
}

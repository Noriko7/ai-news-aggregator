import "./globals.css";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "AI News Aggregator",
  description: "Personal and Department AI News Tracker",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

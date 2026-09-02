import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PERIO LIVE | Dr. Alghalia Al-Mansoori',
  description: 'Interactive CPD Audience Response',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
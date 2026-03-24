import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
};

export const metadata: Metadata = {
    title: "CTNR Optimizer | 컨테이너 적재 최적화",
    description: "A23 DB 기반 컨테이너 적재 최적화 및 3D 시각화 솔루션",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ko" className="dark">
            <body className={`${inter.className} min-h-screen bg-[#030712] md:overflow-hidden`}>
                {children}
            </body>
        </html>
    );
}


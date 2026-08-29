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
    manifest: "/manifest.json",
    appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
        title: "CTNR",
    },
    icons: {
        icon: "/icon.svg",
        apple: "/icon.svg",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ko" className="dark" suppressHydrationWarning>
            <head>
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
                            if (typeof window !== 'undefined' && window.performance && typeof window.performance.measure === 'function') {
                                const _origMeasure = window.performance.measure.bind(window.performance);
                                window.performance.measure = function(name, startMark, endMark) {
                                    try {
                                        return _origMeasure(name, startMark, endMark);
                                    } catch (e) {
                                        // Next.js Turbopack negative timestamp issue suppression
                                        return;
                                    }
                                };
                            }
                        `,
                    }}
                />
            </head>
            <body className={`${inter.className} min-h-screen bg-[#030712] md:overflow-hidden`} suppressHydrationWarning>
                {children}
            </body>
        </html>
    );
}


'use client';

import React, { useState, useEffect } from 'react';
import { Maximize, Minimize } from 'lucide-react';

export default function FullscreenButton() {
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleFullscreen = async () => {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch (e) {
            console.error('Fullscreen toggle error:', e);
        }
    };

    return (
        <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 transition-all flex items-center justify-center cursor-pointer"
            title={isFullscreen ? '전체화면 종료 (ESC)' : '전체화면 전환'}
        >
            {isFullscreen ? (
                <Minimize className="w-4 h-4 text-sky-400" />
            ) : (
                <Maximize className="w-4 h-4 text-slate-400" />
            )}
        </button>
    );
}

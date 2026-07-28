"use client";

import { useEffect, useState } from "react";
import { Download, Share, PlusSquare, X, Smartphone, CheckCircle2 } from "lucide-react";

export default function PWAInstallPrompt() {
    const [mounted, setMounted] = useState<boolean>(false);
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isStandalone, setIsStandalone] = useState<boolean>(false);
    const [isIOS, setIsIOS] = useState<boolean>(false);
    const [showBanner, setShowBanner] = useState<boolean>(false);
    const [showIOSModal, setShowIOSModal] = useState<boolean>(false);
    const [installedSuccess, setInstalledSuccess] = useState<boolean>(false);

    useEffect(() => {
        setMounted(true);

        // Service Worker 등록
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker
                .register("/sw.js")
                .then((reg) => console.log("SW registered:", reg.scope))
                .catch((err) => console.log("SW reg failed:", err));
        }

        // 1. 이미 앱(Standalone 모드)으로 실행 중인지 확인
        const checkStandalone = () => {
            const isStandaloneMode =
                window.matchMedia("(display-mode: standalone)").matches ||
                (window.navigator as any).standalone === true ||
                document.referrer.includes("android-app://");
            setIsStandalone(isStandaloneMode);
        };

        checkStandalone();

        // 2. iOS 기기 여부 감지
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIPhoneOrIPad = /iphone|ipad|ipod/.test(userAgent);
        setIsIOS(isIPhoneOrIPad);

        // 3. Android / Chrome beforeinstallprompt 이벤트 캡처
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
            
            // 닫은 적이 없다면 배너 노출
            const isDismissed = localStorage.getItem("ctnr_pwa_dismissed");
            if (!isDismissed) {
                setShowBanner(true);
            }
        };

        window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

        // iOS 브라우저에서 접속 시 배너 노출 (닫은 이력이 없을 때)
        if (isIPhoneOrIPad && !localStorage.getItem("ctnr_pwa_dismissed")) {
            setShowBanner(true);
        }

        // 앱 설치 완료 감지
        window.addEventListener("appinstalled", () => {
            setDeferredPrompt(null);
            setShowBanner(false);
            setInstalledSuccess(true);
            setTimeout(() => setInstalledSuccess(false), 5000);
        });

        return () => {
            window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        };
    }, []);

    // 닫기 처리
    const handleDismiss = () => {
        setShowBanner(false);
        localStorage.setItem("ctnr_pwa_dismissed", Date.now().toString());
    };

    // 설치 버튼 클릭 이벤트
    const handleInstallClick = async () => {
        if (deferredPrompt) {
            // Android / Chrome 네이티브 설치 프롬프트 띄우기
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === "accepted") {
                setShowBanner(false);
            }
            setDeferredPrompt(null);
        } else if (isIOS) {
            // iOS 사용자는 홈 화면 추가 가이드 모달 출력
            setShowIOSModal(true);
        } else {
            // 기타 브라우저 안내
            setShowIOSModal(true);
        }
    };

    // 마운트 전이거나 이미 설치된 Standalone 모드이면 아무것도 띄우지 않음 (Hydration 에러 방지)
    if (!mounted || isStandalone) {
        return null;
    }

    return (
        <>
            {/* 1. 하단 PWA 앱 설치 유도 배너 */}
            {showBanner && (
                <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-6 md:max-w-md animate-in fade-in slide-in-from-bottom-5 duration-300">
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-4 backdrop-blur-xl border border-sky-500/30 shadow-2xl shadow-sky-950/50">
                        {/* 상단 장식 빛 투사 */}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-20 bg-sky-500/20 rounded-full blur-2xl pointer-events-none" />

                        <div className="flex items-start gap-3">
                            <div className="relative flex-shrink-0">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 p-0.5 shadow-lg shadow-sky-500/20">
                                    <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                                        <Smartphone className="w-6 h-6 text-sky-400" />
                                    </div>
                                </div>
                                <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-4 w-4 bg-sky-500"></span>
                                </span>
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                                        CTNR 전용 앱으로 설치
                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                                            주소창 제거
                                        </span>
                                    </h3>
                                    <button
                                        onClick={handleDismiss}
                                        className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
                                        aria-label="닫기"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                                    모바일 주소창 없이 모바일 전용 풀스크린 화면으로 편리하게 사용하실 수 있습니다.
                                </p>

                                <div className="mt-3 flex items-center gap-2">
                                    <button
                                        onClick={handleInstallClick}
                                        className="flex-1 py-2 px-3 rounded-xl font-medium text-xs text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:scale-95 transition-all shadow-md shadow-sky-600/30 flex items-center justify-center gap-1.5"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        {deferredPrompt ? "1초만에 앱 설치하기" : "홈 화면에 앱 추가하기"}
                                    </button>
                                    <button
                                        onClick={handleDismiss}
                                        className="py-2 px-3 rounded-xl text-xs text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/50 transition-colors"
                                    >
                                        나중에
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 2. iOS Safari 홈 화면 추가 안내 모달 */}
            {showIOSModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-slate-900 border border-sky-500/30 p-6 shadow-2xl">
                        <button
                            onClick={() => setShowIOSModal(false)}
                            className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-full bg-slate-800/60"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="text-center">
                            <div className="mx-auto w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center mb-4">
                                <Smartphone className="w-8 h-8 text-sky-400" />
                            </div>

                            <h3 className="text-lg font-bold text-white mb-1">
                                홈 화면에 앱 추가 방법
                            </h3>
                            <p className="text-xs text-slate-400 mb-6">
                                Safari 브라우저에서 주소창 없이 전용 앱으로 사용하는 방법입니다.
                            </p>

                            <div className="space-y-4 text-left">
                                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                    <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-300 font-bold text-xs flex items-center justify-center shrink-0">
                                        1
                                    </div>
                                    <div className="text-xs">
                                        <p className="text-white font-medium flex items-center gap-1">
                                            하단 중앙의 <Share className="w-4 h-4 text-sky-400 inline" /> <span className="text-sky-300 font-semibold">[공유]</span> 버튼을 누릅니다.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                    <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-300 font-bold text-xs flex items-center justify-center shrink-0">
                                        2
                                    </div>
                                    <div className="text-xs">
                                        <p className="text-white font-medium flex items-center gap-1">
                                            메뉴를 아래로 스크롤하여 <PlusSquare className="w-4 h-4 text-sky-400 inline" /> <span className="text-sky-300 font-semibold">[홈 화면에 추가]</span>를 선택합니다.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                    <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-300 font-bold text-xs flex items-center justify-center shrink-0">
                                        3
                                    </div>
                                    <div className="text-xs">
                                        <p className="text-white font-medium">
                                            우측 상단의 <span className="text-sky-300 font-semibold">[추가]</span> 버튼을 누르면 스마트폰 앱 아이콘이 생성됩니다!
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowIOSModal(false)}
                                className="w-full mt-6 py-3 rounded-xl font-semibold text-sm text-white bg-sky-600 hover:bg-sky-500 transition-colors"
                            >
                                확인했습니다
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 3. 설치 성공 알림 Toast */}
            {installedSuccess && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-2xl bg-emerald-600 text-white font-medium text-xs shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>CTNR 앱 설치가 완료되었습니다! 홈 화면에서 실행해 주세요.</span>
                </div>
            )}
        </>
    );
}

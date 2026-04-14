import React, { useState, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, PerspectiveCamera, Grid, Sparkles, Html } from '@react-three/drei';
import * as THREE from 'three';
import { PackingResult, PackedItem } from '@/lib/types';
import { Info, Maximize, Box, Ruler, Move, RotateCw, RefreshCw } from 'lucide-react';

interface ProductBoxProps {
    item: PackedItem;
    idx: number;
    isHighlighted: boolean;
}

function ProductBox({ item, idx, isHighlighted }: ProductBoxProps) {
    const { x, y, z, w, h, l, product } = item;
    const [hovered, setHovered] = useState(false);

    // Three.js coordinate system:
    // packer X (width)  -> Three.js X
    // packer Z (height) -> Three.js Y (up)
    // packer Y (depth)  -> Three.js Z (into screen)
    const position: [number, number, number] = [
        (x + w / 2) / 1000,        // Three.js X = packer X
        (z + h / 2) / 1000,        // Three.js Y = packer Z (height from floor)
        -(y + l / 2) / 1000        // Three.js Z = packer Y (depth, negated for correct orientation)
    ];

    const size: [number, number, number] = [w / 1000, h / 1000, l / 1000];

    // Highlight logic
    const activeHover = hovered || isHighlighted;

    return (
        <group
            onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
            onPointerOut={() => setHovered(false)}
        >
            <mesh position={position}>
                <boxGeometry args={size} />
                <meshStandardMaterial
                    color={isHighlighted ? "#ef4444" : (activeHover ? "#f59e0b" : (product.allow_lay_down ? "#38bdf8" : "#818cf8"))}
                    transparent
                    opacity={isHighlighted ? 0.95 : (activeHover ? 1.0 : 0.7)}
                    roughness={0.2}
                    metalness={0.1}
                    emissive={isHighlighted ? "#ef4444" : (activeHover ? "#fbbf24" : "black")}
                    emissiveIntensity={isHighlighted ? 0.5 : (activeHover ? 0.3 : 0)}
                />
                <Edges color={isHighlighted ? "#ef4444" : (activeHover ? "#fbbf24" : "#ffffff44")} threshold={15} />
            </mesh>

            {hovered && (
                <Html position={position} distanceFactor={10} zIndexRange={[100, 0]}>
                    <div className="bg-black/95 backdrop-blur-md border border-amber-500/50 p-3 rounded-xl shadow-[0_0_30px_rgba(245,158,11,0.3)] text-[10px] w-44 pointer-events-none select-none animate-in fade-in zoom-in duration-300">
                        <div className="flex items-center gap-2 mb-1.5">
                            <Box className="w-3 h-3 text-amber-500" />
                            <p className="text-amber-400 font-black truncate">{product.model_name}</p>
                        </div>
                        <div className="flex flex-col gap-1 text-slate-300 font-medium">
                            <p className="flex justify-between border-b border-white/5 pb-1"><span>치수(mm)</span> <span className="text-white">{w} x {l} x {h}</span></p>
                            <p className="flex justify-between border-b border-white/5 pb-1"><span>위치(X,Y,Z)</span> <span className="text-white">{x}, {y}, {z}</span></p>
                            <p className="flex justify-between"><span>적재타입</span> <span className="text-white uppercase">{item.orientation}</span></p>
                        </div>
                    </div>
                </Html>
            )}
        </group>
    );
}

interface ContainerViewerProps {
    result: PackingResult | null;
    highlightedProduct?: string | null;
}

export default function ContainerViewer({ result, highlightedProduct }: ContainerViewerProps) {
    const [panMode, setPanMode] = useState(false);
    const controlsRef = useRef<any>(null);

    const resetCamera = () => {
        if (controlsRef.current) {
            controlsRef.current.reset();
        }
    };

    if (!result) return (
        <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-4 bg-[#0a0a0f] rounded-3xl border border-white/5">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center animate-pulse">
                <Box className="w-8 h-8 opacity-20" />
            </div>
            <p className="text-sm font-medium tracking-wide">시뮬레이션 실행 대기 중...</p>
        </div>
    );

    const { container, items } = result;

    const cw = container.width / 1000;
    const cl = container.length / 1000;
    const ch = container.height / 1000;

    return (
        <div className="w-full h-full bg-[#030712] relative flex flex-col md:block rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
            <div className="relative flex-1 min-h-[260px] md:min-h-0 md:w-full md:h-full">
            <Canvas shadows gl={{ antialias: true }}>
                <PerspectiveCamera makeDefault position={[cw * 1.5, ch * 2.5, cl * 2]} fov={45} />
                <OrbitControls 
                    ref={controlsRef}
                    makeDefault 
                    enableDamping 
                    dampingFactor={0.05}
                    touches={panMode ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE } : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
                    mouseButtons={panMode ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE } : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
                />

                <ambientLight intensity={0.7} />
                <spotLight position={[10, 20, 10]} angle={0.2} penumbra={1} intensity={2} castShadow />
                <pointLight position={[-10, 10, -10]} intensity={1} />
                <pointLight position={[5, -5, 5]} intensity={0.5} color="#38bdf8" />

                {/* Container box: floor at Y=0, so center at Y=ch/2, depth centered at Z=-cl/2 */}
                <group position={[cw / 2, ch / 2, -cl / 2]}>
                    <mesh>
                        <boxGeometry args={[cw, ch, cl]} />
                        <meshStandardMaterial color="#38bdf8" transparent opacity={0.03} side={THREE.BackSide} />
                        <Edges color="#38bdf8" threshold={15} opacity={0.3} transparent />
                    </mesh>
                    {/* Floor plane at bottom of container */}
                    <mesh position={[0, -ch / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[cw, cl]} />
                        <meshStandardMaterial color="#38bdf8" transparent opacity={0.05} />
                    </mesh>
                </group>

                <Grid
                    position={[0, -0.01, 0]}
                    args={[20, 20]}
                    sectionColor="#38bdf8"
                    cellColor="#1e293b"
                    fadeDistance={30}
                    sectionSize={1}
                    infiniteGrid
                />

                {items.map((item, idx) => (
                    <ProductBox
                        key={`${idx}`}
                        item={item}
                        idx={idx}
                        isHighlighted={highlightedProduct === item.product.model_name}
                    />
                ))}

                <Sparkles count={40} position={[cw / 2, ch / 2, -cl / 2]} scale={[cw * 2, ch * 2, cl * 2]} size={0.5} opacity={0.1} color="#38bdf8" />
            </Canvas>

            {/* Camera Control Buttons */}
            <div className="absolute top-3 right-3 md:top-6 md:right-6 flex flex-col gap-2 z-20">
                <button 
                    onClick={() => setPanMode(!panMode)} 
                    className={`p-2.5 rounded-xl border backdrop-blur-md transition-all shadow-lg ${panMode ? "bg-sky-500/20 border-sky-400 text-sky-400 shadow-sky-500/20" : "bg-black/40 border-white/20 text-slate-300 hover:bg-white/10"}`} 
                    title={panMode ? "회전 모드로 전환" : "이동 모드로 전환"}
                >
                    {panMode ? <Move className="w-4 h-4 md:w-5 md:h-5" /> : <RotateCw className="w-4 h-4 md:w-5 md:h-5" />}
                </button>
                <button 
                    onClick={resetCamera} 
                    className="p-2.5 rounded-xl bg-black/40 border border-white/20 text-slate-300 backdrop-blur-md hover:bg-white/10 transition-all shadow-lg" 
                    title="카메라 위치 초기화"
                >
                    <RefreshCw className="w-4 h-4 md:w-5 md:h-5" />
                </button>
            </div>
            </div>

            {/* Overlay Info Panels */}
            <div className="relative md:absolute pt-1 px-3 pb-3 md:p-0 bg-[#0a0a0f] border-t border-white/10 md:bg-transparent md:border-none md:top-6 md:left-6 flex flex-col gap-2 md:gap-4 md:pointer-events-none shrink-0 z-10 w-full md:w-auto">
                <div className="glass-card p-3 md:p-5 md:!bg-black/40 md:backdrop-blur-xl md:border-white/20 min-w-full md:min-w-[240px]">
                    <div className="flex items-center gap-2 mb-2 md:mb-4 text-sky-400">
                        <Maximize className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <h3 className="text-[11px] md:text-xs font-black uppercase tracking-widest">{container.name}</h3>
                    </div>

                    <div className="flex items-center justify-between pb-2 md:pb-3 mb-2 md:mb-3 border-b border-white/10">
                        <div>
                            <p className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-0.5 md:mb-1">적재 효율성</p>
                            <span className="text-2xl md:text-3xl font-black text-sky-400 leading-none">{result.efficiency.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center gap-4 md:gap-6">
                            <div className="text-right">
                                <p className="text-[8px] md:text-[9px] text-slate-500 font-bold uppercase mb-0.5">적재 완료</p>
                                <p className="text-sm md:text-base font-bold text-white leading-none">{items.length} <span className="text-[8px] font-normal text-slate-400 italic">PKGS</span></p>
                            </div>
                            <div className="text-right">
                                <p className="text-[8px] md:text-[9px] text-slate-500 font-bold uppercase mb-0.5">미적재</p>
                                <p className={`text-sm md:text-base font-bold leading-none ${result.unpacked.length > 0 ? "text-red-400" : "text-emerald-400"}`}>
                                    {result.unpacked.reduce((s, u) => s + u.quantity, 0)} <span className="text-[8px] font-normal text-slate-400 italic">PKGS</span>
                                </p>
                            </div>
                        </div>
                    </div>

                        {/* Unpacked Detail List */}
                        {result.unpacked.length > 0 ? (
                            <div>
                                <p className="text-[8px] md:text-[9px] font-black uppercase text-red-400 mb-1.5 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-pulse"></span>
                                    미적재 목록
                                </p>
                                <div className="space-y-1 md:space-y-1.5 max-h-24 md:max-h-32 overflow-y-auto custom-scrollbar">
                                    {result.unpacked.map((u, i) => (
                                        <div key={i} className="flex justify-between items-center bg-red-500/10 rounded-md md:rounded-lg px-2 py-1 md:px-2.5 md:py-1.5 border border-red-500/20">
                                            <span className="text-[9px] md:text-[10px] text-red-300 font-bold truncate mr-2">{u.model_name}</span>
                                            <span className="text-[9px] md:text-[10px] font-black text-red-400 shrink-0">×{u.quantity}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="flex items-center justify-center gap-2 bg-emerald-500/10 rounded-lg md:rounded-xl px-2.5 py-1.5 md:px-3 md:py-2 border border-emerald-500/20">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                                    <p className="text-[10px] font-black text-emerald-400">전량 적재 완료</p>
                                </div>
                            </div>
                        )}
                </div>

                <div className="hidden md:flex glass p-3 px-4 items-center gap-4 text-[10px] font-bold text-slate-400">
                    <div className="flex items-center gap-1.5">
                        <Ruler className="w-3 h-3 text-sky-500" />
                        <span>DIM: {container.width}x{container.length}</span>
                    </div>
                    <div className="w-px h-3 bg-white/10" />
                    <div className="flex items-center gap-1.5 uppercase">
                        <span>Max Height: {container.height}mm</span>
                    </div>
                </div>
            </div>

            {/* Instruction Help */}
            <div className="hidden md:flex absolute bottom-3 right-3 md:bottom-6 md:right-6 glass p-2 px-3 text-[9px] md:text-[10px] text-slate-500 items-center gap-1.5 md:gap-2">
                <Info className="w-3 h-3 text-sky-500" />
                <span className="hidden sm:inline">마우스로 회전/확대하고 박스에 마우스를 올려 상세 정보를 확인하세요.</span>
                <span className="sm:hidden">회전/확대 지원 (상세정보: 박스 터치)</span>
            </div>
        </div>
    );
}


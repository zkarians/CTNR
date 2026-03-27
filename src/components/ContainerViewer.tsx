import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, PerspectiveCamera, Grid, Sparkles, Html } from '@react-three/drei';
import * as THREE from 'three';
import { PackingResult, PackedItem } from '@/lib/types';
import { Info, Maximize, Box, Ruler } from 'lucide-react';

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
        <div className="w-full h-full bg-[#030712] relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
            <Canvas shadows gl={{ antialias: true }}>
                <PerspectiveCamera makeDefault position={[cw * 1.5, ch * 2.5, cl * 2]} fov={45} />
                <OrbitControls makeDefault enableDamping dampingFactor={0.05} />

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

            {/* Overlay Info Panels */}
            <div className="absolute top-2 left-2 md:top-6 md:left-6 flex flex-col gap-2 md:gap-4 pointer-events-none transition-all duration-300">
                <div className="glass p-2 md:p-3 px-3 md:px-4 flex items-center gap-2 md:gap-4 text-[8px] md:text-[10px] font-bold text-slate-400">
                    <div className="flex items-center gap-1 md:gap-1.5 font-black text-sky-500/80">
                        <Ruler className="w-2.5 h-2.5 md:w-3 md:h-3" />
                        <span>{container.width}×{container.length}</span>
                    </div>
                    <div className="w-px h-2 md:h-3 bg-white/10" />
                    <div className="flex items-center gap-1 md:gap-1.5 uppercase">
                        <span>H: {container.height}mm</span>
                    </div>
                </div>
            </div>

            {/* Instruction Help */}
            <div className="absolute bottom-2 right-2 md:bottom-6 md:right-6 glass p-1.5 md:p-2 px-2 md:px-3 text-[8px] md:text-[10px] text-slate-500 flex items-center gap-1.5 md:gap-2 max-w-[150px] md:max-w-none">
                <Info className="w-2.5 h-2.5 md:w-3 md:h-3 text-sky-500 shrink-0" />
                <span className="truncate md:whitespace-normal">마우스로 회전/확대하고 박스를 클릭하세요.</span>
            </div>
        </div>
    );
}


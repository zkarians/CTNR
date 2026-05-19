import { ContainerDimensions, Product, PackedItem, PackingResult } from "./types";

/**
 * V4.19 - Stability Filter Exemption
 * - Exempt large appliances (h>1500mm) from stability rule.
 * - FALLBACK: Always allow at least one orientation if all others are blocked.
 * - Stability Orientation Filter (V4.14), Universal Headroom Fill (V4.15)
 * - Row-Based Topping (V4.12), Multi-Column Blocks (V4.7), 2/3 Support (V4.4)
 */

function isSmallProduct(p: Product): boolean {
    // V4.21: Increase threshold from 150 to 300 so flat items (e.g. h=267) act as toppers (Phase 2) instead of consuming floor space
    return Math.min(Number(p.width), Number(p.length), Number(p.height)) <= 300;
}

/**
 * V4.14: Check if placing a product with bottom face (orientedW × orientedL) is stable.
 * If the smallest face ≤ 1/4 of the largest face, and the bottom IS the smallest → REJECT.
 */
function isStableBottom(p: Product, orientedW: number, orientedL: number): boolean {
    const w = Number(p.width), l = Number(p.length), h = Number(p.height);
    const faceWL = w * l;  // top/bottom when upright
    const faceWH = w * h;  // side face
    const faceLH = l * h;  // front/back face
    const minFace = Math.min(faceWL, faceWH, faceLH);
    const maxFace = Math.max(faceWL, faceWH, faceLH);

    // V4.19: Exempt large appliances like tall refrigerators (h > 1500mm)
    if (h > 1500) return true;

    // Rule only triggers if the smallest face is dramatically smaller (V4.19: 1/5 ratio)
    if (minFace > maxFace / 5) return true; // No restriction

    // Check if the current bottom face (orientedW × orientedL) equals the smallest face
    const bottomArea = orientedW * orientedL;
    // Allow some tolerance (within 1%)
    if (Math.abs(bottomArea - minFace) < minFace * 0.01) return false; // Unstable!
    return true;
}

/**
 * V4.24: Evaluate the value of a generated wall block. 
 * Combines packed volume density (volume / depth) and width utilization.
 */
function evaluateWallScore(wallItems: any[], containerWidth: number): number {
    if (!wallItems || wallItems.length === 0) return 0;
    
    let vol = 0;
    let maxW = 0;
    let maxD = 0;
    for (const it of wallItems) {
        vol += (it.w * it.l * it.h);
        const lEdge = (it.yRel || 0) + it.l;
        if (lEdge > maxD) maxD = lEdge;
        const wEdge = it.x + it.w;
        if (wEdge > maxW) maxW = wEdge;
    }
    if (maxD <= 0) return 0;
    
    const widthRatio = containerWidth > 0 ? maxW / containerWidth : 0;
    // V4.30: Increase width utilization bonus to favor 3-column refrigerator walls (775mm wide)
    return (vol / maxD) * (1 + widthRatio * 2.5);
}

export function packContainer(
    containerInput: ContainerDimensions,
    productsInput: Product[],
    numPasses: number = 100,
    force: boolean = false
): PackingResult {
    const container = {
        id: containerInput.id, name: containerInput.name,
        width: Number(containerInput.width), length: Number(containerInput.length), height: Number(containerInput.height)
    };
    const aggMap = new Map<string, Product>();
    const invalidProducts: Product[] = []; // V5.03: Track 0-dimension products to return as unpacked

    for (const p of productsInput) {
        const qty = Number(p.quantity);
        if (qty <= 0) continue;

        // V5.03: Filter out products with 0 or negative dimensions
        if (Number(p.width) <= 0 || Number(p.length) <= 0 || Number(p.height) <= 0) {
            invalidProducts.push({ ...p, width: Number(p.width), length: Number(p.length), height: Number(p.height), quantity: qty });
            continue;
        }

        const ex = aggMap.get(p.id);
        if (ex) ex.quantity += qty;
        else aggMap.set(p.id, { ...p, width: Number(p.width), length: Number(p.length), height: Number(p.height), quantity: qty });
    }
    const products = Array.from(aggMap.values());
    if (container.width <= 0) return { container: { ...container, id: '40hc' }, items: [], efficiency: 0, unpacked: [...products, ...invalidProducts] };

    const totalQty = products.reduce((acc, p) => acc + p.quantity, 0);

    // Separate normal and small products
    const normalProducts = products.filter(p => !isSmallProduct(p));
    const smallProducts = products.filter(p => isSmallProduct(p));

    const sortedNormal = [...normalProducts].sort((a, b) => (b.width * b.height) - (a.width * a.height));
    const sortedSmall = [...smallProducts].sort((a, b) => (b.width * b.length * b.height) - (a.width * a.length * a.height));

    let bestRes: PackingResult | null = null;
    const passes = Math.max(numPasses, 30);

    for (let pIdx = 0; pIdx < passes; pIdx++) {
        const res = doTwoPhasePacking(container, sortedNormal, sortedSmall, products, pIdx);
        
        // V5.03: Append invalid 0-dimension products to the unpacked list so user sees them as failed
        if (invalidProducts.length > 0) {
            res.unpacked.push(...invalidProducts);
        }

        if (!bestRes || res.items.length > bestRes.items.length) {
            bestRes = res;
        }
        if (bestRes.items.length === totalQty) break;
    }
    return bestRes!;
}

function doTwoPhasePacking(container: any, normalProducts: Product[], smallProducts: Product[], allProducts: Product[], pIdx: number): PackingResult {
    const unpacked = new Map<string, number>();
    allProducts.forEach(p => unpacked.set(p.id, p.quantity));
    const placed: PackedItem[] = [];

    // ---- PHASE 1: Pack normal items only (no small items in base) ----
    const normalUnpacked = new Map<string, number>();
    normalProducts.forEach(p => normalUnpacked.set(p.id, p.quantity));

    const runNormal = pIdx > 0 ? [...normalProducts].sort(() => Math.random() - 0.5) : normalProducts;
    let currentY = 0;

    // Track walls for Phase 2 (small items on top)
    const walls: { y: number, depth: number, items: PackedItem[] }[] = [];

    while (currentY < container.length) {
        const rem = runNormal.filter(p => normalUnpacked.get(p.id)! > 0);
        if (rem.length === 0) break;

        const p1 = rem[0];
        // V4.23: Include rotated dimensions in depth candidates to allow better width-fill orientation
        const depthCandidates = p1.allow_rotate 
            ? [p1.length, p1.width, p1.height] 
            : [p1.length, p1.height];
        
        // V4.27 Depth Expansion: Include small product orientations to allow scavenging best rotations
        const smallRem = allProducts.filter(p => (unpacked.get(p.id) || 0) > 0 && isSmallProduct(p));
        for (const sp of smallRem) {
            depthCandidates.push(sp.length, sp.width);
        }

        const depths = Array.from(new Set(depthCandidates))
            .filter(d => d > 0 && d <= (container.length - currentY) + 0.5)
            .sort((a, b) => b - a);

        let bestWItems: any[] = [];
        let bestActualDepth = 0;
        let bestWallScore = -Infinity;

        for (const limitD of depths) {
            // V4.26: Pass global unpacked and allProducts so blockPackShelf can scavenge small items for side gaps
            const tempU = new Map(unpacked);
            const wallItems = blockPackShelf(container.width, container.height, limitD, allProducts, tempU, false);

            const score = evaluateWallScore(wallItems, container.width);
            if (score > bestWallScore) {
                bestWallScore = score;
                bestWItems = wallItems;
                bestActualDepth = wallItems.length > 0 ? Math.max(...wallItems.map((it: any) => (it.yRel || 0) + it.l)) : 0;
            }
        }

        if (bestWItems.length === 0) {
            currentY += 10;
            if (currentY > container.length) break;
            continue;
        }

        const wallPlaced: PackedItem[] = [];
        for (const wi of bestWItems) {
            const pi = { ...wi, y: currentY + (wi.yRel || 0), product: { ...wi.product, quantity: 1 } };
            placed.push(pi);
            wallPlaced.push(pi);
            unpacked.set(wi.product.id, unpacked.get(wi.product.id)! - 1);
            // Only deduct from Phase 1 target map if it was a normal product
            if (!isSmallProduct(wi.product)) {
                normalUnpacked.set(wi.product.id, normalUnpacked.get(wi.product.id)! - 1);
            }
        }
        walls.push({ y: currentY, depth: bestActualDepth, items: wallPlaced });
        currentY += bestActualDepth;
    }

    // ---- PHASE 2: Fill headroom of ALL walls with ANY remaining unpacked items ----
    // This catches items that didn't fit in Phase 1's block evaluation
    const allRemainingProducts = allProducts.filter(p => (unpacked.get(p.id) || 0) > 0 && !isSmallProduct(p));
    const runPhase2 = pIdx > 0 ? [...allRemainingProducts].sort(() => Math.random() - 0.5) : allRemainingProducts;

    for (const wall of walls) {
        let wallMaxZ = 0;
        let wallMaxW = 0;
        let wallBaseL = wall.depth;
        let isTopLay = false;
        for (const item of wall.items) {
            // V4.28: Ignore small products for base height. Side-gap towers must not block headroom detection.
            if (isSmallProduct(item.product)) continue;
            const topZ = item.z + item.h;
            if (topZ > wallMaxZ) {
                wallMaxZ = topZ;
                isTopLay = (item.orientation === 'lay');
            } else if (topZ === wallMaxZ && item.orientation === 'lay') {
                isTopLay = true;
            }
            const rightEdge = item.x + item.w;
            if (rightEdge > wallMaxW) wallMaxW = rightEdge;
        }

        let curZ = wallMaxZ;
        let filled = !isTopLay; // V5.02: Block filling if top item is laid down
        while (filled && curZ < container.height) {
            filled = false;
            let bestRowScore = -Infinity;
            let bestRowItems: any[] = [];
            let bestRowH = 0;

            for (const sp of runPhase2) {
                const avail = unpacked.get(sp.id) || 0;
                if (avail <= 0) continue;

                const orients = getOrients(sp);
                for (const to of orients) {
                    if (to.h > (container.height - curZ) + 0.5 || to.l > wallBaseL + 0.5) continue;

                    const baseMaxH = wall.items.reduce((max: number, it: any) => Math.max(max, isSmallProduct(it.product) ? 0 : it.h), 0);
                    if (baseMaxH < 500 && to.h >= 670) continue;

                    const suppW = Math.min(to.w, wallMaxW);
                    const suppL = Math.min(to.l, wallBaseL);
                    if (suppW * suppL < to.w * to.l * 0.66) continue;

                    const fitCount = Math.floor((wallMaxW + 0.5) / to.w);
                    if (fitCount === 0) continue;
                    const rowCount = Math.min(fitCount, avail);

                    const rowItems: any[] = [];
                    for (let ri = 0; ri < rowCount; ri++) {
                        rowItems.push({ product: sp, x: ri * to.w, y: wall.y, z: curZ, w: to.w, l: to.l, h: to.h, orientation: to.type });
                    }

                    // V4.17: Score by PHYSICAL CAPACITY (fitCount), not actual placed count
                    const potentialW = fitCount * to.w;
                    const potentialUtil = potentialW / wallMaxW;
                    const rowVol = rowCount * to.w * to.l * to.h;
                    const rowScore = fitCount * 1_000_000 + rowVol * potentialUtil;

                    if (rowScore > bestRowScore) {
                        bestRowScore = rowScore;
                        bestRowItems = rowItems;
                        bestRowH = to.h;
                    }
                }
            }

            if (bestRowItems.length > 0) {
                for (const ri of bestRowItems) {
                    placed.push({ ...ri, product: { ...ri.product, quantity: 1 } });
                    unpacked.set(ri.product.id, unpacked.get(ri.product.id)! - 1);
                }
                curZ += bestRowH;
                // V5.04: If the stacked item is laid down, stop filling on top of it.
                filled = bestRowItems[0].orientation !== 'lay';
            }
        }
    }

    // ---- PHASE 3: Remaining NORMAL products on the floor (no small) ----
    const remainingNormal = allProducts.filter(p => (unpacked.get(p.id) || 0) > 0 && !isSmallProduct(p))
        .map(p => ({ ...p, quantity: unpacked.get(p.id)! }));

    if (remainingNormal.length > 0) {
        const floorUnpacked = new Map<string, number>();
        remainingNormal.forEach(p => floorUnpacked.set(p.id, p.quantity));
        const runFloor = pIdx > 0 ? [...remainingNormal].sort(() => Math.random() - 0.5) : remainingNormal;

        while (currentY < container.length) {
            const rem = runFloor.filter(p => floorUnpacked.get(p.id)! > 0);
            if (rem.length === 0) break;

            const p1 = rem[0];
            const depthCandidates = p1.allow_rotate 
                ? [p1.length, p1.width, p1.height] 
                : [p1.length, p1.height];
            
            // V4.27 Depth Expansion (Phase 3)
            const smallRem = allProducts.filter(p => (unpacked.get(p.id) || 0) > 0 && isSmallProduct(p));
            for (const sp of smallRem) {
                depthCandidates.push(sp.length, sp.width);
            }

            const depths = Array.from(new Set(depthCandidates)).filter(d => d > 0 && d <= (container.length - currentY) + 0.5).sort((a, b) => b - a);

            let bestWItems: any[] = [];
            let bestActualDepth = 0;
            let bestWallScore = -Infinity;

            for (const limitD of depths) {
                // V4.26 Scavenge side gaps in Phase 3 as well
                const tempU = new Map(unpacked);
                const wallItems = blockPackShelf(container.width, container.height, limitD, allProducts, tempU, false);

                const score = evaluateWallScore(wallItems, container.width);
                if (score > bestWallScore) {
                    bestWallScore = score;
                    bestWItems = wallItems;
                    bestActualDepth = wallItems.length > 0 ? Math.max(...wallItems.map((it: any) => (it.yRel || 0) + it.l)) : 0;
                }
            }

            if (bestWItems.length === 0) {
                currentY += 10;
                if (currentY > container.length) break;
                continue;
            }

            const phase3Wall: PackedItem[] = [];
            for (const wi of bestWItems) {
                const pi = { ...wi, y: currentY + (wi.yRel || 0), product: { ...wi.product, quantity: 1 } };
                placed.push(pi);
                phase3Wall.push(pi);
                unpacked.set(wi.product.id, unpacked.get(wi.product.id)! - 1);
                if (!isSmallProduct(wi.product)) {
                    floorUnpacked.set(wi.product.id, floorUnpacked.get(wi.product.id)! - 1);
                }
            }
            walls.push({ y: currentY, depth: bestActualDepth, items: phase3Wall });
            currentY += bestActualDepth;
        }
    }

    // ---- PRE-PHASE 4: Merge continuous flat tops into Macro Walls ----
    // V4.25: Instead of isolated walls, merge walls that are contiguous and share identical top profile geometry.
    interface MacroWall {
        y: number;
        depth: number;
        maxZ: number;
        maxW: number;
        isTopLay?: boolean;
    }
    const macroWalls: MacroWall[] = [];
    
    for (const wall of walls) {
        let wallMaxZ = 0;
        let wallMaxW = 0;
        let isTopLay = false;
        for (const item of wall.items) {
            if (isSmallProduct(item.product)) continue;
            const topZ = item.z + item.h;
            if (topZ > wallMaxZ) {
                wallMaxZ = topZ;
                isTopLay = (item.orientation === 'lay');
            } else if (topZ === wallMaxZ && item.orientation === 'lay') {
                isTopLay = true;
            }
            const rightEdge = item.x + item.w;
            if (rightEdge > wallMaxW) wallMaxW = rightEdge;
        }
        for (const pi of placed) {
            if (pi.y >= wall.y && pi.y < wall.y + wall.depth) {
                if (isSmallProduct(pi.product)) continue;
                const topZ = pi.z + pi.h;
                if (topZ > wallMaxZ) {
                    wallMaxZ = topZ;
                    isTopLay = (pi.orientation === 'lay');
                } else if (topZ === wallMaxZ && pi.orientation === 'lay') {
                    isTopLay = true;
                }
            }
        }
        
        if (macroWalls.length > 0) {
            const last = macroWalls[macroWalls.length - 1];
            // If they sequentially touch and have identical Z/W capacity boundaries, merge them.
            if (Math.abs((last.y + last.depth) - wall.y) < 1 && Math.abs(last.maxZ - wallMaxZ) < 1 && Math.abs(last.maxW - wallMaxW) < 1 && last.isTopLay === isTopLay) {
                last.depth += wall.depth;
                continue;
            }
        }
        macroWalls.push({ y: wall.y, depth: wall.depth, maxZ: wallMaxZ, maxW: wallMaxW, isTopLay });
    }
    // ---- PHASE 4: Stack remaining SMALL products on top of ALL macro walls ----
    const remainingSmall = allProducts.filter(p => (unpacked.get(p.id) || 0) > 0 && isSmallProduct(p));
    const runPhase4 = pIdx > 0 ? [...remainingSmall].sort(() => Math.random() - 0.5) : remainingSmall;

    for (const wall of macroWalls) {
        let wallMaxZ = wall.maxZ;
        let wallMaxW = wall.maxW;
        let wallBaseL = wall.depth;

        let curZ = wallMaxZ;
        let filled = !wall.isTopLay; // V5.02: Block filling if top item is laid down
        while (filled && curZ < container.height) {
            filled = false;
            let bestRowScore = -Infinity;
            let bestRowItems: any[] = [];
            let bestRowH = 0;

            for (const sp of runPhase4) {
                const avail = unpacked.get(sp.id) || 0;
                if (avail <= 0) continue;
                const orients = getOrients(sp);
                for (const to of orients) {
                    if (to.h > (container.height - curZ) + 0.5 || to.l > wallBaseL + 0.5) continue;
                    const suppW = Math.min(to.w, wallMaxW);
                    const suppL = Math.min(to.l, wallBaseL);
                    if (suppW * suppL < to.w * to.l * 0.66) continue;
                    
                    // V4.25: Fill in 2D space (Width x Depth) instead of a single 1D strip.
                    const fitCountW = Math.floor((wallMaxW + 0.5) / to.w);
                    const fitCountL = Math.floor((wallBaseL + 0.5) / to.l);
                    if (fitCountW === 0 || fitCountL === 0) continue;
                    
                    const countLimit = Math.min(fitCountW * fitCountL, avail);
                    const rowItems: any[] = [];
                    let placedCount = 0;
                    
                    for (let l_idx = 0; l_idx < fitCountL; l_idx++) {
                        for (let w_idx = 0; w_idx < fitCountW; w_idx++) {
                            if (placedCount >= countLimit) break;
                            rowItems.push({ 
                                product: sp, 
                                x: w_idx * to.w, 
                                y: wall.y + (l_idx * to.l), 
                                z: curZ, 
                                w: to.w, l: to.l, h: to.h, 
                                orientation: to.type 
                            });
                            placedCount++;
                        }
                    }
                    
                    // Strongly prioritize volume to ensure we pick rotations/products that fill the most raw capacity
                    const rowVol = placedCount * to.w * to.l * to.h;
                    const rowScore = placedCount * 1_000_000 + rowVol;
                    
                    if (rowScore > bestRowScore) {
                        bestRowScore = rowScore;
                        bestRowItems = rowItems;
                        bestRowH = to.h;
                    }
                }
            }
            if (bestRowItems.length > 0) {
                for (const ri of bestRowItems) {
                    placed.push({ ...ri, product: { ...ri.product, quantity: 1 } });
                    unpacked.set(ri.product.id, unpacked.get(ri.product.id)! - 1);
                }
                curZ += bestRowH;
                // V5.04: If the stacked item is laid down, stop filling on top of it.
                filled = bestRowItems[0].orientation !== 'lay';
            }
        }
    }

    // ---- PHASE 5: ONLY if all normal products packed, allow small on floor ----
    const normalStillUnpacked = allProducts.filter(p => !isSmallProduct(p) && (unpacked.get(p.id) || 0) > 0);
    const smallStillUnpacked = allProducts.filter(p => isSmallProduct(p) && (unpacked.get(p.id) || 0) > 0)
        .map(p => ({ ...p, quantity: unpacked.get(p.id)! }));

    if (normalStillUnpacked.length === 0 && smallStillUnpacked.length > 0) {
        const floorUnpacked = new Map<string, number>();
        smallStillUnpacked.forEach(p => floorUnpacked.set(p.id, p.quantity));
        const runSmallFloor = pIdx > 0 ? [...smallStillUnpacked].sort(() => Math.random() - 0.5) : smallStillUnpacked;

        while (currentY < container.length) {
            const rem = runSmallFloor.filter(p => floorUnpacked.get(p.id)! > 0);
            if (rem.length === 0) break;

            const p1 = rem[0];
            const depthCandidates = p1.allow_rotate 
                ? [p1.length, p1.width, p1.height] 
                : [p1.length, p1.height];
            const depths = Array.from(new Set(depthCandidates)).filter(d => d > 0 && d <= (container.length - currentY) + 0.5).sort((a, b) => b - a);

            let bestWItems: any[] = [];
            let bestActualDepth = 0;
            let bestWallScore = -Infinity;

            for (const limitD of depths) {
                const tempU = new Map(floorUnpacked);
                const wallItems = blockPackShelf(container.width, container.height, limitD, runSmallFloor, tempU, true);
                
                const score = evaluateWallScore(wallItems, container.width);
                if (score > bestWallScore) {
                    bestWallScore = score;
                    bestWItems = wallItems;
                    bestActualDepth = wallItems.length > 0 ? Math.max(...wallItems.map((it: any) => (it.yRel || 0) + it.l)) : 0;
                }
            }

            if (bestWItems.length === 0) {
                currentY += 10;
                if (currentY > container.length) break;
                continue;
            }

            for (const wi of bestWItems) {
                placed.push({ ...wi, y: currentY + (wi.yRel || 0), product: { ...wi.product, quantity: 1 } });
                floorUnpacked.set(wi.product.id, floorUnpacked.get(wi.product.id)! - 1);
                unpacked.set(wi.product.id, unpacked.get(wi.product.id)! - 1);
            }
            currentY += bestActualDepth;
        }
    }

    // ---- GRAVITY DROP: Fix floating items ----
    // Iteratively drop each item to rest on the highest support below it.
    let gravityChanged = true;
    let gravityIter = 0;
    while (gravityChanged && gravityIter < 20) {
        gravityChanged = false;
        gravityIter++;
        // Sort by Z ascending each iteration so lower items settle first
        placed.sort((a, b) => a.z - b.z);
        for (let i = 0; i < placed.length; i++) {
            const item = placed[i];
            if (item.z === 0) continue; // already on floor

            // Find the highest surface directly below this item
            let supportZ = 0; // floor
            for (let j = 0; j < placed.length; j++) {
                if (j === i) continue;
                const other = placed[j];
                // Must be below our item (its top <= our current bottom)
                const otherTop = other.z + other.h;
                if (otherTop > item.z + 1) continue; // not below us

                // Check X-axis overlap
                const xOverlap = other.x < item.x + item.w && other.x + other.w > item.x;
                // Check Y-axis overlap
                const yOverlap = other.y < item.y + item.l && other.y + other.l > item.y;
                if (xOverlap && yOverlap) {
                    if (otherTop > supportZ) {
                        supportZ = otherTop;
                    }
                }
            }
            if (Math.abs(item.z - supportZ) > 1) {
                item.z = supportZ;
                gravityChanged = true;
            }
        }
    }

    const unpackedList = allProducts.map(p => ({ ...p, quantity: unpacked.get(p.id)! })).filter(p => p.quantity > 0);
    const vol = placed.reduce((s, i) => s + (i.w * i.l * i.h), 0);
    return { container: { ...container, id: '40hc' }, items: placed, efficiency: (vol / (container.width * container.length * container.height)) * 100, unpacked: unpackedList };
}

function getOrients(p: Product): any[] {
    // V5.01: Safety Shutoff. Prevent infinite loops caused by zero-dimension items (curZ += 0 loops).
    if (p.width < 1 || p.length < 1 || p.height < 1) return [];

    const all: any[] = [];
    all.push({ w: p.width, l: p.length, h: p.height, type: 'std' });
    if (p.allow_rotate) {
        all.push({ w: p.length, l: p.width, h: p.height, type: 'rot' });
    }
    if (p.allow_lay_down) {
        all.push({ w: p.height, l: p.length, h: p.width, type: 'lay' });
        all.push({ w: p.width, l: p.height, h: p.length, type: 'lay' });
        all.push({ w: p.height, l: p.width, h: p.length, type: 'lay' });
        all.push({ w: p.length, l: p.height, h: p.width, type: 'lay' });
    }
    // V4.14: Filter out unstable bottom faces
    const filtered = all.filter(o => isStableBottom(p, o.w, o.l));

    // V4.19: Fallback - if everything was filtered out, allow the standard orientation
    if (filtered.length === 0 && all.length > 0) {
        return [all[0]];
    }
    return filtered;
}

function blockPackShelf(W: number, H: number, D: number, allProducts: Product[], unpacked: Map<string, number>, allowSmall: boolean): any[] {
    const wallItems: any[] = [];
    let currentX = 0;

    while (currentX < W) {
        const rem = allProducts.filter(p => unpacked.get(p.id)! > 0);
        if (rem.length === 0) break;

        let bestBlockScore = -Infinity;
        let bestBlockW = 0;
        let bestBlockItems: any[] = [];

        // V4.26 Side Gap Scavenging
        // Pass 0: Try to fit normal products.
        // Pass 1: Also try scavenging to see if small items provide a better local fit.
        for (const passIdx of [0, 1]) {
            // Phase 4/5 (allowSmall=true) already considers everyone, so Pass 1 is redundant.
            if (passIdx === 1 && allowSmall) break;

            for (const p of rem) {
                const isSmall = isSmallProduct(p);
                if (passIdx === 0 && !allowSmall && isSmall) continue;
                if (passIdx === 1 && !isSmall) continue;

                const orientsList = [];
                orientsList.push({ w: p.width, l: p.length, h: p.height, type: 'std' });
                if (p.allow_rotate) {
                    orientsList.push({ w: p.length, l: p.width, h: p.height, type: 'rot' });
                }
                if (p.allow_lay_down) {
                    orientsList.push({ w: p.height, l: p.length, h: p.width, type: 'lay' });
                    orientsList.push({ w: p.width, l: p.height, h: p.length, type: 'lay' });
                    orientsList.push({ w: p.height, l: p.width, h: p.length, type: 'lay' });
                    orientsList.push({ w: p.length, l: p.height, h: p.width, type: 'lay' });
                }

                const orients = orientsList.filter(o => o.w <= (W - currentX) + 0.5 && o.l <= D + 0.5 && o.h <= H + 0.5 && isStableBottom(p, o.w, o.l));

                for (const o of orients) {
                    for (let bW = 1; bW <= Math.min(5, unpacked.get(p.id)!); bW++) {
                        for (let bL = 1; bL <= 5; bL++) {
                            const totalW = o.w * bW;
                            const totalL = o.l * bL;
                            if (totalW > (W - currentX) + 0.5) break;
                            if (totalL > D + 0.5) break;

                            // V5.05: If orientation is 'lay', limit height count to 1 to prevent stacking laid down items
                            const maxHCount = o.type === 'lay' ? 1 : Math.floor((H + 0.5) / o.h);
                            const limitHCount = Math.min(maxHCount, Math.floor(unpacked.get(p.id)! / (bW * bL)));
                            if (limitHCount === 0) continue;

                            for (let hCount = 1; hCount <= limitHCount; hCount++) {
                                let tempItems: any[] = [];
                                for (let bwIdx = 0; bwIdx < bW; bwIdx++) {
                                    for (let blIdx = 0; blIdx < bL; blIdx++) {
                                        for (let phIdx = 0; phIdx < hCount; phIdx++) {
                                            tempItems.push({ product: p, x: currentX + (bwIdx * o.w), yRel: blIdx * o.l, z: phIdx * o.h, w: o.w, l: o.l, h: o.h, orientation: o.type });
                                        }
                                    }
                                }

                                let curZ = hCount * o.h;
                                let tempU_Col = new Map(unpacked);
                                tempU_Col.set(p.id, tempU_Col.get(p.id)! - (hCount * bW * bL));

                            const effectiveAllowSmall = allowSmall || (passIdx === 1);

                            // ROW-BASED TOPPING (V4.12)
                            // V5.02: No stacking on top of laid down (lay) items
                            let zPossible = o.type !== 'lay';
                            while (curZ < H && zPossible) {
                                zPossible = false;
                                let bestRowScore = -Infinity;
                                let bestRowItems: any[] = [];
                                let bestRowH = 0;

                                for (const topP of allProducts) {
                                    if (!effectiveAllowSmall && isSmallProduct(topP)) continue;
                                    const avail = tempU_Col.get(topP.id) || 0;
                                    if (avail <= 0) continue;

                                    const actualOrients = getOrients(topP);

                                    for (const to of actualOrients) {
                                        if (to.w < 1 || to.l > totalL + 0.5 || to.h > (H - curZ) + 0.5) continue;

                                        // V4.16: Base h<500 cannot support topper h≥670
                                        if (o.h < 500 && to.h >= 670) continue;

                                        const suppW = Math.min(to.w, totalW);
                                        const suppL = Math.min(to.l, totalL);
                                        if (suppW * suppL < (to.w * to.l * 0.66)) continue;

                                        // V5.00 Identical Product Row Sharing & Identity Sorting
                                        const identicalProducts = [{ p: topP, qty: avail }];
                                        let combinedAvail = avail;

                                        for (const otherP of allProducts) {
                                            if (otherP.id === topP.id) continue;
                                            const otherAvail = tempU_Col.get(otherP.id) || 0;
                                            if (otherAvail <= 0) continue;
                                            
                                            // Check if otherP can match the exact dimensions of 'to'
                                            const oo = getOrients(otherP).find(x => Math.abs(x.w - to.w) < 0.5 && Math.abs(x.l - to.l) < 0.5 && Math.abs(x.h - to.h) < 0.5);
                                            if (oo) {
                                                identicalProducts.push({ p: otherP, qty: otherAvail });
                                                combinedAvail += otherAvail;
                                            }
                                        }

                                        // IDEA 2: Sort to prioritize identical models (topP.id === p.id or otherP.id === p.id)
                                        identicalProducts.sort((a, b) => {
                                            const aIsBase = a.p.id === p.id;
                                            const bIsBase = b.p.id === p.id;
                                            if (aIsBase && !bIsBase) return -1;
                                            if (!aIsBase && bIsBase) return 1;
                                            return 0;
                                        });

                                        const fitCountW = Math.floor((totalW + 0.5) / to.w);
                                        const fitCountL = Math.floor((totalL + 0.5) / to.l);
                                        const fitCount = fitCountW * fitCountL;
                                        if (fitCount === 0) continue;
                                        const rowCount = Math.min(fitCount, combinedAvail);

                                        const rowItems: any[] = [];
                                        let placedCount = 0;
                                        let currentIdx = 0;
                                        let qtyUsed = 0;
                                        for (let riL = 0; riL < fitCountL && placedCount < rowCount; riL++) {
                                            for (let riW = 0; riW < fitCountW && placedCount < rowCount; riW++) {
                                                const currentItem = identicalProducts[currentIdx];
                                                rowItems.push({ product: currentItem.p, x: currentX + (riW * to.w), yRel: riL * to.l, z: curZ, w: to.w, l: to.l, h: to.h, orientation: to.type });
                                                placedCount++;
                                                qtyUsed++;
                                                if (qtyUsed >= currentItem.qty) {
                                                    currentIdx++;
                                                    qtyUsed = 0;
                                                }
                                            }
                                        }

                                        // V4.17: Score by PHYSICAL CAPACITY (fitCount), not actual placed count
                                        const potentialW = fitCountW * to.w;
                                        const potentialL = fitCountL * to.l;
                                        const potentialUtil = (potentialW * potentialL) / (totalW * totalL);
                                        const rowVol = rowCount * to.w * to.l * to.h;
                                        const rowScore = fitCount * 1_000_000 + rowVol * potentialUtil;

                                        if (rowScore > bestRowScore) {
                                            bestRowScore = rowScore;
                                            bestRowItems = rowItems;
                                            bestRowH = to.h;
                                        }
                                    }
                                }

                                if (bestRowItems.length > 0) {
                                    tempItems.push(...bestRowItems);
                                    for (const ri of bestRowItems) {
                                        tempU_Col.set(ri.product.id, tempU_Col.get(ri.product.id)! - 1);
                                    }
                                    curZ += bestRowH;
                                    // V5.04: If the stacked item is laid down, stop filling on top of it.
                                    zPossible = bestRowItems[0].orientation !== 'lay';
                                }
                            }

                            const vol = tempItems.reduce((s: number, it: any) => s + (it.w * it.l * it.h), 0);

                            // V4.18: Look-ahead - estimate how many more items fit in remaining width
                            const remainW = W - currentX - totalW;
                            let lookAheadVol = 0;
                            if (remainW > 50) {
                                for (const rp of rem) {
                                    const rpAvail = tempU_Col.get(rp.id) || 0;
                                    if (rpAvail <= 0) continue;
                                    const rpOrients = getOrients(rp).filter(ro => ro.w <= remainW + 0.5 && ro.l <= D + 0.5 && ro.h <= H + 0.5);
                                    for (const ro of rpOrients) {
                                        const bwFit = Math.floor((remainW + 0.5) / ro.w);
                                        const hcFit = Math.floor((H + 0.5) / ro.h);
                                        const lFit = Math.floor((totalL + 0.5) / ro.l);
                                        const countFit = Math.min(bwFit * hcFit * lFit, rpAvail);
                                        const fitVol = countFit * ro.w * ro.l * ro.h;
                                        if (fitVol > lookAheadVol) lookAheadVol = fitVol;
                                    }
                                }
                            }
                            const widthFillBonus = remainW < 50 ? (totalW / W) * 100000 : 0;
                            const volBonus = vol * 0.0000001;
                            const widthFillRatio = totalW / W;
                            
                            // V5.02: Penalize 'lay' orientations that leave too much headroom to force them to the top
                            let layPenalty = 1.0;
                            if (o.type === 'lay') {
                                const wastedH = H - curZ;
                                // If wasted height is more than 20% of container, penalize heavily
                                if (wastedH > H * 0.2) layPenalty = 0.001; 
                                else layPenalty = 0.8; // Small penalty even if near top
                            }

                            // V4.30: Increase widthFillRatio weight to 1.5 to favor high-width-utilization blocks
                            const score = (((vol + lookAheadVol + widthFillBonus) / totalL + totalL + volBonus) * (1 + widthFillRatio * 1.5)) * layPenalty;

                            if (score > bestBlockScore) {
                                    bestBlockScore = score;
                                    bestBlockItems = tempItems;
                                    bestBlockW = totalW;
                                }
                            }
                        }
                    }
                }
            }
        }

        if (bestBlockItems.length === 0) break;
        wallItems.push(...bestBlockItems);
        for (const bi of bestBlockItems) {
            unpacked.set(bi.product.id, unpacked.get(bi.product.id)! - 1);
        }
        currentX += bestBlockW;
    }
    return wallItems;
}

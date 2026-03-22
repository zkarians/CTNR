import { ContainerDimensions, Product, PackedItem, PackingResult } from "./types";

/**
 * COMPACT PACKER
 * 
 * Key changes to eliminate inter-product gaps:
 * 1. Items sorted by: volume DESC, then grouped by product.id (same product stays together)
 * 2. Scoring: prefer LOWEST Z (floor first), then LOWEST Y (front first), then LOWEST X
 *    - This prevents tall items from jumping to large Y just because z=0 is blocked
 * 3. Stability rule: tall (h>=500mm) cannot sit on thin (h<300mm) items
 * 4. Zero floating: Z is always derived from exact rectangle overlap check
 */
export function packContainer(
    container: ContainerDimensions,
    products: Product[],
    numPasses: number = 4
): PackingResult {
    if (!container || container.width <= 0 || container.length <= 0 || container.height <= 0) {
        return { container, items: [], efficiency: 0, unpacked: [...products] };
    }

    const strategies: Array<(a: Product, b: Product) => number> = [
        (a, b) => (b.width * b.length * b.height) - (a.width * a.length * a.height),
        (a, b) => (b.width * b.length) - (a.width * a.length),
        (a, b) => b.height - a.height,
        (a, b) => (b.width + b.length + b.height) - (a.width + a.length + a.height),
    ];

    const passes = Math.max(1, Math.min(numPasses, 20));
    let bestResult: PackingResult | null = null;

    for (let p = 0; p < passes; p++) {
        const result = doPackRun(container, products, strategies[p % strategies.length]);
        if (!bestResult || result.efficiency > bestResult.efficiency) {
            bestResult = result;
        }
    }
    return bestResult!;
}

interface PlacedRect {
    x: number; y: number; x2: number; y2: number; topZ: number;
    itemH: number;
}

function getGroundZ(px: number, py: number, pw: number, pl: number, placed: PlacedRect[]): number {
    const px2 = px + pw, py2 = py + pl;
    let maxZ = 0;
    for (const r of placed) {
        if (r.x < px2 && r.x2 > px && r.y < py2 && r.y2 > py) {
            if (r.topZ > maxZ) maxZ = r.topZ;
        }
    }
    return maxZ;
}

function isStable(
    px: number, py: number, pw: number, pl: number,
    groundZ: number, newItemH: number,
    placed: PlacedRect[]
): boolean {
    if (newItemH < 500) return true;
    if (groundZ === 0) return true;
    const px2 = px + pw, py2 = py + pl;
    for (const r of placed) {
        if (r.topZ === groundZ && r.x < px2 && r.x2 > px && r.y < py2 && r.y2 > py) {
            if (r.itemH < 300) return false;
        }
    }
    return true;
}

function doPackRun(
    container: ContainerDimensions,
    products: Product[],
    sortFn: (a: Product, b: Product) => number
): PackingResult {
    const placed: PlacedRect[] = [];
    const placedItems: PackedItem[] = [];
    const unpackedMap = new Map<string, number>();
    products.forEach(p => unpackedMap.set(p.id, p.quantity));

    const validProducts = products.filter(p => p.width > 0 && p.length > 0 && p.height > 0 && p.quantity > 0);

    // Sort: primary = user strategy (volume desc etc), secondary = group same product together
    const queue = validProducts.flatMap(p =>
        Array.from({ length: p.quantity }, () => ({ ...p }))
    ).sort((a, b) => {
        const primary = sortFn(a, b);
        if (primary !== 0) return primary;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    for (const product of queue) {
        const candidates: Array<{ w: number; l: number; h: number; type: PackedItem['orientation'] }> = [];
        const add = (w: number, l: number, h: number, type: PackedItem['orientation']) => {
            if (w > 0 && l > 0 && h > 0 && w <= container.width && l <= container.length && h <= container.height) {
                candidates.push({ w, l, h, type });
            }
        };
        add(product.width, product.length, product.height, 'std');
        if (product.allow_rotate) add(product.length, product.width, product.height, 'rotated');
        if (product.allow_lay_down) {
            add(product.width, product.height, product.length, 'lay_side');
            add(product.height, product.length, product.width, 'lay_front');
        }
        if (candidates.length === 0) continue;

        // Sort orientations: most units across container width first
        candidates.sort((a, b) => Math.floor(container.width / b.w) - Math.floor(container.width / a.w));

        let bestScore = Infinity;
        let bestX = 0, bestY = 0, bestZ = 0;
        let bestCand: { w: number; l: number; h: number; type: PackedItem['orientation'] } | null = null;

        for (const cand of candidates) {
            // Collect extreme point candidates
            const xSet = new Set<number>([0]);
            const ySet = new Set<number>([0]);
            for (const r of placed) {
                if (r.x2 + cand.w <= container.width) xSet.add(r.x2);
                if (r.y2 + cand.l <= container.length) ySet.add(r.y2);
            }
            // Also add width-aligned positions (for optimal row fill)
            for (let x = cand.w; x + cand.w <= container.width; x += cand.w) xSet.add(x);

            const sortedY = Array.from(ySet).sort((a, b) => a - b);
            const sortedX = Array.from(xSet).sort((a, b) => a - b);

            for (const y of sortedY) {
                if (y + cand.l > container.length) continue;
                for (const x of sortedX) {
                    if (x + cand.w > container.width) continue;
                    const gZ = getGroundZ(x, y, cand.w, cand.l, placed);
                    if (gZ + cand.h > container.height) continue;
                    if (!isStable(x, y, cand.w, cand.l, gZ, cand.h, placed)) continue;

                    // Score: LOWEST Z first → items prefer floor level over stacking
                    // Then LOWEST Y → fill from front of container
                    // Then LOWEST X → fill left to right
                    const score = gZ * 1e10 + y * 1e5 + x;
                    if (score < bestScore) {
                        bestScore = score;
                        bestX = x; bestY = y; bestZ = gZ;
                        bestCand = cand;
                    }
                }
            }
            if (bestCand && bestZ === 0 && bestY === 0) break;
        }

        if (bestCand !== null) {
            const bc = bestCand as { w: number; l: number; h: number; type: PackedItem['orientation'] };
            placedItems.push({
                product: { ...product, quantity: 1 },
                x: bestX, y: bestY, z: bestZ,
                w: bc.w, l: bc.l, h: bc.h,
                orientation: bc.type
            });
            placed.push({
                x: bestX, y: bestY,
                x2: bestX + bc.w,
                y2: bestY + bc.l,
                topZ: bestZ + bc.h,
                itemH: bc.h
            });
            const cur = unpackedMap.get(product.id) ?? 0;
            if (cur > 0) unpackedMap.set(product.id, cur - 1);
        }
    }

    const unpacked: Product[] = [];
    unpackedMap.forEach((remaining, id) => {
        if (remaining > 0) {
            const p = products.find(q => q.id === id);
            if (p) unpacked.push({ ...p, quantity: remaining });
        }
    });

    const packedVolume = placedItems.reduce((s, i) => s + i.w * i.l * i.h, 0);
    return {
        container,
        items: placedItems,
        efficiency: (packedVolume / (container.width * container.length * container.height)) * 100,
        unpacked
    };
}

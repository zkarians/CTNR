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
        const result = doPackRun(container, products, strategies[p % strategies.length], p);

        const getOccupiedFloorArea = (res: PackingResult) =>
            res.items.filter(i => i.z === 0).reduce((sum, i) => sum + (i.w * i.l), 0);

        if (!bestResult) {
            bestResult = result;
        } else {
            // Priority 1: Total items packed (Efficiency) - Most items wins
            if (result.items.length > bestResult.items.length) {
                bestResult = result;
            } else if (result.items.length === bestResult.items.length) {
                // Priority 2: Floor efficiency - Less floor area occupied is better
                // (Saves more floor space for the remaining unpacking products)
                const currentFloor = getOccupiedFloorArea(result);
                const bestFloor = getOccupiedFloorArea(bestResult);

                if (currentFloor < bestFloor) {
                    bestResult = result;
                }
            }
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
    if (groundZ === 0) return true;
    const px2 = px + pw, py2 = py + pl;

    // Check support area
    let supportedArea = 0;
    const totalArea = pw * pl;

    for (const r of placed) {
        if (Math.abs(r.topZ - groundZ) < 1) { // touching at this level
            // Calculate intersection area
            const ix = Math.max(px, r.x);
            const iy = Math.max(py, r.y);
            const ix2 = Math.min(px2, r.x2);
            const iy2 = Math.min(py2, r.y2);

            if (ix2 > ix && iy2 > iy) {
                // If the item below is too thin for a heavy object, reject
                if (newItemH >= 500 && r.itemH < 300) return false;
                supportedArea += (ix2 - ix) * (iy2 - iy);
            }
        }
    }

    // Require at least 50% support area to prevent floating or precarious tipping
    return (supportedArea / totalArea) >= 0.5;
}

function doPackRun(
    container: ContainerDimensions,
    products: Product[],
    sortFn: (a: Product, b: Product) => number,
    passIdx: number
): PackingResult {
    const placed: PlacedRect[] = [];
    const placedItems: PackedItem[] = [];
    const unpackedMap = new Map<string, number>();
    products.forEach(p => unpackedMap.set(p.id, p.quantity));

    const validProducts = products.filter(p => p.width > 0 && p.length > 0 && p.height > 0 && p.quantity > 0);
    let remainingTotal = validProducts.reduce((sum, p) => sum + p.quantity, 0);

    let loopCount = 0;
    while (remainingTotal > 0 && loopCount < 10000) {
        loopCount++;
        let globalBestScore = Infinity;
        let globalBestPlace: { product: Product, cand: any, x: number, y: number, z: number } | null = null;

        const uniqueRemaining = validProducts.filter(p => (unpackedMap.get(p.id) || 0) > 0);
        if (uniqueRemaining.length === 0) break;

        // Priority: tall items (h>=300) must be placed before flat items (h<300)
        // This prevents flat items from occupying floor spots that tall items need
        const hasTallRemaining = uniqueRemaining.some(p => p.height >= 300);
        const productBuckets = (hasTallRemaining)
            ? [uniqueRemaining.filter(p => p.height >= 300), uniqueRemaining.filter(p => p.height < 300)]
            : [uniqueRemaining];

        for (const bucket of productBuckets) {
            for (const product of bucket) {
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
                    add(product.height, product.width, product.length, 'lay_front');
                }
                if (candidates.length === 0) continue;

                candidates.sort((a, b) => {
                    const cmp = Math.floor(container.width / b.w) - Math.floor(container.width / a.w);
                    return cmp !== 0 ? cmp : a.l - b.l;
                });

                for (const cand of candidates) {
                    const xSet = new Set<number>([0]);
                    const ySet = new Set<number>([0]);
                    for (const r of placed) {
                        if (r.x2 + cand.w <= container.width) xSet.add(r.x2);
                        if (r.y2 + cand.l <= container.length) ySet.add(r.y2);
                    }
                    for (let x = cand.w; x + cand.w <= container.width; x += cand.w) xSet.add(x);
                    for (let y = cand.l; y + cand.l <= container.length; y += cand.l) ySet.add(y);

                    const sortedY = Array.from(ySet).sort((a, b) => a - b);
                    const sortedX = Array.from(xSet).sort((a, b) => a - b);

                    for (const y of sortedY) {
                        if (y + cand.l > container.length) continue;
                        for (const x of sortedX) {
                            if (x + cand.w > container.width) continue;
                            const gZ = getGroundZ(x, y, cand.w, cand.l, placed);
                            if (gZ + cand.h > container.height) continue;
                            if (!isStable(x, y, cand.w, cand.l, gZ, cand.h, placed)) continue;

                            let stackBonus = 0;
                            if (gZ > 0) {
                                const itemBelow = placedItems.find(it =>
                                    Math.abs((it.z + it.h) - gZ) < 1 &&
                                    Math.abs(it.x - x) < 5 &&
                                    Math.abs(it.y - y) < 5 &&
                                    Math.abs(it.w - cand.w) < 5 &&
                                    Math.abs(it.l - cand.l) < 5
                                );
                                if (itemBelow) {
                                    if (itemBelow.product.id === product.id) {
                                        stackBonus = 1e15;
                                    } else if (Math.abs(itemBelow.h - cand.h) < 10) {
                                        stackBonus = 0.8e15;
                                    }
                                }
                            }

                            if (gZ > 0 && cand.h < product.height && cand.h <= 300) {
                                stackBonus += 0.5e15;
                            }

                            let tightFitBonus = 0;
                            if (product.height <= 300) {
                                const remainingWidth = container.width - (x + cand.w);
                                if (remainingWidth >= 0 && remainingWidth < 200) {
                                    tightFitBonus = 0.5e10;
                                }
                            }

                            const remW = container.width - (x + cand.w);
                            let deadSpacePenalty = 0;
                            if (remW > 0 && gZ === 0) {
                                const canFill = uniqueRemaining.some(u => {
                                    if (u.id === product.id && unpackedMap.get(product.id) === 1) return false;
                                    const minDim = Math.min(u.width, u.allow_rotate ? u.length : u.width);
                                    return minDim <= remW;
                                });
                                if (!canFill) deadSpacePenalty = remW * 1e6;
                            }

                            const volBonus = (cand.w * cand.l * cand.h) / 1000;
                            const laySidePenalty = (cand.type === 'lay_side' && gZ > 0) ? 1 : 0;

                            const score = (gZ * 1e11) + (y * 1e8) + (x * 1e4) + deadSpacePenalty + laySidePenalty - stackBonus - tightFitBonus - volBonus;

                            if (score < globalBestScore) {
                                globalBestScore = score;
                                globalBestPlace = { product, cand, x, y, z: gZ };
                            }
                        }
                    }
                }
            }
            if (globalBestPlace !== null) break;
        }

        if (globalBestPlace !== null) {
            const { product, cand, x, y, z } = globalBestPlace;
            placedItems.push({
                product: { ...product, quantity: 1 },
                x, y, z,
                w: cand.w, l: cand.l, h: cand.h,
                orientation: cand.type
            });
            placed.push({
                x, y, x2: x + cand.w, y2: y + cand.l, topZ: z + cand.h, itemH: cand.h
            });
            const cur = unpackedMap.get(product.id) ?? 0;
            unpackedMap.set(product.id, cur - 1);
            remainingTotal--;
        } else {
            // Log which items failed and why (first failed item only)
            const stillRemaining = validProducts.filter(p => (unpackedMap.get(p.id) || 0) > 0);
            for (const product of stillRemaining) {
                const candidates: Array<{ w: number; l: number; h: number }> = [
                    { w: product.width, l: product.length, h: product.height },
                    ...(product.allow_rotate ? [{ w: product.length, l: product.width, h: product.height }] : []),
                ];
                for (const cand of candidates) {
                    // Sample check at 5 y-positions
                    for (let testY = 0; testY < container.length; testY += Math.floor(container.length / 5)) {
                        if (testY + cand.l > container.length) continue;
                        for (let testX = 0; testX < container.width; testX += cand.w) {
                            if (testX + cand.w > container.width) continue;
                            const gZ = getGroundZ(testX, testY, cand.w, cand.l, placed);
                            const fits = gZ + cand.h <= container.height;
                            const stable = isStable(testX, testY, cand.w, cand.l, gZ, cand.h, placed);
                            if (!fits || !stable) {
                                console.log(`[PACKER FAIL] ${product.model_name} (${cand.w}x${cand.l}x${cand.h}) @ x=${testX},y=${testY},gZ=${gZ}: fits=${fits}(${gZ}+${cand.h}=${gZ+cand.h}/${container.height}), stable=${stable}`);
                            }
                        }
                    }
                }
            }
            break;
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

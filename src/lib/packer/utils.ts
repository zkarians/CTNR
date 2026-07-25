import { Product, PackedItem } from '../types';
import { TempItem } from './types';

export function isSmallProduct(p: Product): boolean {
    return Math.min(Number(p.width), Number(p.length), Number(p.height)) <= 300;
}

export function isLowHeightProduct(p: Product, orientedH?: number): boolean {
    const h = orientedH !== undefined ? orientedH : Number(p.height);
    return h <= 270;
}

export function getStackedCount(
    x: number,
    y: number,
    w: number,
    l: number,
    placedItems: PackedItem[]
): number {
    let count = 0;
    for (const item of placedItems) {
        if (!isLowHeightProduct(item.product, item.h)) continue;
        const xOverlap = Math.max(x, item.x) < Math.min(x + w, item.x + item.w) - 0.5;
        const yOverlap = Math.max(y, item.y) < Math.min(y + l, item.y + item.l) - 0.5;
        if (xOverlap && yOverlap) {
            count++;
        }
    }
    return count;
}

export function getStackedCountInTemp(
    x: number,
    yRel: number,
    w: number,
    l: number,
    tempItems: TempItem[]
): number {
    let count = 0;
    for (const item of tempItems) {
        if (!isLowHeightProduct(item.product, item.h)) continue;
        const xOverlap = Math.max(x, item.x) < Math.min(x + w, item.x + item.w) - 0.5;
        const yOverlap = Math.max(yRel, item.yRel) < Math.min(yRel + l, item.yRel + item.l) - 0.5;
        if (xOverlap && yOverlap) {
            count++;
        }
    }
    return count;
}

export function getMinTopZOfWall(wall: any, placedItems: PackedItem[]): number {
    let minZ = Infinity;
    const step = 50;
    const maxW = wall.maxW || 2352;
    for (let x = 25; x < maxW; x += step) {
        let maxZAtX = 0;
        for (const item of placedItems) {
            const xOverlap = x >= item.x && x < item.x + item.w;
            const yOverlap = (wall.y + wall.depth / 2) >= item.y && (wall.y + wall.depth / 2) < item.y + item.l;
            if (xOverlap && yOverlap) {
                maxZAtX = Math.max(maxZAtX, item.z + item.h);
            }
        }
        minZ = Math.min(minZ, maxZAtX);
    }
    return minZ === Infinity ? 0 : minZ;
}

export function getTopZAt(
    x: number,
    y: number,
    w: number,
    l: number,
    placedItems: PackedItem[]
): number {
    let maxZ = 0;
    const xMax = x + w;
    const yMax = y + l;
    for (let i = 0; i < placedItems.length; i++) {
        const item = placedItems[i];
        if (item.x >= xMax - 0.5 || item.x + item.w <= x + 0.5) continue;
        if (item.y >= yMax - 0.5 || item.y + item.l <= y + 0.5) continue;
        
        const itemTop = item.z + item.h;
        if (itemTop > maxZ) {
            maxZ = itemTop;
        }
    }
    return maxZ;
}

export function hasSupportAtZ(
    x: number,
    y: number,
    w: number,
    l: number,
    z: number,
    placedItems: PackedItem[],
    threshold: number = 0.75
): boolean {
    if (z === 0) return true;
    
    const targetArea = w * l;
    let supportArea = 0;
    
    const xMax = x + w;
    const yMax = y + l;
    
    for (let i = 0; i < placedItems.length; i++) {
        const item = placedItems[i];
        const itemTop = item.z + item.h;
        if (Math.abs(itemTop - z) > 5) continue;
        
        if (item.x >= xMax || item.x + item.w <= x) continue;
        if (item.y >= yMax || item.y + item.l <= y) continue;
        
        const xOverlap = Math.min(xMax, item.x + item.w) - Math.max(x, item.x);
        const yOverlap = Math.min(yMax, item.y + item.l) - Math.max(y, item.y);
        
        supportArea += xOverlap * yOverlap;
    }
    
    return (supportArea / targetArea) >= threshold;
}

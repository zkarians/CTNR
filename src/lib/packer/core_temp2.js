"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.packContainer = packContainer;
/**
 * V6.10 - Floating Item Fix
 * - Phase 2 headroom fill now iterates in both X and Y directions (was X-only), fixing
 *   incorrect support checks that caused products to float above their actual support zone.
 * - Gravity Drop: tightened "below us" threshold from 1mm to 0.5mm and added 0.5mm inset
 *   to X/Y overlap checks for more accurate settling.
 * - V4.19: Stability Filter Exemption, V6.00: Post-swap optimizer
 */
function isSmallProduct(p) {
    // V4.21: Increase threshold from 150 to 300 so flat items (e.g. h=267) act as toppers (Phase 2) instead of consuming floor space
    return Math.min(Number(p.width), Number(p.length), Number(p.height)) <= 300;
}
function isLowHeightProduct(p, orientedH) {
    var h = orientedH !== undefined ? orientedH : Number(p.height);
    return h <= 270;
}
function getStackedCount(x, y, w, l, placedItems) {
    var count = 0;
    for (var _i = 0, placedItems_1 = placedItems; _i < placedItems_1.length; _i++) {
        var item = placedItems_1[_i];
        if (!isLowHeightProduct(item.product, item.h))
            continue;
        var xOverlap = Math.max(x, item.x) < Math.min(x + w, item.x + item.w) - 0.5;
        var yOverlap = Math.max(y, item.y) < Math.min(y + l, item.y + item.l) - 0.5;
        if (xOverlap && yOverlap) {
            count++;
        }
    }
    return count;
}
function getStackedCountInTemp(x, yRel, w, l, tempItems) {
    var count = 0;
    for (var _i = 0, tempItems_1 = tempItems; _i < tempItems_1.length; _i++) {
        var item = tempItems_1[_i];
        if (!isLowHeightProduct(item.product, item.h))
            continue;
        var xOverlap = Math.max(x, item.x) < Math.min(x + w, item.x + item.w) - 0.5;
        var yOverlap = Math.max(yRel, item.yRel) < Math.min(yRel + l, item.yRel + item.l) - 0.5;
        if (xOverlap && yOverlap) {
            count++;
        }
    }
    return count;
}
function getMinTopZOfWall(wall, placedItems) {
    var minZ = Infinity;
    var step = 50;
    var maxW = wall.maxW || 2352;
    for (var x = 25; x < maxW; x += step) {
        var maxZAtX = 0;
        for (var _i = 0, placedItems_2 = placedItems; _i < placedItems_2.length; _i++) {
            var item = placedItems_2[_i];
            var xOverlap = x >= item.x && x < item.x + item.w;
            var yOverlap = (wall.y + wall.depth / 2) >= item.y && (wall.y + wall.depth / 2) < item.y + item.l;
            if (xOverlap && yOverlap) {
                maxZAtX = Math.max(maxZAtX, item.z + item.h);
            }
        }
        minZ = Math.min(minZ, maxZAtX);
    }
    return minZ === Infinity ? 0 : minZ;
}
function getTopZAt(x, y, w, l, placedItems) {
    var maxZ = 0;
    var xMax = x + w;
    var yMax = y + l;
    for (var i = 0; i < placedItems.length; i++) {
        var item = placedItems[i];
        if (item.x >= xMax - 0.5 || item.x + item.w <= x + 0.5)
            continue;
        if (item.y >= yMax - 0.5 || item.y + item.l <= y + 0.5)
            continue;
        var itemTop = item.z + item.h;
        if (itemTop > maxZ) {
            maxZ = itemTop;
        }
    }
    return maxZ;
}
function hasSupportAtZ(x, y, w, l, z, placedItems, threshold) {
    if (threshold === void 0) { threshold = 0.75; }
    if (z === 0)
        return true; // 바닥은 항상 지탱됨
    var targetArea = w * l;
    var supportArea = 0;
    var xMax = x + w;
    var yMax = y + l;
    for (var i = 0; i < placedItems.length; i++) {
        var item = placedItems[i];
        var itemTop = item.z + item.h;
        if (Math.abs(itemTop - z) > 5)
            continue;
        if (item.x >= xMax || item.x + item.w <= x)
            continue;
        if (item.y >= yMax || item.y + item.l <= y)
            continue;
        var xOverlap = Math.min(xMax, item.x + item.w) - Math.max(x, item.x);
        var yOverlap = Math.min(yMax, item.y + item.l) - Math.max(y, item.y);
        supportArea += xOverlap * yOverlap;
    }
    // 지탱해 주는 하단 면적의 총합이 상자 밑면 면적의 지정된 비율 이상을 차지해야 적재 가능
    return (supportArea / targetArea) >= threshold;
}
function hasSupportAtZInTemp(x, yRel, w, l, z, tempItems) {
    if (z === 0)
        return true; // 바닥은 지탱 검사 불요
    var targetArea = w * l;
    var supportArea = 0;
    for (var _i = 0, tempItems_2 = tempItems; _i < tempItems_2.length; _i++) {
        var item = tempItems_2[_i];
        var itemTop = item.z + item.h;
        // z축 방향으로 바로 아래에 맞닿아 있는지 확인 (5mm 내외의 오차 허용)
        if (Math.abs(itemTop - z) <= 5) {
            // X축 방향으로 겹치는 길이 계산
            var xOverlap = Math.max(0, Math.min(x + w, item.x + item.w) - Math.max(x, item.x));
            // YRel축 방향으로 겹치는 길이 계산
            var yOverlap = Math.max(0, Math.min(yRel + l, item.yRel + item.l) - Math.max(yRel, item.yRel));
            supportArea += xOverlap * yOverlap;
        }
    }
    // 지탱 비율 75% 이상 확보 검증
    return (supportArea / targetArea) >= 0.75;
}
function hasValidBaseForLowProduct(x, y, w, l, placedItems, curZ) {
    var queue = [
        { x: x, y: y, w: w, l: l, z: curZ }
    ];
    var visited = new Set();
    while (queue.length > 0) {
        var curr = queue.shift();
        if (curr.z === 0)
            return true;
        for (var _i = 0, placedItems_3 = placedItems; _i < placedItems_3.length; _i++) {
            var item = placedItems_3[_i];
            var xOverlap = Math.max(curr.x, item.x) < Math.min(curr.x + curr.w, item.x + item.w) - 0.5;
            var yOverlap = Math.max(curr.y, item.y) < Math.min(curr.y + curr.l, item.y + item.l) - 0.5;
            if (xOverlap && yOverlap) {
                var isDirectBase = Math.abs((item.z + item.h) - curr.z) <= 5;
                if (isDirectBase) {
                    if (item.h >= 500)
                        return true;
                    if (item.z === 0)
                        return true;
                    var key = "".concat(item.x, ",").concat(item.y, ",").concat(item.z);
                    if (!visited.has(key)) {
                        visited.add(key);
                        queue.push({ x: item.x, y: item.y, w: item.w, l: item.l, z: item.z });
                    }
                }
            }
        }
    }
    return false;
}
function isValidHeightStack(x, y, w, l, placedItems, curZ, topperH) {
    for (var _i = 0, placedItems_4 = placedItems; _i < placedItems_4.length; _i++) {
        var item = placedItems_4[_i];
        var xOverlap = Math.max(x, item.x) < Math.min(x + w, item.x + item.w) - 0.5;
        var yOverlap = Math.max(y, item.y) < Math.min(y + l, item.y + item.l) - 0.5;
        if (xOverlap && yOverlap) {
            var isDirectBase = Math.abs((item.z + item.h) - curZ) <= 5;
            if (isDirectBase) {
                if (item.h <= 500) {
                    if (topperH > item.h + 50) {
                        return false;
                    }
                }
            }
        }
    }
    return true;
}
function hasItemsOnTop(item, allItems) {
    var topZ = item.z + item.h;
    for (var _i = 0, allItems_1 = allItems; _i < allItems_1.length; _i++) {
        var other = allItems_1[_i];
        if (other.z >= topZ - 5) {
            var xOverlap = Math.max(item.x, other.x) < Math.min(item.x + item.w, other.x + other.w) - 0.5;
            var yOverlap = Math.max(item.y, other.y) < Math.min(item.y + item.l, other.y + other.l) - 0.5;
            if (xOverlap && yOverlap) {
                return true;
            }
        }
    }
    return false;
}
/**
 * V4.14: Check if placing a product with bottom face (orientedW × orientedL) is stable.
 * If the smallest face ≤ 1/4 of the largest face, and the bottom IS the smallest → REJECT.
 */
function isStableBottom(p, orientedW, orientedL) {
    var w = Number(p.width), l = Number(p.length), h = Number(p.height);
    var faceWL = w * l; // top/bottom when upright
    var faceWH = w * h; // side face
    var faceLH = l * h; // front/back face
    var minFace = Math.min(faceWL, faceWH, faceLH);
    var maxFace = Math.max(faceWL, faceWH, faceLH);
    // V4.19: Exempt large appliances like tall refrigerators (h > 1500mm)
    if (h > 1500)
        return true;
    // Rule only triggers if the smallest face is dramatically smaller (V4.19: 1/5 ratio)
    if (minFace > maxFace / 5)
        return true; // No restriction
    // Check if the current bottom face (orientedW × orientedL) equals the smallest face
    var bottomArea = orientedW * orientedL;
    // Allow some tolerance (within 1%)
    if (Math.abs(bottomArea - minFace) < minFace * 0.01)
        return false; // Unstable!
    return true;
}
/**
 * V4.24: Evaluate the value of a generated wall block.
 * Combines packed volume density (volume / depth) and width utilization.
 */
function evaluateWallScore(wallItems, containerWidth, isMixedWidthSpecialJob) {
    if (!wallItems || wallItems.length === 0)
        return 0;
    var vol = 0;
    var maxW = 0;
    var maxD = 0;
    for (var _i = 0, wallItems_1 = wallItems; _i < wallItems_1.length; _i++) {
        var it = wallItems_1[_i];
        vol += (it.w * it.l * it.h);
        var lEdge = (it.yRel || 0) + it.l;
        if (lEdge > maxD)
            maxD = lEdge;
        var wEdge = it.x + it.w;
        if (wEdge > maxW)
            maxW = wEdge;
    }
    if (maxD <= 0)
        return 0;
    var widthRatio = containerWidth > 0 ? maxW / containerWidth : 0;
    if (isMixedWidthSpecialJob) {
        // V4.31: Favor high width-utilization walls using cubic power
        return (vol / maxD) * (1 + Math.pow(widthRatio, 3) * 5.0);
    }
    // V4.30: Increase width utilization bonus to favor 3-column refrigerator walls (775mm wide)
    return (vol / maxD) * (1 + widthRatio * 2.5);
}
function packContainer(containerInput, productsInput, numPasses, force) {
    var _a;
    if (numPasses === void 0) { numPasses = 100; }
    if (force === void 0) { force = false; }
    var container = {
        id: containerInput.id, name: containerInput.name,
        width: Number(containerInput.width), length: Number(containerInput.length), height: Number(containerInput.height)
    };
    var aggMap = new Map();
    var invalidProducts = []; // V5.03: Track 0-dimension products to return as unpacked
    for (var _i = 0, productsInput_1 = productsInput; _i < productsInput_1.length; _i++) {
        var p = productsInput_1[_i];
        var qty = Number(p.quantity);
        if (qty <= 0)
            continue;
        // V5.03: Filter out products with 0 or negative dimensions
        if (Number(p.width) <= 0 || Number(p.length) <= 0 || Number(p.height) <= 0) {
            invalidProducts.push(__assign(__assign({}, p), { width: Number(p.width), length: Number(p.length), height: Number(p.height), quantity: qty }));
            continue;
        }
        var ex = aggMap.get(p.id);
        if (ex)
            ex.quantity += qty;
        else
            aggMap.set(p.id, __assign(__assign({}, p), { width: Number(p.width), length: Number(p.length), height: Number(p.height), quantity: qty }));
    }
    var products = Array.from(aggMap.values());
    if (container.width <= 0)
        return { container: __assign(__assign({}, container), { id: '40hc' }), items: [], efficiency: 0, unpacked: __spreadArray(__spreadArray([], products, true), invalidProducts, true) };
    var totalQty = products.reduce(function (acc, p) { return acc + p.quantity; }, 0);
    // V6.15: Detect 750mm/800mm mixed width special scenario to conditionally enable optimized packing rules
    var qty750 = products
        .filter(function (p) { return p.width >= 740 && p.width <= 760; })
        .reduce(function (sum, p) { return sum + p.quantity; }, 0);
    var qty800 = products
        .filter(function (p) { return p.width >= 790 && p.width <= 810; })
        .reduce(function (sum, p) { return sum + p.quantity; }, 0);
    var isMixedWidthSpecialJob = qty750 > 0 && qty800 > 0 && (qty750 / qty800 >= 1.5) && (qty750 / qty800 <= 2.5);
    // V6.13: Detect 700~760 + 790~850 mixed scenario where (B + A*2) > (A*3) and fits container width
    // e.g. DLEX8900B(800) + WDP6B(755)*2 = 2310 > WDP6B(755)*3 = 2265, and 2310 <= 2352
    var shouldForceMixedWidth = false;
    {
        var prodA = products.find(function (p) { return Number(p.width) >= 700 && Number(p.width) <= 760; });
        var prodB = products.find(function (p) { return Number(p.width) >= 790 && Number(p.width) <= 850; });
        if (prodA && prodB) {
            var wA = Number(prodA.width);
            var wB = Number(prodB.width);
            var combinedW = wB + wA * 2;
            var tripleAW = wA * 3;
            if (combinedW > tripleAW && combinedW <= container.width) {
                shouldForceMixedWidth = true;
            }
        }
    }
    // Separate normal and small products
    var normalProducts = products.filter(function (p) { return !isSmallProduct(p); });
    var smallProducts = products.filter(function (p) { return isSmallProduct(p); });
    var sortedNormal = __spreadArray([], normalProducts, true).sort(function (a, b) {
        if (b.height !== a.height)
            return b.height - a.height;
        return (b.width * b.length) - (a.width * a.length);
    });
    var sortedSmall = __spreadArray([], smallProducts, true).sort(function (a, b) { return (b.width * b.length * b.height) - (a.width * a.length * a.height); });
    var bestRes = null;
    // V6.13: If mixed condition exists, allow extra passes for the force-mixed phase
    var passes = Math.max(numPasses, shouldForceMixedWidth ? 50 : 30);
    for (var pIdx = 0; pIdx < passes; pIdx++) {
        // V6.13: 2-Pass strategy — first half uses standard logic, second half forces mixed-width
        // only when unpacked still exist and the dimensional condition is met
        var currentMixedFlag = isMixedWidthSpecialJob;
        var forceTallDepthOnly = false;
        if (shouldForceMixedWidth && pIdx >= 25 && bestRes && bestRes.unpacked.filter(function (p) { return p.id !== 'NONASSET.ITEM'; }).length > 0) {
            currentMixedFlag = true;
            forceTallDepthOnly = true; // V6.13: Force tall-product-depth walls to prevent pure-flat walls from outscoring mixed walls
        }
        var res = doTwoPhasePacking(container, sortedNormal, sortedSmall, products, pIdx, currentMixedFlag, forceTallDepthOnly);
        // V5.03: Append invalid 0-dimension products to the unpacked list so user sees them as failed
        if (invalidProducts.length > 0) {
            (_a = res.unpacked).push.apply(_a, invalidProducts);
        }
        // V6.00: Apply post-swap optimizer to resolve suboptimal greedy gap choices
        if (res.unpacked.length > 0) {
            res = optimizePackResultWithSwaps(container, res);
        }
        // V6.12: Run Y-compaction on the final optimized result
        compactItemsAlongY(res.items, container);
        var vol = res.items.reduce(function (s, i) { return s + (i.w * i.l * i.h); }, 0);
        res.efficiency = (vol / (container.width * container.length * container.height)) * 100;
        if (!bestRes || res.items.length > bestRes.items.length) {
            bestRes = res;
        }
        if (bestRes.items.length === totalQty)
            break;
    }
    return bestRes;
}
function doTwoPhasePacking(container, normalProducts, smallProducts, allProducts, pIdx, isMixedWidthSpecialJob, forceTallDepthOnly) {
    if (forceTallDepthOnly === void 0) { forceTallDepthOnly = false; }
    var unpacked = new Map();
    allProducts.forEach(function (p) { return unpacked.set(p.id, p.quantity); });
    var placed = [];
    // ---- PHASE 1: Pack normal items only (no small items in base) ----
    var normalUnpacked = new Map();
    normalProducts.forEach(function (p) { return normalUnpacked.set(p.id, p.quantity); });
    var hasSmall = allProducts.some(isSmallProduct);
    var runNormal = __spreadArray([], normalProducts, true).sort(function (a, b) {
        // V6.17: 1350mm 이상의 대형 제품은 무작위 탐색 시에도 항상 최우선 정렬하여 안쪽(y=0)부터 적재되도록 강제
        var aTall = a.height >= 1350;
        var bTall = b.height >= 1350;
        if (aTall && !bTall)
            return -1;
        if (!aTall && bTall)
            return 1;
        if (b.height !== a.height) {
            return b.height - a.height;
        }
        if (pIdx > 0)
            return Math.random() - 0.5;
        return (b.width * b.height) - (a.width * a.height);
    });
    var currentY = 0;
    // Track walls for Phase 2 (small items on top)
    var walls = [];
    while (currentY < container.length) {
        var rem = runNormal.filter(function (p) { return normalUnpacked.get(p.id) > 0; });
        if (rem.length === 0)
            break;
        var depthCandidates = [];
        if (isMixedWidthSpecialJob) {
            if (forceTallDepthOnly) {
                // V6.13: Restrict depth candidates to tall product only (e.g. DLEX8900B h=1148)
                // so pure flat-product walls cannot outscore mixed walls during forced passes.
                // When tall product is exhausted, fall back to all remaining products.
                var tallProd = rem.find(function (p) { return Number(p.height) >= 1000; });
                if (tallProd) {
                    depthCandidates.push(Number(tallProd.length));
                    if (tallProd.allow_rotate) {
                        depthCandidates.push(Number(tallProd.width), Number(tallProd.height));
                    }
                    else {
                        depthCandidates.push(Number(tallProd.height));
                    }
                }
                else {
                    // Tall product exhausted — fall back to all remaining
                    for (var _i = 0, rem_1 = rem; _i < rem_1.length; _i++) {
                        var rp = rem_1[_i];
                        depthCandidates.push(Number(rp.length));
                        if (rp.allow_rotate) {
                            depthCandidates.push(Number(rp.width), Number(rp.height));
                        }
                        else {
                            depthCandidates.push(Number(rp.height));
                        }
                    }
                }
            }
            else {
                for (var _a = 0, rem_2 = rem; _a < rem_2.length; _a++) {
                    var rp = rem_2[_a];
                    depthCandidates.push(rp.length);
                    if (rp.allow_rotate) {
                        depthCandidates.push(rp.width, rp.height);
                    }
                    else {
                        depthCandidates.push(rp.height);
                    }
                }
            }
        }
        else {
            var p1 = rem[0];
            depthCandidates.push.apply(depthCandidates, (p1.allow_rotate ? [p1.length, p1.width, p1.height] : [p1.length, p1.height]));
            var smallRem = allProducts.filter(function (p) { return (unpacked.get(p.id) || 0) > 0 && isSmallProduct(p); });
            for (var _b = 0, smallRem_1 = smallRem; _b < smallRem_1.length; _b++) {
                var sp = smallRem_1[_b];
                depthCandidates.push(sp.length, sp.width);
            }
        }
        var depths = Array.from(new Set(depthCandidates))
            .filter(function (d) { return d > 0 && d <= (container.length - currentY) + 0.5; });
        if (!isMixedWidthSpecialJob) {
            depths.sort(function (a, b) { return b - a; });
        }
        var bestWItems = [];
        var bestActualDepth = 0;
        var bestWallScore = -Infinity;
        for (var _c = 0, depths_1 = depths; _c < depths_1.length; _c++) {
            var limitD = depths_1[_c];
            // V4.26: Pass global unpacked and allProducts so blockPackShelf can scavenge small items for side gaps
            var tempU = new Map(unpacked);
            var wallItems = blockPackShelf(container.width, container.height, limitD, allProducts, tempU, false, isMixedWidthSpecialJob);
            if (limitD === 665 || limitD === 680 || limitD === 935)
                console.log("blockPackShelf limitD:", limitD, "returned wallItems.length:", wallItems.length);
            var score = evaluateWallScore(wallItems, container.width, isMixedWidthSpecialJob);
            if (isMixedWidthSpecialJob && pIdx > 0) {
                score *= (0.9 + Math.random() * 0.2); // ±10% random noise to explore other wall options in random trials
            }
            if (score > bestWallScore) {
                bestWallScore = score;
                bestWItems = wallItems;
                bestActualDepth = wallItems.length > 0 ? Math.max.apply(Math, wallItems.map(function (it) { return (it.yRel || 0) + it.l; })) : 0;
            }
        }
        if (bestWItems.length === 0) {
            currentY += 10;
            if (currentY > container.length)
                break;
            continue;
        }
        var wallPlaced = [];
        var sortedWItems = __spreadArray([], bestWItems, true).sort(function (a, b) { return a.z - b.z; });
        for (var _d = 0, sortedWItems_1 = sortedWItems; _d < sortedWItems_1.length; _d++) {
            var wi = sortedWItems_1[_d];
            var targetY = currentY + (wi.yRel || 0);
            var targetX = wi.x;
            var targetZ = wi.z;
            // 2층 이상에 적재된 품목(topper)인 경우 Y축 앞방향으로 밀착(Sliding) 처리
            if (targetZ > 0) {
                var targetXMax = targetX + wi.w;
                var targetZMax = targetZ + wi.h;
                // 1. Overlap 후보군 필터링 (X축 및 Z축 모두 겹쳐야 함)
                var overlapCandidates = [];
                // 2. getTopZAt/hasSupportAtZ 후보군 필터링 (X축이 겹쳐야 함)
                var xOverlapCandidates = [];
                for (var i = 0; i < placed.length; i++) {
                    var other = placed[i];
                    var xOverlap = Math.max(targetX, other.x) < Math.min(targetXMax, other.x + other.w) - 0.5;
                    if (xOverlap) {
                        xOverlapCandidates.push(other);
                        var zOverlap = Math.max(targetZ, other.z) < Math.min(targetZMax, other.z + other.h) - 0.5;
                        if (zOverlap) {
                            overlapCandidates.push(other);
                        }
                    }
                }
                var bestY = targetY;
                for (var candidateY = targetY - 1; candidateY >= 0; candidateY--) {
                    // 1. 다른 상자와의 물리적 충돌(Overlap) 검사 - 충돌 시 루프 완전 종료 (Hard Stop)
                    var overlap = false;
                    for (var i = 0; i < overlapCandidates.length; i++) {
                        var other = overlapCandidates[i];
                        var yOverlap = Math.max(candidateY, other.y) < Math.min(candidateY + wi.l, other.y + other.l) - 0.5;
                        if (yOverlap) {
                            overlap = true;
                            break;
                        }
                    }
                    if (overlap) {
                        break; // 충돌 발생 시에는 더 이상 앞으로 전진 불가
                    }
                    // 2. 해당 후보 위치에서 안정적인 지탱이 가능한지 검사 (최종 안착 가능 여부) - 슬라이딩 시에는 100% 지탱만 허용하여 계단식 돌출 적재 방지
                    var candidateZ = getTopZAt(targetX, candidateY, wi.w, wi.l, xOverlapCandidates);
                    var isHeightMatch = candidateZ === targetZ;
                    var isSupported = hasSupportAtZ(targetX, candidateY, wi.w, wi.l, targetZ, xOverlapCandidates, 0.99);
                    if (isHeightMatch && isSupported) {
                        bestY = candidateY; // 지탱 가능하고 단차가 맞다면 이 위치를 최선으로 저장
                    }
                }
                targetY = bestY;
            }
            var pi = __assign(__assign({}, wi), { y: targetY, product: __assign(__assign({}, wi.product), { quantity: 1 }) });
            placed.push(pi);
            wallPlaced.push(pi);
            unpacked.set(wi.product.id, unpacked.get(wi.product.id) - 1);
            // Only deduct from Phase 1 target map if it was a normal product
            if (!isSmallProduct(wi.product)) {
                normalUnpacked.set(wi.product.id, normalUnpacked.get(wi.product.id) - 1);
            }
        }
        walls.push({ y: currentY, depth: bestActualDepth, items: wallPlaced });
        currentY += bestActualDepth;
    }
    var allRemainingProducts = allProducts.filter(function (p) { return (unpacked.get(p.id) || 0) > 0; });
    var runPhase2 = __spreadArray([], allRemainingProducts, true).sort(function (a, b) {
        if (b.height !== a.height)
            return b.height - a.height;
        return (b.width * b.length) - (a.width * a.length);
    });
    for (var _e = 0, walls_1 = walls; _e < walls_1.length; _e++) {
        var wall = walls_1[_e];
        var wallMaxZ = 0;
        var wallMaxW = 0;
        var wallBaseL = wall.depth;
        var isTopLay = false;
        for (var _f = 0, _g = wall.items; _f < _g.length; _f++) {
            var item = _g[_f];
            // V4.28: Ignore small products for base height. Side-gap towers must not block headroom detection.
            if (isSmallProduct(item.product))
                continue;
            var topZ = item.z + item.h;
            if (topZ > wallMaxZ) {
                wallMaxZ = topZ;
                isTopLay = (item.orientation === 'lay');
            }
            else if (topZ === wallMaxZ && item.orientation === 'lay') {
                isTopLay = true;
            }
            var rightEdge = item.x + item.w;
            if (rightEdge > wallMaxW)
                wallMaxW = rightEdge;
        }
        var curZ = getMinTopZOfWall(wall, placed);
        var filled = true;
        var safetyCounter = 0;
        while (filled && curZ < container.height && safetyCounter++ < 200) {
            filled = false;
            var bestRowScore = -Infinity;
            var bestRowItems = [];
            var bestRowH = 0;
            for (var _h = 0, runPhase2_1 = runPhase2; _h < runPhase2_1.length; _h++) {
                var sp = runPhase2_1[_h];
                var avail = unpacked.get(sp.id) || 0;
                if (avail <= 0)
                    continue;
                var p2Orients = [
                    { w: sp.width, l: sp.length, h: sp.height, type: 'std' }
                ];
                if (sp.allow_rotate && sp.width !== sp.length) {
                    p2Orients.push({ w: sp.length, l: sp.width, h: sp.height, type: 'rot' });
                }
                if (sp.height > sp.width || sp.height > sp.length) {
                    p2Orients.push({ w: sp.width, l: sp.height, h: sp.length, type: 'lay' });
                    if (sp.allow_rotate && sp.width !== sp.length) {
                        p2Orients.push({ w: sp.length, l: sp.height, h: sp.width, type: 'lay' });
                    }
                }
                for (var _j = 0, p2Orients_1 = p2Orients; _j < p2Orients_1.length; _j++) {
                    var to = p2Orients_1[_j];
                    var isLayOrient = (to.type === 'lay');
                    var maxAvailL = isLayOrient ? (container.length - wall.y) : wallBaseL;
                    if (to.h > (container.height - curZ) + 0.5 || to.l > maxAvailL || to.w > wallMaxW + 100)
                        continue;
                    // 눕힘 박스 위 눕힘 중복 적재(Z축) 엄격 금지 규칙
                    if (isLayOrient) {
                        var hasUnderLay = wall.items.some(function (it) { return it.orientation === 'lay'; });
                        if (hasUnderLay)
                            continue;
                    }
                    var baseMaxH = wall.items.reduce(function (max, it) { return Math.max(max, isSmallProduct(it.product) ? 0 : it.h); }, 0);
                    if (baseMaxH < 500 && to.h >= 670)
                        continue;
                    var isTopperLow = isLowHeightProduct(sp, to.h);
                    if (isTopperLow && baseMaxH < 500)
                        continue;
                    var suppW = Math.min(to.w, wallMaxW);
                    var suppL = Math.min(to.l, maxAvailL);
                    if (suppW * suppL < to.w * to.l * 0.66)
                        continue;
                    var fitCountW = Math.floor((wallMaxW + 100) / to.w);
                    var fitCountL = Math.floor((maxAvailL + 100) / to.l);
                    if (fitCountW === 0 || fitCountL === 0)
                        continue;
                    var fitCount = fitCountW * fitCountL;
                    var rowCount = Math.min(fitCount, avail);
                    var rowItems = [];
                    var placedCount = 0;
                    outerLoop: for (var li = 0; li < fitCountL; li++) {
                        for (var ri = 0; ri < fitCountW; ri++) {
                            if (placedCount >= rowCount)
                                break outerLoop;
                            var targetX = ri * to.w;
                            var targetY = wall.y + (li * to.l);
                            // 컨테이너 경계 초과 검사
                            if (targetX + to.w > container.width + 0.5 || targetY + to.l > container.length + 0.5) {
                                continue;
                            }
                            var targetXMax = targetX + to.w;
                            // 1. getTopZAt/hasSupportAtZ 후보군 필터링 (X축이 겹쳐야 함)
                            var xOverlapCandidates = [];
                            for (var i = 0; i < placed.length; i++) {
                                var other = placed[i];
                                if (Math.max(targetX, other.x) < Math.min(targetXMax, other.x + other.w) - 0.5) {
                                    xOverlapCandidates.push(other);
                                }
                            }
                            var targetZ = getTopZAt(targetX, targetY, to.w, to.l, xOverlapCandidates);
                            var targetZMax = targetZ + to.h;
                            // 2. Overlap 후보군 필터링 (X축이 겹치고 Z축도 겹쳐야 함)
                            var overlapCandidates = [];
                            for (var i = 0; i < xOverlapCandidates.length; i++) {
                                var other = xOverlapCandidates[i];
                                if (Math.max(targetZ, other.z) < Math.min(targetZMax, other.z + other.h) - 0.5) {
                                    overlapCandidates.push(other);
                                }
                            }
                            // Y축 슬라이딩 탐색 (앞쪽으로 바짝 당겨 배치)
                            var slidY = targetY;
                            for (var candidateY = targetY - 1; candidateY >= 0; candidateY--) {
                                var candidateZ = getTopZAt(targetX, candidateY, to.w, to.l, xOverlapCandidates);
                                if (candidateZ !== targetZ) {
                                    break; // 높이가 다르면 단차가 발생하므로 슬라이딩 불가
                                }
                                // 슬라이딩 시에는 100% 지탱만 허용하여 계단식 돌출 적재 방지
                                if (!hasSupportAtZ(targetX, candidateY, to.w, to.l, targetZ, xOverlapCandidates, 0.99)) {
                                    break; // 지탱 공간이 확보되지 않으면 슬라이딩 불가
                                }
                                var overlap_1 = false;
                                var checkList = __spreadArray(__spreadArray([], placed, true), rowItems, true);
                                for (var i = 0; i < checkList.length; i++) {
                                    var other = checkList[i];
                                    var xOverlap = Math.max(targetX, other.x) < Math.min(targetX + to.w, other.x + other.w) - 0.5;
                                    var yOverlap = Math.max(candidateY, other.y) < Math.min(candidateY + to.l, other.y + other.l) - 0.5;
                                    var zOverlap = Math.max(targetZ, other.z) < Math.min(targetZ + to.h, other.z + other.h) - 0.5;
                                    if (xOverlap && yOverlap && zOverlap) {
                                        overlap_1 = true;
                                        break;
                                    }
                                }
                                if (overlap_1) {
                                    break; // 다른 상자와 충돌 시 슬라이딩 불가
                                }
                                slidY = candidateY;
                            }
                            targetY = slidY;
                            if (targetZ + to.h > container.height + 0.5) {
                                continue;
                            }
                            // 1. 공중 부양 방지 지탱면 검사
                            if (!hasSupportAtZ(targetX, targetY, to.w, to.l, targetZ, placed)) {
                                continue;
                            }
                            // 추가: 3D 오버랩(겹침) 검사
                            var overlap = false;
                            for (var _k = 0, placed_1 = placed; _k < placed_1.length; _k++) {
                                var other = placed_1[_k];
                                var xOverlap = Math.max(targetX, other.x) < Math.min(targetX + to.w, other.x + other.w) - 0.5;
                                var yOverlap = Math.max(targetY, other.y) < Math.min(targetY + to.l, other.y + other.l) - 0.5;
                                var zOverlap = Math.max(targetZ, other.z) < Math.min(targetZ + to.h, other.z + other.h) - 0.5;
                                if (xOverlap && yOverlap && zOverlap) {
                                    overlap = true;
                                    break;
                                }
                            }
                            if (overlap)
                                continue;
                            // 2. 10단 누적 제한 체크 (모든 제품에 적용)
                            var stacked = getStackedCount(targetX, targetY, to.w, to.l, placed);
                            if (stacked >= 10) {
                                continue;
                            }
                            // 3. 아래 제품의 높이가 500mm 이하일 때, 새로 쌓으려는 제품의 높이가 기존 제품 높이 + 50mm를 초과하면 적재 제한
                            if (targetZ > 0 && !isValidHeightStack(targetX, targetY, to.w, to.l, placed, targetZ, to.h)) {
                                continue;
                            }
                            if (isTopperLow) {
                                // 4. 베이스 높이 500 이상 체크 (바로 아래 베이스 기준)
                                if (!hasValidBaseForLowProduct(targetX, targetY, to.w, to.l, placed, targetZ)) {
                                    continue;
                                }
                            }
                            rowItems.push({ product: sp, x: targetX, y: targetY, z: targetZ, w: to.w, l: to.l, h: to.h, orientation: to.type });
                            placedCount++;
                        }
                    }
                    // V4.17: Score by PHYSICAL CAPACITY (fitCount), not actual placed count
                    var potentialW = fitCountW * to.w;
                    var potentialL = fitCountL * to.l;
                    var potentialUtil = (potentialW * potentialL) / (wallMaxW * wallBaseL);
                    var rowVol = rowCount * to.w * to.l * to.h;
                    var penalty = 0;
                    if (to.h > baseMaxH) {
                        penalty = 5000000; // 역순 적재 패널티
                    }
                    // V6.16: baseMaxH가 1350mm 이상인 경우, 10단 이상 적재 가능한 제품(isLowHeightProduct)에 가중치 부여
                    var bonus = 0;
                    if (baseMaxH >= 1350) {
                        if (isLowHeightProduct(sp, to.h)) {
                            bonus = 100000000000;
                        }
                    }
                    var rowScore = fitCount * 1000000 + rowVol * potentialUtil - penalty + bonus;
                    if (rowScore > bestRowScore) {
                        bestRowScore = rowScore;
                        bestRowItems = rowItems;
                        bestRowH = to.h;
                    }
                }
            }
            if (bestRowItems.length > 0) {
                for (var _l = 0, bestRowItems_1 = bestRowItems; _l < bestRowItems_1.length; _l++) {
                    var ri = bestRowItems_1[_l];
                    var pi = __assign(__assign({}, ri), { product: __assign(__assign({}, ri.product), { quantity: 1 }) });
                    placed.push(pi);
                    wall.items.push(pi);
                    unpacked.set(ri.product.id, unpacked.get(ri.product.id) - 1);
                }
                curZ = getMinTopZOfWall(wall, placed);
                // V5.04: If the stacked item is laid down, stop filling on top of it.
                filled = bestRowItems[0].orientation !== 'lay';
            }
        }
    }
    // ---- PHASE 3: Remaining NORMAL products on the floor (no small) ----
    var remainingNormal = allProducts.filter(function (p) { return (unpacked.get(p.id) || 0) > 0 && !isSmallProduct(p); })
        .map(function (p) { return (__assign(__assign({}, p), { quantity: unpacked.get(p.id) })); });
    if (remainingNormal.length > 0) {
        var floorUnpacked_1 = new Map();
        remainingNormal.forEach(function (p) { return floorUnpacked_1.set(p.id, p.quantity); });
        var runFloor = __spreadArray([], remainingNormal, true).sort(function (a, b) {
            if (hasSmall) {
                var aIsBig = Number(a.height) >= 500;
                var bIsBig = Number(b.height) >= 500;
                if (aIsBig && !bIsBig)
                    return -1;
                if (!aIsBig && bIsBig)
                    return 1;
            }
            if (pIdx > 0)
                return Math.random() - 0.5;
            return (b.width * b.height) - (a.width * a.height);
        });
        while (currentY < container.length) {
            var rem = runFloor.filter(function (p) { return floorUnpacked_1.get(p.id) > 0; });
            if (rem.length === 0)
                break;
            var p1 = rem[0];
            var depthCandidates = p1.allow_rotate
                ? [p1.length, p1.width, p1.height]
                : [p1.length, p1.height];
            // V4.27 Depth Expansion (Phase 3)
            var smallRem = allProducts.filter(function (p) { return (unpacked.get(p.id) || 0) > 0 && isSmallProduct(p); });
            for (var _m = 0, smallRem_2 = smallRem; _m < smallRem_2.length; _m++) {
                var sp = smallRem_2[_m];
                depthCandidates.push(sp.length, sp.width);
            }
            var depths = Array.from(new Set(depthCandidates)).filter(function (d) { return d > 0 && d <= (container.length - currentY) + 0.5; }).sort(function (a, b) { return b - a; });
            var bestWItems = [];
            var bestActualDepth = 0;
            var bestWallScore = -Infinity;
            for (var _o = 0, depths_2 = depths; _o < depths_2.length; _o++) {
                var limitD = depths_2[_o];
                // V4.26 Scavenge side gaps in Phase 3 as well
                var tempU = new Map(unpacked);
                var wallItems = blockPackShelf(container.width, container.height, limitD, allProducts, tempU, false, isMixedWidthSpecialJob);
                var score = evaluateWallScore(wallItems, container.width, isMixedWidthSpecialJob);
                if (pIdx > 0) {
                    score *= (0.9 + Math.random() * 0.2);
                }
                if (score > bestWallScore) {
                    bestWallScore = score;
                    bestWItems = wallItems;
                    bestActualDepth = wallItems.length > 0 ? Math.max.apply(Math, wallItems.map(function (it) { return (it.yRel || 0) + it.l; })) : 0;
                }
            }
            if (bestWItems.length === 0) {
                currentY += 10;
                if (currentY > container.length)
                    break;
                continue;
            }
            var phase3Wall = [];
            for (var _p = 0, bestWItems_1 = bestWItems; _p < bestWItems_1.length; _p++) {
                var wi = bestWItems_1[_p];
                var pi = __assign(__assign({}, wi), { y: currentY + (wi.yRel || 0), product: __assign(__assign({}, wi.product), { quantity: 1 }) });
                placed.push(pi);
                phase3Wall.push(pi);
                unpacked.set(wi.product.id, unpacked.get(wi.product.id) - 1);
                if (!isSmallProduct(wi.product)) {
                    floorUnpacked_1.set(wi.product.id, floorUnpacked_1.get(wi.product.id) - 1);
                }
            }
            walls.push({ y: currentY, depth: bestActualDepth, items: phase3Wall });
            currentY += bestActualDepth;
        }
    }
    var macroWalls = [];
    for (var _q = 0, walls_2 = walls; _q < walls_2.length; _q++) {
        var wall = walls_2[_q];
        var wallMaxZ = 0;
        var wallMaxW = 0;
        var isTopLay = false;
        for (var _r = 0, _s = wall.items; _r < _s.length; _r++) {
            var item = _s[_r];
            var topZ = item.z + item.h;
            if (topZ > wallMaxZ) {
                wallMaxZ = topZ;
                isTopLay = (item.orientation === 'lay');
            }
            else if (topZ === wallMaxZ && item.orientation === 'lay') {
                isTopLay = true;
            }
            var rightEdge = item.x + item.w;
            if (rightEdge > wallMaxW)
                wallMaxW = rightEdge;
        }
        for (var _t = 0, placed_2 = placed; _t < placed_2.length; _t++) {
            var pi = placed_2[_t];
            if (pi.y >= wall.y && pi.y < wall.y + wall.depth) {
                var topZ = pi.z + pi.h;
                if (topZ > wallMaxZ) {
                    wallMaxZ = topZ;
                    isTopLay = (pi.orientation === 'lay');
                }
                else if (topZ === wallMaxZ && pi.orientation === 'lay') {
                    isTopLay = true;
                }
            }
        }
        if (macroWalls.length > 0) {
            var last = macroWalls[macroWalls.length - 1];
            // If they sequentially touch and have identical Z/W capacity boundaries, merge them.
            if (Math.abs((last.y + last.depth) - wall.y) < 1 && Math.abs(last.maxZ - wallMaxZ) < 1 && Math.abs(last.maxW - wallMaxW) < 1 && last.isTopLay === isTopLay) {
                last.depth += wall.depth;
                continue;
            }
        }
        macroWalls.push({ y: wall.y, depth: wall.depth, maxZ: wallMaxZ, maxW: wallMaxW, isTopLay: isTopLay });
    }
    // ---- PHASE 4: Stack remaining SMALL products on top of ALL macro walls ----
    var remainingSmall = allProducts.filter(function (p) { return (unpacked.get(p.id) || 0) > 0 && isSmallProduct(p); });
    var runPhase4 = pIdx > 0 ? __spreadArray([], remainingSmall, true).sort(function () { return Math.random() - 0.5; }) : remainingSmall;
    for (var _u = 0, macroWalls_1 = macroWalls; _u < macroWalls_1.length; _u++) {
        var wall = macroWalls_1[_u];
        var wallMaxZ = wall.maxZ;
        var wallMaxW = wall.maxW;
        var wallBaseL = wall.depth;
        var curZ = getMinTopZOfWall(wall, placed);
        var filled = !wall.isTopLay; // V5.02: Block filling if top item is laid down
        var safetyCounter = 0;
        while (filled && curZ < container.height && safetyCounter++ < 200) {
            filled = false;
            var bestRowScore = -Infinity;
            var bestRowItems = [];
            var bestRowH = 0;
            for (var _v = 0, runPhase4_1 = runPhase4; _v < runPhase4_1.length; _v++) {
                var sp = runPhase4_1[_v];
                var avail = unpacked.get(sp.id) || 0;
                if (avail <= 0)
                    continue;
                var orients = getOrients(sp);
                for (var _w = 0, orients_1 = orients; _w < orients_1.length; _w++) {
                    var to = orients_1[_w];
                    if (to.h > (container.height - curZ) + 0.5 || to.l > wallBaseL + 100 || to.w > wallMaxW + 100)
                        continue;
                    var suppW = Math.min(to.w, wallMaxW);
                    var suppL = Math.min(to.l, wallBaseL);
                    if (suppW * suppL < to.w * to.l * 0.66)
                        continue;
                    // V4.25: Fill in 2D space (Width x Depth) instead of a single 1D strip.
                    var fitCountW = Math.floor((wallMaxW + 100) / to.w);
                    var fitCountL = Math.floor((wallBaseL + 100) / to.l);
                    if (fitCountW === 0 || fitCountL === 0)
                        continue;
                    var countLimit = Math.min(fitCountW * fitCountL, avail);
                    var rowItems = [];
                    var placedCount = 0;
                    for (var l_idx = 0; l_idx < fitCountL; l_idx++) {
                        for (var w_idx = 0; w_idx < fitCountW; w_idx++) {
                            if (placedCount >= countLimit)
                                break;
                            var targetX = w_idx * to.w;
                            var targetY = wall.y + (l_idx * to.l);
                            // 컨테이너 경계 초과 검사
                            if (targetX + to.w > container.width + 0.5 || targetY + to.l > container.length + 0.5) {
                                continue;
                            }
                            var targetZ = getTopZAt(targetX, targetY, to.w, to.l, placed);
                            if (targetZ + to.h > container.height + 0.5) {
                                continue;
                            }
                            // 1. 공중 부양 방지 지탱면 검사
                            if (!hasSupportAtZ(targetX, targetY, to.w, to.l, targetZ, placed)) {
                                continue;
                            }
                            // 추가: 3D 오버랩(겹침) 검사
                            var overlap = false;
                            for (var _x = 0, placed_3 = placed; _x < placed_3.length; _x++) {
                                var other = placed_3[_x];
                                var xOverlap = Math.max(targetX, other.x) < Math.min(targetX + to.w, other.x + other.w) - 0.5;
                                var yOverlap = Math.max(targetY, other.y) < Math.min(targetY + to.l, other.y + other.l) - 0.5;
                                var zOverlap = Math.max(targetZ, other.z) < Math.min(targetZ + to.h, other.z + other.h) - 0.5;
                                if (xOverlap && yOverlap && zOverlap) {
                                    overlap = true;
                                    break;
                                }
                            }
                            if (overlap)
                                continue;
                            var isTopperLow = isLowHeightProduct(sp, to.h);
                            // 2. 10단 누적 제한 체크 (모든 제품에 적용)
                            var stacked = getStackedCount(targetX, targetY, to.w, to.l, placed);
                            if (stacked >= 10) {
                                continue;
                            }
                            // 3. 아래 제품의 높이가 500mm 이하일 때, 새로 쌓으려는 제품의 높이가 기존 제품 높이 + 50mm를 초과하면 적재 제한
                            if (targetZ > 0 && !isValidHeightStack(targetX, targetY, to.w, to.l, placed, targetZ, to.h)) {
                                continue;
                            }
                            if (isTopperLow) {
                                // 4. 베이스 높이 500 이상 체크 (바로 아래 베이스 기준)
                                if (!hasValidBaseForLowProduct(targetX, targetY, to.w, to.l, placed, targetZ)) {
                                    continue;
                                }
                            }
                            rowItems.push({
                                product: sp,
                                x: targetX,
                                y: targetY,
                                z: targetZ,
                                w: to.w, l: to.l, h: to.h,
                                orientation: to.type
                            });
                            placedCount++;
                        }
                    }
                    // Strongly prioritize volume to ensure we pick rotations/products that fill the most raw capacity
                    var rowVol = placedCount * to.w * to.l * to.h;
                    var rowScore = placedCount * 1000000 + rowVol;
                    if (rowScore > bestRowScore) {
                        bestRowScore = rowScore;
                        bestRowItems = rowItems;
                        bestRowH = to.h;
                    }
                }
            }
            if (bestRowItems.length > 0) {
                for (var _y = 0, bestRowItems_2 = bestRowItems; _y < bestRowItems_2.length; _y++) {
                    var ri = bestRowItems_2[_y];
                    placed.push(__assign(__assign({}, ri), { product: __assign(__assign({}, ri.product), { quantity: 1 }) }));
                    unpacked.set(ri.product.id, unpacked.get(ri.product.id) - 1);
                }
                curZ = getMinTopZOfWall(wall, placed);
                // V5.04: If the stacked item is laid down, stop filling on top of it.
                filled = bestRowItems[0].orientation !== 'lay';
            }
        }
    }
    // ---- PHASE 5: ONLY if all normal products packed, allow small on floor ----
    var normalStillUnpacked = allProducts.filter(function (p) { return !isSmallProduct(p) && (unpacked.get(p.id) || 0) > 0; });
    var smallStillUnpacked = allProducts.filter(function (p) { return isSmallProduct(p) && (unpacked.get(p.id) || 0) > 0; })
        .map(function (p) { return (__assign(__assign({}, p), { quantity: unpacked.get(p.id) })); });
    if (normalStillUnpacked.length === 0 && smallStillUnpacked.length > 0) {
        var floorUnpacked_2 = new Map();
        smallStillUnpacked.forEach(function (p) { return floorUnpacked_2.set(p.id, p.quantity); });
        var runSmallFloor = pIdx > 0 ? __spreadArray([], smallStillUnpacked, true).sort(function () { return Math.random() - 0.5; }) : smallStillUnpacked;
        while (currentY < container.length) {
            var rem = runSmallFloor.filter(function (p) { return floorUnpacked_2.get(p.id) > 0; });
            if (rem.length === 0)
                break;
            var p1 = rem[0];
            var depthCandidates = p1.allow_rotate
                ? [p1.length, p1.width, p1.height]
                : [p1.length, p1.height];
            var depths = Array.from(new Set(depthCandidates)).filter(function (d) { return d > 0 && d <= (container.length - currentY) + 0.5; }).sort(function (a, b) { return b - a; });
            var bestWItems = [];
            var bestActualDepth = 0;
            var bestWallScore = -Infinity;
            for (var _z = 0, depths_3 = depths; _z < depths_3.length; _z++) {
                var limitD = depths_3[_z];
                var tempU = new Map(floorUnpacked_2);
                var wallItems = blockPackShelf(container.width, container.height, limitD, runSmallFloor, tempU, true, isMixedWidthSpecialJob);
                var score = evaluateWallScore(wallItems, container.width, isMixedWidthSpecialJob);
                if (score > bestWallScore) {
                    bestWallScore = score;
                    bestWItems = wallItems;
                    bestActualDepth = wallItems.length > 0 ? Math.max.apply(Math, wallItems.map(function (it) { return (it.yRel || 0) + it.l; })) : 0;
                }
            }
            if (bestWItems.length === 0) {
                currentY += 10;
                if (currentY > container.length)
                    break;
                continue;
            }
            for (var _0 = 0, bestWItems_2 = bestWItems; _0 < bestWItems_2.length; _0++) {
                var wi = bestWItems_2[_0];
                placed.push(__assign(__assign({}, wi), { y: currentY + (wi.yRel || 0), product: __assign(__assign({}, wi.product), { quantity: 1 }) }));
                floorUnpacked_2.set(wi.product.id, floorUnpacked_2.get(wi.product.id) - 1);
                unpacked.set(wi.product.id, unpacked.get(wi.product.id) - 1);
            }
            currentY += bestActualDepth;
        }
    }
    // ---- GRAVITY DROP: Fix floating items ----
    // Iteratively drop each item to rest on the highest support below it.
    var gravityChanged = true;
    var gravityIter = 0;
    while (gravityChanged && gravityIter < 20) {
        gravityChanged = false;
        gravityIter++;
        // Sort by Z ascending each iteration so lower items settle first
        placed.sort(function (a, b) { return a.z - b.z; });
        for (var i = 0; i < placed.length; i++) {
            var item = placed[i];
            if (item.z === 0)
                continue; // already on floor
            // Find the highest surface directly below this item
            var supportZ = 0; // floor
            for (var j = 0; j < placed.length; j++) {
                if (j === i)
                    continue;
                var other = placed[j];
                // Must be below our item (its top <= our current bottom)
                var otherTop = other.z + other.h;
                if (otherTop > item.z + 0.5)
                    continue; // not below us (use 0.5mm tolerance)
                // Check X-axis overlap
                var xOverlap = other.x < item.x + item.w - 0.5 && other.x + other.w > item.x + 0.5;
                // Check Y-axis overlap
                var yOverlap = other.y < item.y + item.l - 0.5 && other.y + other.l > item.y + 0.5;
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
    // V6.11: Y-Axis Gravity Compaction — Wall 간 Gap 제거 후처리
    compactItemsAlongY(placed, container);
    var unpackedList = allProducts.map(function (p) { return (__assign(__assign({}, p), { quantity: unpacked.get(p.id) })); }).filter(function (p) { return p.quantity > 0; });
    var vol = placed.reduce(function (s, i) { return s + (i.w * i.l * i.h); }, 0);
    return { container: __assign(__assign({}, container), { id: '40hc' }), items: placed, efficiency: (vol / (container.width * container.length * container.height)) * 100, unpacked: unpackedList };
}
var orientsCache = new Map();
function getOrients(p) {
    var key = "".concat(p.id, "_").concat(p.width, "_").concat(p.length, "_").concat(p.height, "_").concat(p.allow_rotate, "_").concat(p.allow_lay_down);
    var cached = orientsCache.get(key);
    if (cached)
        return cached;
    // V5.01: Safety Shutoff. Prevent infinite loops caused by zero-dimension items (curZ += 0 loops).
    if (p.width < 1 || p.length < 1 || p.height < 1)
        return [];
    var all = [];
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
    var filtered = all.filter(function (o) { return isStableBottom(p, o.w, o.l); });
    // V4.19: Fallback - if everything was filtered out, allow the standard orientation
    var result = filtered;
    if (filtered.length === 0 && all.length > 0) {
        result = [all[0]];
    }
    orientsCache.set(key, result);
    return result;
}
function blockPackShelf(W, H, D, allProducts, unpacked, allowSmall, isMixedWidthSpecialJob) {
    var wallItems = [];
    var currentX = 0;
    while (currentX < W) {
        var rem = allProducts.filter(function (p) { return unpacked.get(p.id) > 0; });
        if (rem.length === 0)
            break;
        var bestBlockScore = -Infinity;
        var bestBlockW = 0;
        var bestBlockItems = [];
        // V4.26 Side Gap Scavenging
        // Pass 0: Try to fit normal products.
        // Pass 1: Also try scavenging to see if small items provide a better local fit.
        for (var _i = 0, _a = [0, 1]; _i < _a.length; _i++) {
            var passIdx = _a[_i];
            // Phase 4/5 (allowSmall=true) already considers everyone, so Pass 1 is redundant.
            if (passIdx === 1 && allowSmall)
                break;
            var _loop_1 = function (p) {
                var isSmall = isSmallProduct(p);
                if (passIdx === 0 && !allowSmall && isSmall)
                    return "continue";
                if (passIdx === 1 && !isSmall)
                    return "continue";
                var orientsList = [];
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
                var orients = orientsList.filter(function (o) { return o.w <= (W - currentX) + 0.5 && o.l <= D + 0.5 && o.h <= H + 0.5 && isStableBottom(p, o.w, o.l); });
                for (var _d = 0, orients_2 = orients; _d < orients_2.length; _d++) {
                    var o = orients_2[_d];
                    for (var bW = 1; bW <= Math.min(5, unpacked.get(p.id)); bW++) {
                        for (var bL = 1; bL <= 5; bL++) {
                            var totalW = o.w * bW;
                            var totalL = o.l * bL;
                            if (totalW > (W - currentX) + 0.5)
                                break;
                            if (totalL > D + 0.5)
                                break;
                            // V5.05: If orientation is 'lay', limit height count to 1 to prevent stacking laid down items
                            var maxHCount = o.type === 'lay' ? 1 : Math.floor((H + 0.5) / o.h);
                            var limitHCount = Math.min(maxHCount, Math.floor(unpacked.get(p.id) / (bW * bL)));
                            if (isLowHeightProduct(p, o.h)) {
                                limitHCount = Math.min(limitHCount, 10);
                            }
                            if (limitHCount === 0)
                                continue;
                            var _loop_2 = function (hCount) {
                                var tempItems = [];
                                for (var bwIdx = 0; bwIdx < bW; bwIdx++) {
                                    for (var blIdx = 0; blIdx < bL; blIdx++) {
                                        for (var phIdx = 0; phIdx < hCount; phIdx++) {
                                            tempItems.push({ product: p, x: currentX + (bwIdx * o.w), yRel: blIdx * o.l, z: phIdx * o.h, w: o.w, l: o.l, h: o.h, orientation: o.type });
                                        }
                                    }
                                }
                                // 3D overlap check between tempItems (current base) and wallItems (previous blocks)
                                var baseOverlap = false;
                                for (var _e = 0, tempItems_3 = tempItems; _e < tempItems_3.length; _e++) {
                                    var item = tempItems_3[_e];
                                    for (var _f = 0, wallItems_2 = wallItems; _f < wallItems_2.length; _f++) {
                                        var other = wallItems_2[_f];
                                        var xOverlap = Math.max(item.x, other.x) < Math.min(item.x + item.w, other.x + other.w) - 0.5;
                                        var yOverlap = Math.max(item.yRel, other.yRel || 0) < Math.min(item.yRel + item.l, (other.yRel || 0) + other.l) - 0.5;
                                        var zOverlap = Math.max(item.z, other.z) < Math.min(item.z + item.h, other.z + other.h) - 0.5;
                                        if (xOverlap && yOverlap && zOverlap) {
                                            baseOverlap = true;
                                            break;
                                        }
                                    }
                                    if (baseOverlap)
                                        break;
                                }
                                if (baseOverlap) {
                                    return "continue";
                                }
                                var curZ = hCount * o.h;
                                var tempU_Col = new Map(unpacked);
                                tempU_Col.set(p.id, tempU_Col.get(p.id) - (hCount * bW * bL));
                                var baseHeight = hCount * o.h;
                                var remainingBaseQty = unpacked.get(p.id) || 0;
                                var hasLargeUnpackedTopper = allProducts.some(function (topP) {
                                    if (!isLowHeightProduct(topP, topP.height))
                                        return false;
                                    var avail = tempU_Col.get(topP.id) || 0;
                                    if (avail < 10)
                                        return false;
                                    var headroom = H - baseHeight;
                                    return headroom >= Number(topP.height) * 10;
                                }) && (remainingBaseQty <= 15);
                                var effectiveAllowSmall = allowSmall || (passIdx === 1);
                                // ROW-BASED TOPPING (V4.12)
                                // V5.02: No stacking on top of laid down (lay) items
                                var zPossible = o.type !== 'lay';
                                while (curZ < H && zPossible) {
                                    zPossible = false;
                                    var bestRowScore = -Infinity;
                                    var bestRowItems = [];
                                    var bestRowH = 0;
                                    for (var _g = 0, allProducts_1 = allProducts; _g < allProducts_1.length; _g++) {
                                        var topP = allProducts_1[_g];
                                        var allowedSmallTopper = effectiveAllowSmall || (o.h >= 500);
                                        if (!allowedSmallTopper && isSmallProduct(topP))
                                            continue;
                                        var avail = tempU_Col.get(topP.id) || 0;
                                        if (avail <= 0)
                                            continue;
                                        var actualOrients = getOrients(topP);
                                        var _loop_3 = function (to) {
                                            if (to.w < 1 || to.l > totalL + 100 || to.w > totalW + 300 || to.h > (H - curZ) + 0.5)
                                                return "continue";
                                            // If we have a large unpacked flat topper, do not block headroom by stacking large items
                                            if (to.h >= 500 && hasLargeUnpackedTopper) {
                                                return "continue";
                                            }
                                            // 아래 제품의 높이(o.h)가 500mm 이하인 경우, 위에 적재할 토퍼의 높이(to.h)가 아래 제품 높이 + 50mm를 초과하면 적재 금지
                                            if (o.h <= 500) {
                                                if (to.h > o.h + 50) {
                                                    return "continue";
                                                }
                                            }
                                            var suppW = Math.min(to.w, totalW);
                                            var suppL = Math.min(to.l, totalL);
                                            if (suppW * suppL < (to.w * to.l * 0.66))
                                                return "continue";
                                            // V5.00 Identical Product Row Sharing & Identity Sorting
                                            var identicalProducts = [{ p: topP, qty: avail }];
                                            var combinedAvail = avail;
                                            for (var _o = 0, allProducts_2 = allProducts; _o < allProducts_2.length; _o++) {
                                                var otherP = allProducts_2[_o];
                                                if (otherP.id === topP.id)
                                                    continue;
                                                var otherAvail = tempU_Col.get(otherP.id) || 0;
                                                if (otherAvail <= 0)
                                                    continue;
                                                // Check if otherP can match the exact dimensions of 'to'
                                                var oo = getOrients(otherP).find(function (x) { return Math.abs(x.w - to.w) < 0.5 && Math.abs(x.l - to.l) < 0.5 && Math.abs(x.h - to.h) < 0.5; });
                                                if (oo) {
                                                    identicalProducts.push({ p: otherP, qty: otherAvail });
                                                    combinedAvail += otherAvail;
                                                }
                                            }
                                            // IDEA 2: Sort to prioritize identical models (topP.id === p.id or otherP.id === p.id)
                                            identicalProducts.sort(function (a, b) {
                                                var aIsBase = a.p.id === p.id;
                                                var bIsBase = b.p.id === p.id;
                                                if (aIsBase && !bIsBase)
                                                    return -1;
                                                if (!aIsBase && bIsBase)
                                                    return 1;
                                                return 0;
                                            });
                                            var isLastBlock = (W - currentX - totalW) <= 50;
                                            var topperWLimit = (isMixedWidthSpecialJob && !isLastBlock) ? 0 : 300;
                                            var maxAllowedW = Math.min(totalW + topperWLimit, W - currentX);
                                            // V5.06: 눕힌 제품(lay)은 Z축 적재가 불가한 대신, 
                                            // 축이 변경되어 XY축 방향으로 제약 없이 확장이 가능하도록 허용합니다.
                                            var actualMaxW = to.type === 'lay' ? (W - currentX) : maxAllowedW;
                                            var fitCountW = Math.floor(actualMaxW / to.w);
                                            // 깊이(Y축)도 동일하게 베이스 블록(totalL)의 제약을 풀고 남은 공간(D) 끝까지 허용합니다.
                                            var actualMaxL = to.type === 'lay' ? D : Math.min(totalL + 100, D);
                                            var fitCountL = Math.floor(actualMaxL / to.l);
                                            var fitCount = fitCountW * fitCountL;
                                            if (fitCount === 0)
                                                return "continue";
                                            var rowCount = Math.min(fitCount, combinedAvail);
                                            var rowItems = [];
                                            var placedCount = 0;
                                            var currentIdx = 0;
                                            var qtyUsed = 0;
                                            for (var riL = 0; riL < fitCountL && placedCount < rowCount; riL++) {
                                                for (var riW = 0; riW < fitCountW && placedCount < rowCount; riW++) {
                                                    var currentItem = identicalProducts[currentIdx];
                                                    var targetX = currentX + (riW * to.w);
                                                    var targetYRel = riL * to.l;
                                                    // 컨테이너 경계 초과 검사
                                                    if (targetX + to.w > W + 0.5 || targetYRel + to.l > D + 0.5) {
                                                        continue;
                                                    }
                                                    // 1. 공중 부양 방지 지탱면 검사
                                                    if (!hasSupportAtZInTemp(targetX, targetYRel, to.w, to.l, curZ, tempItems)) {
                                                        continue;
                                                    }
                                                    // 2. 이 격자 위치에 이 토퍼를 배치할 때 누적 단수가 10단을 넘는지 검사 (모든 제품에 적용)
                                                    var stacked = getStackedCountInTemp(targetX, targetYRel, to.w, to.l, tempItems);
                                                    if (stacked >= 10) {
                                                        continue; // 10단 초과하므로 이 셀에는 배치하지 않고 건너뜀
                                                    }
                                                    // 3. 기존 wallItems와 겹치는지 검사
                                                    var overlap = false;
                                                    for (var _p = 0, wallItems_3 = wallItems; _p < wallItems_3.length; _p++) {
                                                        var other = wallItems_3[_p];
                                                        var xOverlap = Math.max(targetX, other.x) < Math.min(targetX + to.w, other.x + other.w) - 0.5;
                                                        var yOverlap = Math.max(targetYRel, other.yRel || 0) < Math.min(targetYRel + to.l, (other.yRel || 0) + other.l) - 0.5;
                                                        var zOverlap = Math.max(curZ, other.z) < Math.min(curZ + to.h, other.z + other.h) - 0.5;
                                                        if (xOverlap && yOverlap && zOverlap) {
                                                            overlap = true;
                                                            break;
                                                        }
                                                    }
                                                    if (overlap) {
                                                        continue;
                                                    }
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
                                            var potentialW = fitCountW * to.w;
                                            var potentialL = fitCountL * to.l;
                                            var potentialUtil = (potentialW * potentialL) / (totalW * totalL);
                                            var rowVol = rowCount * to.w * to.l * to.h;
                                            var penalty = 0;
                                            if (to.h > o.h) {
                                                penalty = 5000000; // 큰 제품이 작은 제품 위에 올라가는 것에 대한 패널티
                                            }
                                            // V6.16: o.h가 1350mm 이상인 경우, 10단 이상 적재 가능한 제품(isLowHeightProduct)에 가중치 부여
                                            var bonus = 0;
                                            if (curZ >= 1350) {
                                                if (isLowHeightProduct(topP, to.h)) {
                                                    bonus = 100000000000;
                                                }
                                            }
                                            var rowScore = fitCount * 1000000 + rowVol * potentialUtil - penalty + bonus;
                                            if (rowScore > bestRowScore) {
                                                bestRowScore = rowScore;
                                                bestRowItems = rowItems;
                                                bestRowH = to.h;
                                            }
                                        };
                                        for (var _h = 0, actualOrients_1 = actualOrients; _h < actualOrients_1.length; _h++) {
                                            var to = actualOrients_1[_h];
                                            _loop_3(to);
                                        }
                                    }
                                    if (bestRowItems.length > 0) {
                                        tempItems.push.apply(tempItems, bestRowItems);
                                        for (var _j = 0, bestRowItems_3 = bestRowItems; _j < bestRowItems_3.length; _j++) {
                                            var ri = bestRowItems_3[_j];
                                            tempU_Col.set(ri.product.id, tempU_Col.get(ri.product.id) - 1);
                                        }
                                        curZ += bestRowH;
                                        // V5.04: If the stacked item is laid down, stop filling on top of it.
                                        zPossible = bestRowItems[0].orientation !== 'lay';
                                    }
                                }
                                var vol = tempItems.reduce(function (s, it) { return s + (it.w * it.l * it.h); }, 0);
                                // V4.18: Look-ahead - estimate how many more items fit in remaining width
                                var remainW = W - currentX - totalW;
                                var lookAheadVol = 0;
                                var lookAheadW = 0;
                                if (remainW > 50) {
                                    // 현재 블록의 상단(Z > 0) 제품이 우측으로 삐져나온 최대 X 좌표(Overhang) 확인
                                    var topperMaxX = 0;
                                    for (var _k = 0, tempItems_4 = tempItems; _k < tempItems_4.length; _k++) {
                                        var it = tempItems_4[_k];
                                        if (it.z > 0) {
                                            topperMaxX = Math.max(topperMaxX, it.x + it.w);
                                        }
                                    }
                                    var baseMaxX = currentX + totalW;
                                    var baseHeight_1 = tempItems.reduce(function (max, it) { return it.z === 0 ? Math.max(max, it.h) : max; }, 0);
                                    for (var _l = 0, rem_4 = rem; _l < rem_4.length; _l++) {
                                        var rp = rem_4[_l];
                                        var rpAvail = tempU_Col.get(rp.id) || 0;
                                        if (rpAvail <= 0)
                                            continue;
                                        var rpOrients = getOrients(rp).filter(function (ro) { return ro.w <= remainW + 0.5 && ro.l <= D + 0.5 && ro.h <= H + 0.5; });
                                        for (var _m = 0, rpOrients_1 = rpOrients; _m < rpOrients_1.length; _m++) {
                                            var ro = rpOrients_1[_m];
                                            var bwFit = Math.floor((remainW + 0.5) / ro.w);
                                            var lFit = Math.floor(((isMixedWidthSpecialJob ? D : totalL) + 0.5) / ro.l);
                                            // 각 열(Column) 단위로 상단 오버행 침범 여부에 따른 높이 단수(hcFit) 계산
                                            var colHcFitSum = 0;
                                            for (var colIdx = 0; colIdx < bwFit; colIdx++) {
                                                var colStartX = baseMaxX + colIdx * ro.w;
                                                var colEndX = colStartX + ro.w;
                                                // 이 열이 상단 오버행(baseMaxX ~ topperMaxX) 영역과 X축 상에서 겹치는지 체크
                                                var isOverlappedWithOverhang = topperMaxX > baseMaxX && Math.max(colStartX, baseMaxX) < Math.min(colEndX, topperMaxX) - 0.5;
                                                if (isOverlappedWithOverhang) {
                                                    // 겹친다면 이 열의 상단 적재 가능 높이는 하단 베이스 높이(baseHeight)로 제한됨
                                                    colHcFitSum += Math.floor((baseHeight_1 + 0.5) / ro.h);
                                                }
                                                else {
                                                    // 겹치지 않는다면 컨테이너 전체 높이(H)까지 적재 가능
                                                    colHcFitSum += Math.floor((H + 0.5) / ro.h);
                                                }
                                            }
                                            var countFit = Math.min(colHcFitSum * lFit, rpAvail);
                                            var fitVol = countFit * ro.w * ro.l * ro.h;
                                            if (fitVol > lookAheadVol) {
                                                lookAheadVol = fitVol;
                                                lookAheadW = bwFit * ro.w;
                                            }
                                        }
                                    }
                                }
                                var currentRemainW = W - currentX;
                                var widthFillBonus = remainW < 50 ? (totalW / currentRemainW) * 100000 : 0;
                                var volBonus = vol * 0.0000001;
                                var widthFillRatio = (totalW + lookAheadW) / currentRemainW;
                                // V5.02: Penalize 'lay' orientations that leave too much headroom to force them to the top
                                var layPenalty = 1.0;
                                if (o.type === 'lay') {
                                    var wastedH = H - curZ;
                                    // If wasted height is more than 20% of container, penalize heavily
                                    if (wastedH > H * 0.2)
                                        layPenalty = 0.001;
                                    else
                                        layPenalty = 0.8; // Small penalty even if near top
                                }
                                var score = (((vol + lookAheadVol + widthFillBonus) / totalL + totalL + volBonus) * (1 + widthFillRatio * 1.5)) * layPenalty;
                                // V6.12: Add height utilization bonus to encourage vertical stacking
                                var heightUtil = (o.h * hCount) / H;
                                score *= (1 + heightUtil * 1.6);
                                if (o.h >= 500 && hCount === 1 && hasLargeUnpackedTopper) {
                                    score *= 2.0; // Give a 100% score bonus to promote 1-high base
                                }
                                if (o.h * 2 > H) {
                                    score *= 2.5;
                                }
                                if (score > bestBlockScore) {
                                    bestBlockScore = score;
                                    bestBlockItems = tempItems;
                                    bestBlockW = totalW;
                                }
                            };
                            for (var hCount = 1; hCount <= limitHCount; hCount++) {
                                _loop_2(hCount);
                            }
                        }
                    }
                }
            };
            for (var _b = 0, rem_3 = rem; _b < rem_3.length; _b++) {
                var p = rem_3[_b];
                _loop_1(p);
            }
        }
        if (bestBlockItems.length === 0)
            break;
        wallItems.push.apply(wallItems, bestBlockItems);
        for (var _c = 0, bestBlockItems_1 = bestBlockItems; _c < bestBlockItems_1.length; _c++) {
            var bi = bestBlockItems_1[_c];
            unpacked.set(bi.product.id, unpacked.get(bi.product.id) - 1);
        }
        currentX += bestBlockW;
    }
    return wallItems;
}
/**
 * V6.00 Post-Swap Optimizer
 * Try to resolve suboptimal greedy block packing by swapping an unpacked product with a packed product,
 * then trying to place the displaced product in any remaining empty space.
 */
/**
 * V6.12 - Y-Axis Stack Group Compaction (후처리)
 * 적재 완료 후 모든 아이템을 Y=0 방향으로 최대한 밀착시켜 Wall 간 Gap을 제거합니다.
 * 이때 개별 제품이 아닌, 위아래로 쌓여 있는 스택 그룹(Stack Group)을 하나의 단위로 묶어서
 * 함께 밀착 처리함으로써 2층 제품이 1층 제품 뒤로 밀려 공중부양되거나, 서로 다른 층간 충돌로 인해
 * 전체 스택이 가로막혀 갭이 생기는 현상을 해결합니다.
 */
function compactItemsAlongY(items, container) {
    var grouped = new Set();
    var groups = [];
    // Z 좌표가 낮은 베이스 상자부터 처리하기 위해 정렬
    var sortedForGrouping = __spreadArray([], items, true).sort(function (a, b) { return a.z - b.z; });
    for (var _i = 0, sortedForGrouping_1 = sortedForGrouping; _i < sortedForGrouping_1.length; _i++) {
        var item = sortedForGrouping_1[_i];
        if (grouped.has(item))
            continue;
        // 새로운 스택 그룹 구성
        var group = [item];
        grouped.add(item);
        // 해당 스택 그룹의 위에 직접/간접적으로 쌓여 있는 모든 제품(dependents)을 재귀적으로 그룹에 추가
        var added = true;
        while (added) {
            added = false;
            for (var _a = 0, items_1 = items; _a < items_1.length; _a++) {
                var other = items_1[_a];
                if (grouped.has(other))
                    continue;
                // 그룹 내 어떤 멤버 바로 위에(Z축 방향 밀착) 겹치는 형태인지 검사
                for (var _b = 0, group_1 = group; _b < group_1.length; _b++) {
                    var member = group_1[_b];
                    var memberTop = member.z + member.h;
                    if (Math.abs(other.z - memberTop) <= 5) {
                        var xOverlap = Math.max(member.x, other.x) < Math.min(member.x + member.w, other.x + other.w) - 0.5;
                        var yOverlap = Math.max(member.y, other.y) < Math.min(member.y + member.l, other.y + other.l) - 0.5;
                        if (xOverlap && yOverlap) {
                            group.push(other);
                            grouped.add(other);
                            added = true;
                            break;
                        }
                    }
                }
            }
        }
        groups.push(group);
    }
    // 그룹들을 앞쪽 Y 좌표 기준으로 오름차순 정렬하여 앞에서부터 순서대로 당김
    groups.sort(function (gA, gB) {
        var minY_A = Math.min.apply(Math, gA.map(function (it) { return it.y; }));
        var minY_B = Math.min.apply(Math, gB.map(function (it) { return it.y; }));
        return minY_A - minY_B;
    });
    // 그룹 단위의 Y 이동 적합성 검사
    function canShiftGroup(group, dy) {
        var groupSet = new Set(group);
        var others = items.filter(function (it) { return !groupSet.has(it); });
        for (var _i = 0, group_3 = group; _i < group_3.length; _i++) {
            var item = group_3[_i];
            var candidateY = item.y + dy;
            if (candidateY < 0)
                return false;
            // 1. 그룹 외부 상자들과의 Overlap 검사
            for (var _a = 0, others_1 = others; _a < others_1.length; _a++) {
                var other = others_1[_a];
                var xOverlap = Math.max(item.x, other.x) < Math.min(item.x + item.w, other.x + other.w) - 0.5;
                if (!xOverlap)
                    continue;
                var zOverlap = Math.max(item.z, other.z) < Math.min(item.z + item.h, other.z + other.h) - 0.5;
                if (!zOverlap)
                    continue;
                var yOverlap = Math.max(candidateY, other.y) < Math.min(candidateY + item.l, other.y + other.l) - 0.5;
                if (yOverlap)
                    return false;
            }
            // 2. 지탱면 적재 비율 검증 (Z > 0 인 품목들 대상)
            if (item.z > 0) {
                var targetZ = item.z;
                var targetArea = item.w * item.l;
                var supportArea = 0;
                var xMax = item.x + item.w;
                var yMax = candidateY + item.l;
                for (var _b = 0, items_2 = items; _b < items_2.length; _b++) {
                    var other = items_2[_b];
                    var otherTop = other.z + other.h;
                    if (Math.abs(otherTop - targetZ) > 5)
                        continue;
                    // 만약 지탱해 주는 아래 상자도 이 그룹에 포함되어 있다면 같이 Shift된 Y 기준으로 평가
                    var otherY = groupSet.has(other) ? other.y + dy : other.y;
                    if (other.x >= xMax || other.x + other.w <= item.x)
                        continue;
                    if (otherY >= yMax || otherY + other.l <= candidateY)
                        continue;
                    var xOverlap = Math.min(xMax, other.x + other.w) - Math.max(item.x, other.x);
                    var yOverlap = Math.min(yMax, otherY + other.l) - Math.max(candidateY, otherY);
                    supportArea += xOverlap * yOverlap;
                }
                if (supportArea / targetArea < 0.75) {
                    return false;
                }
            }
        }
        return true;
    }
    // 각 그룹을 Y=0 방향으로 가능한 최대한 밀착 이동
    for (var _c = 0, groups_1 = groups; _c < groups_1.length; _c++) {
        var group = groups_1[_c];
        var bestDy = 0;
        var minGroupY = Math.min.apply(Math, group.map(function (it) { return it.y; }));
        for (var dy = -1; dy >= -minGroupY; dy--) {
            if (canShiftGroup(group, dy)) {
                bestDy = dy;
            }
            else {
                break;
            }
        }
        if (bestDy < 0) {
            for (var _d = 0, group_2 = group; _d < group_2.length; _d++) {
                var item = group_2[_d];
                item.y += bestDy;
            }
        }
    }
}
function optimizePackResultWithSwaps(container, result) {
    var items = result.items.map(function (it) { return (__assign({}, it)); });
    var unpacked = result.unpacked.map(function (p) { return (__assign({}, p)); });
    var improved = true;
    var iteration = 0;
    while (improved && iteration < 10) {
        improved = false;
        iteration++;
        // Try to pack any unpacked item by swapping
        for (var uIdx = 0; uIdx < unpacked.length; uIdx++) {
            var uProd = unpacked[uIdx];
            if (uProd.quantity <= 0)
                continue;
            var _loop_4 = function (pIdx) {
                var pItem = items[pIdx];
                if (pItem.product.id === uProd.id)
                    return "continue";
                // 추가: 위에 다른 상자가 쌓여있는 경우 스왑 대상에서 제외 (공중부양 및 적재 붕괴 방지)
                if (hasItemsOnTop(pItem, items))
                    return "continue";
                // 추가: 스몰 제품이 존재할 때, 바닥(z=0)에 깔린 500mm 이상 대형 베이스는 스왑 제외
                var hasSmall = items.some(function (it) { return isLowHeightProduct(it.product, it.h); });
                if (hasSmall && pItem.z === 0 && Number(pItem.product.height) >= 500) {
                    return "continue";
                }
                // 추가: 스몰 상자가 바닥(z=0)에 깔린 기존 상자를 밀어내는 스왑을 원천 차단
                if (isLowHeightProduct(uProd) && pItem.z === 0) {
                    return "continue";
                }
                // 1. Can we place uProd at pItem's position?
                var uOrients = getOrients(uProd);
                var validOrient = null;
                for (var _i = 0, uOrients_1 = uOrients; _i < uOrients_1.length; _i++) {
                    var o = uOrients_1[_i];
                    if (pItem.x + o.w > container.width ||
                        pItem.y + o.l > container.length ||
                        pItem.z + o.h > container.height) {
                        continue;
                    }
                    var overlap = false;
                    for (var k = 0; k < items.length; k++) {
                        if (k === pIdx)
                            continue;
                        var other = items[k];
                        var xOverlap = Math.max(pItem.x, other.x) < Math.min(pItem.x + o.w, other.x + other.w);
                        var yOverlap = Math.max(pItem.y, other.y) < Math.min(pItem.y + o.l, other.y + other.l);
                        var zOverlap = Math.max(pItem.z, other.z) < Math.min(pItem.z + o.h, other.z + other.h);
                        if (xOverlap && yOverlap && zOverlap) {
                            overlap = true;
                            break;
                        }
                    }
                    if (overlap)
                        continue;
                    // 1. 공중 부양 방지 지탱면 검사
                    var otherItems = items.filter(function (_, idx) { return idx !== pIdx; });
                    if (!hasSupportAtZ(pItem.x, pItem.y, o.w, o.l, pItem.z, otherItems)) {
                        continue;
                    }
                    // 2. 10단 누적 제한 체크 (모든 제품에 적용)
                    var stacked = getStackedCount(pItem.x, pItem.y, o.w, o.l, otherItems);
                    if (stacked + 1 > 10)
                        continue;
                    // 3. 아래 제품의 높이가 500mm 이하일 때, 새로 쌓으려는 제품의 높이가 기존 제품 높이 + 50mm를 초과하면 적재 제한
                    if (pItem.z > 0 && !isValidHeightStack(pItem.x, pItem.y, o.w, o.l, otherItems, pItem.z, o.h)) {
                        continue;
                    }
                    // 제약조건 검사: 270mm 이하인 낮은 제품인 경우
                    var isTopperLow = isLowHeightProduct(uProd, o.h);
                    if (isTopperLow) {
                        // 4. 베이스 높이 500 이상 체크 (바로 아래 베이스 기준)
                        if (!hasValidBaseForLowProduct(pItem.x, pItem.y, o.w, o.l, otherItems, pItem.z)) {
                            continue;
                        }
                    }
                    if (pItem.z > 0) {
                        var supportArea = 0;
                        var itemArea = o.w * o.l;
                        for (var k = 0; k < items.length; k++) {
                            if (k === pIdx)
                                continue;
                            var other = items[k];
                            var otherTop = other.z + other.h;
                            if (Math.abs(otherTop - pItem.z) <= 5) {
                                var xOverlap = Math.max(0, Math.min(pItem.x + o.w, other.x + other.w) - Math.max(pItem.x, other.x));
                                var yOverlap = Math.max(0, Math.min(pItem.y + o.l, other.y + other.l) - Math.max(pItem.y, other.y));
                                supportArea += xOverlap * yOverlap;
                            }
                        }
                        if (supportArea / itemArea < 0.66)
                            continue;
                    }
                    validOrient = o;
                    break;
                }
                if (!validOrient)
                    return "continue";
                // 2. Temporarily swap uProd into pItem's position
                var displacedProduct = pItem.product;
                var tempItems = items.filter(function (_, idx) { return idx !== pIdx; });
                var swappedItem = {
                    product: __assign(__assign({}, uProd), { quantity: 1 }),
                    x: pItem.x,
                    y: pItem.y,
                    z: pItem.z,
                    w: validOrient.w,
                    l: validOrient.l,
                    h: validOrient.h,
                    orientation: validOrient.type
                };
                tempItems.push(swappedItem);
                // 3. Try to place the displaced product in any remaining space
                var displacedOrients = getOrients(displacedProduct);
                var placementFound = false;
                var newPlacement = null;
                var xCandidates = Array.from(new Set(__spreadArray(__spreadArray([0], tempItems.map(function (it) { return it.x; }), true), tempItems.map(function (it) { return it.x + it.w; }), true)))
                    .filter(function (x) { return x >= 0 && x < container.width; });
                var yCandidates = Array.from(new Set(__spreadArray(__spreadArray([0], tempItems.map(function (it) { return it.y; }), true), tempItems.map(function (it) { return it.y + it.l; }), true)))
                    .filter(function (y) { return y >= 0 && y < container.length; });
                var zCandidates = Array.from(new Set(__spreadArray([0], tempItems.map(function (it) { return it.z + it.h; }), true)))
                    .filter(function (z) { return z >= 0 && z < container.height; });
                yCandidates.sort(function (a, b) { return a - b; });
                zCandidates.sort(function (a, b) { return a - b; });
                xCandidates.sort(function (a, b) { return a - b; });
                for (var _a = 0, zCandidates_1 = zCandidates; _a < zCandidates_1.length; _a++) {
                    var z = zCandidates_1[_a];
                    for (var _b = 0, yCandidates_1 = yCandidates; _b < yCandidates_1.length; _b++) {
                        var y = yCandidates_1[_b];
                        for (var _c = 0, xCandidates_1 = xCandidates; _c < xCandidates_1.length; _c++) {
                            var x = xCandidates_1[_c];
                            for (var _d = 0, displacedOrients_1 = displacedOrients; _d < displacedOrients_1.length; _d++) {
                                var o = displacedOrients_1[_d];
                                if (x + o.w > container.width ||
                                    y + o.l > container.length ||
                                    z + o.h > container.height) {
                                    continue;
                                }
                                var overlap = false;
                                for (var _e = 0, tempItems_5 = tempItems; _e < tempItems_5.length; _e++) {
                                    var other = tempItems_5[_e];
                                    var xOverlap = Math.max(x, other.x) < Math.min(x + o.w, other.x + other.w);
                                    var yOverlap = Math.max(y, other.y) < Math.min(y + o.l, other.y + other.l);
                                    var zOverlap = Math.max(z, other.z) < Math.min(z + o.h, other.z + other.h);
                                    if (xOverlap && yOverlap && zOverlap) {
                                        overlap = true;
                                        break;
                                    }
                                }
                                if (overlap)
                                    continue;
                                // 1. 공중 부양 방지 지탱면 검사
                                if (!hasSupportAtZ(x, y, o.w, o.l, z, tempItems)) {
                                    continue;
                                }
                                // 2. 10단 누적 제한 체크 (모든 제품에 적용)
                                var stacked = getStackedCount(x, y, o.w, o.l, tempItems);
                                if (stacked + 1 > 10)
                                    continue;
                                // 3. 아래 제품의 높이가 500mm 이하일 때, 새로 쌓으려는 제품의 높이가 기존 제품 높이 + 50mm를 초과하면 적재 제한
                                if (z > 0 && !isValidHeightStack(x, y, o.w, o.l, tempItems, z, o.h)) {
                                    continue;
                                }
                                var isDisplacedLow = isLowHeightProduct(displacedProduct, o.h);
                                if (isDisplacedLow) {
                                    // 4. 베이스 높이 500 이상 체크 (바로 아래 베이스 기준)
                                    if (!hasValidBaseForLowProduct(x, y, o.w, o.l, tempItems, z)) {
                                        continue;
                                    }
                                }
                                if (z > 0) {
                                    var supportArea = 0;
                                    var itemArea = o.w * o.l;
                                    for (var _f = 0, tempItems_6 = tempItems; _f < tempItems_6.length; _f++) {
                                        var other = tempItems_6[_f];
                                        var otherTop = other.z + other.h;
                                        if (Math.abs(otherTop - z) <= 5) {
                                            var xOverlap = Math.max(0, Math.min(x + o.w, other.x + other.w) - Math.max(x, other.x));
                                            var yOverlap = Math.max(0, Math.min(y + o.l, other.y + other.l) - Math.max(y, other.y));
                                            supportArea += xOverlap * yOverlap;
                                        }
                                    }
                                    if (supportArea / itemArea < 0.66)
                                        continue;
                                }
                                newPlacement = {
                                    product: __assign(__assign({}, displacedProduct), { quantity: 1 }),
                                    x: x,
                                    y: y,
                                    z: z,
                                    w: o.w, l: o.l, h: o.h,
                                    orientation: o.type
                                };
                                placementFound = true;
                                break;
                            }
                            if (placementFound)
                                break;
                        }
                        if (placementFound)
                            break;
                    }
                    if (placementFound)
                        break;
                }
                if (placementFound && newPlacement) {
                    var testItems = __spreadArray(__spreadArray([], tempItems, true), [newPlacement], false);
                    var testOverlap = false;
                    for (var ti = 0; ti < testItems.length; ti++) {
                        for (var tj = ti + 1; tj < testItems.length; tj++) {
                            var itemA = testItems[ti];
                            var itemB = testItems[tj];
                            var xOverlap = Math.max(itemA.x, itemB.x) < Math.min(itemA.x + itemA.w, itemB.x + itemB.w) - 0.5;
                            var yOverlap = Math.max(itemA.y, itemB.y) < Math.min(itemA.y + itemA.l, itemB.y + itemB.l) - 0.5;
                            var zOverlap = Math.max(itemA.z, itemB.z) < Math.min(itemA.z + itemA.h, itemB.z + itemB.h) - 0.5;
                            if (xOverlap && yOverlap && zOverlap) {
                                testOverlap = true;
                                break;
                            }
                        }
                        if (testOverlap)
                            break;
                    }
                    if (testOverlap) {
                        return "continue";
                    }
                    items = tempItems;
                    items.push(newPlacement);
                    uProd.quantity--;
                    improved = true;
                    return "break";
                }
            };
            // Try swapping with each packed item
            for (var pIdx = 0; pIdx < items.length; pIdx++) {
                var state_1 = _loop_4(pIdx);
                if (state_1 === "break")
                    break;
            }
            if (improved)
                break;
        }
    }
    var finalUnpacked = unpacked.filter(function (p) { return p.quantity > 0; });
    var vol = items.reduce(function (s, i) { return s + (i.w * i.l * i.h); }, 0);
    var efficiency = (vol / (container.width * container.length * container.height)) * 100;
    return {
        container: container,
        items: items,
        efficiency: efficiency,
        unpacked: finalUnpacked
    };
}

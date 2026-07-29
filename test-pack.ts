import { packContainer } from './src/lib/packer/core';

const p = {
    id: "DFB435FV.APYPEIL",
    name: "DFB435FV.APYPEIL",
    width: 680,
    length: 665,
    height: 935,
    weight: 45,
    max_stack: 3,
    allow_lay_down: true,
    group: "",
    priority: 1,
    quantity: 135,
    allow_rotate: true
};
const c = {
    id: "40hc",
    name: "40ft High Cube",
    width: 2352,
    length: 12032,
    height: 2698,
    max_weight: 26000,
    margin_w: 0,
    margin_l: 0,
    margin_h: 0
};
const result = packContainer(c as any, [p as any], 1, false);
console.log("Total packed:", result.items.length);

let items = result.items || [];
let layCount = 0;
for(let item of items) {
    if(item.orientation === 'lay') layCount++;
}
console.log("Total lay:", layCount);

const yGroups: Record<number, number> = {};
for(let item of items) {
    if(!yGroups[item.y]) yGroups[item.y] = 0;
    yGroups[item.y]++;
}
console.log("Items per Y coordinate:", yGroups);

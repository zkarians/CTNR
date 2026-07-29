import { packContainer } from './src/lib/packer/core';

const p = {
    id: "DFB435FV.APYPEIL",
    name: "DFB435FV.APYPEIL",
    width: 680,
    length: 665,
    height: 935,
    weight: 45,
    max_stack: 3,
    allow_lay_down: false,
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
const result = packContainer(c as any, [p as any], 1, true);
console.log("Total packed:", result.items.length);
// find all lay items
const layItems = result.items.filter(i => i.orientation === 'lay');
console.log("Total lay:", layItems.length);
// print first 10 lay items
for (let i = 0; i < Math.min(10, layItems.length); i++) {
    console.log(layItems[i]);
}

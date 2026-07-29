import { packContainer } from './src/lib/packer/core_temp3';

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
const y0Items = result.items.filter(i => i.y === 0);
console.log("y0 items count:", y0Items.length);
for(let item of y0Items) {
    console.log("x:", item.x, "y:", item.y, "z:", item.z, "w:", item.w, "l:", item.l, "h:", item.h, "orient:", item.orientation);
}

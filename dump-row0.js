"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var core_temp3_1 = require("./src/lib/packer/core_temp3");
var p = {
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
var c = {
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
var result = (0, core_temp3_1.packContainer)(c, [p], 1, false);
var y0Items = result.items.filter(function (i) { return i.y === 0; });
console.log("y0 items count:", y0Items.length);
for (var _i = 0, y0Items_1 = y0Items; _i < y0Items_1.length; _i++) {
    var item = y0Items_1[_i];
    console.log("x:", item.x, "y:", item.y, "z:", item.z, "w:", item.w, "l:", item.l, "h:", item.h, "orient:", item.orientation);
}

import { NextResponse } from 'next/server';
import { packContainer } from '@/lib/packer/core';

export async function GET() {
    const p = {
        id: "DFB335HM.ABMPEIL",
        name: "DFB335HM.ABMPEIL",
        width: 680,
        length: 665,
        height: 935,
        weight: 45,
        max_stack: 3,
        allow_lay_down: true,
        group: "",
        priority: 1
    };

    const c = {
        name: "40ft High Cube",
        width: 2352,
        length: 12032,
        height: 2698,
        max_weight: 26000,
        margin_w: 0,
        margin_l: 0,
        margin_h: 0
    };

    const unpacked = new Map();
    unpacked.set(p.id, 135);

    const result = packContainer(c, [p], 1, false);

    return NextResponse.json({
        packedCount: result.packed.length,
        packed: result.packed
    });
}

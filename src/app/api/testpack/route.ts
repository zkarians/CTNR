import { NextResponse } from 'next/server';
import { packContainer } from '@/lib/packer/core';

export async function GET() {
    const p = {
        id: "DFB335HM.ABMPEIL",
        model_name: "DFB335HM.ABMPEIL",
        width: 680,
        length: 665,
        height: 935,
        quantity: 135,
        allow_rotate: true,
        allow_lay_down: true
    };

    const c = (await import('@/lib/types')).CONTAINER_DATA['40hc'];

    const result = packContainer(c, [p], 1, false);

    return NextResponse.json({
        packedCount: result.items.length,
        packed: result.items
    });
}

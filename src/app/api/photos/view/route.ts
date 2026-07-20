import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const filename = searchParams.get('filename');

        if (!filename) {
            return new NextResponse('Filename is required', { status: 400 });
        }

        // Prevent directory traversal
        const safeFilename = path.basename(filename);
        const filePath = path.join(process.cwd(), 'uploads', safeFilename);

        if (!fs.existsSync(filePath)) {
            return new NextResponse('File not found', { status: 404 });
        }

        const fileBuffer = fs.readFileSync(filePath);
        
        let contentType = 'image/jpeg';
        if (safeFilename.toLowerCase().endsWith('.png')) contentType = 'image/png';
        else if (safeFilename.toLowerCase().endsWith('.webp')) contentType = 'image/webp';
        else if (safeFilename.toLowerCase().endsWith('.gif')) contentType = 'image/gif';

        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });

    } catch (error) {
        console.error('View Photo Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

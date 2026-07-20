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

        // Prevent directory traversal by resolving the path and checking prefix
        const uploadsDir = path.join(process.cwd(), 'uploads');
        const filePath = path.resolve(uploadsDir, filename);

        if (!filePath.startsWith(uploadsDir)) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        if (!fs.existsSync(filePath)) {
            // Fallback: Attempt to fetch from remote server if not present locally
            const remoteHosts = [
                'http://idlezero.iptime.org:4000',
                'http://ungdong.iptime.org:4000',
                'http://ungdong.iptime.org',
                'http://idlezero.iptime.org'
            ];

            let remoteBuffer: Buffer | null = null;
            let fetchedContentType = '';

            const cookieHeader = req.headers.get('cookie') || '';

            for (const host of remoteHosts) {
                try {
                    const remoteUrl = `${host}/api/photos/view?filename=${encodeURIComponent(filename)}`;
                    const res = await fetch(remoteUrl, {
                        headers: {
                            'Cookie': cookieHeader
                        },
                        signal: AbortSignal.timeout(3000) // 3 second timeout per attempt
                    });

                    if (res.ok) {
                        const arrayBuffer = await res.arrayBuffer();
                        remoteBuffer = Buffer.from(arrayBuffer);
                        fetchedContentType = res.headers.get('content-type') || 'image/jpeg';
                        
                        // Cache it locally so subsequent requests are served instantly from disk
                        try {
                            const dir = path.dirname(filePath);
                            if (!fs.existsSync(dir)) {
                                fs.mkdirSync(dir, { recursive: true });
                            }
                            fs.writeFileSync(filePath, remoteBuffer);
                            console.log(`[Cache] Successfully downloaded and cached photo locally at: ${filePath}`);
                        } catch (cacheError) {
                            console.error('Failed to cache remote photo locally:', cacheError);
                        }
                        break;
                    }
                } catch (err) {
                    // Fail silently and try the next host
                }
            }

            if (remoteBuffer) {
                return new NextResponse(remoteBuffer as any, {
                    headers: {
                        'Content-Type': fetchedContentType,
                        'Cache-Control': 'public, max-age=31536000, immutable',
                    },
                });
            }

            return new NextResponse('File not found', { status: 404 });
        }

        const fileBuffer = fs.readFileSync(filePath);
        
        let contentType = 'image/jpeg';
        if (filePath.toLowerCase().endsWith('.png')) contentType = 'image/png';
        else if (filePath.toLowerCase().endsWith('.webp')) contentType = 'image/webp';
        else if (filePath.toLowerCase().endsWith('.gif')) contentType = 'image/gif';

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

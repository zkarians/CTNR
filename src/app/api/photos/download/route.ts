import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { pool } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import * as _archiver from 'archiver';
const archiver = _archiver as any;
import { PassThrough } from 'stream';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Only ADMIN/MANAGER can download bulk zip
        const sessionRole = session.role?.toUpperCase();
        const isAdmin = sessionRole === 'ADMIN' || sessionRole === 'MANAGER';
        if (!isAdmin) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const cntrNosParam = searchParams.get('cntrNos'); // comma-separated container numbers
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const userId = searchParams.get('userId');

        if (!cntrNosParam) {
            return new NextResponse('No containers specified', { status: 400 });
        }

        const cntrNos = cntrNosParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        if (cntrNos.length === 0) {
            return new NextResponse('No containers specified', { status: 400 });
        }

        // 1. Fetch photo paths from the database for the selected containers and filters
        const client = await pool.connect();
        let photos: { cntr_no: string; photo_path: string }[] = [];
        try {
            let query = `
                SELECT cntr_no, photo_path 
                FROM container_photos 
                WHERE cntr_no = ANY($1)
            `;
            const params: any[] = [cntrNos];
            let paramIdx = 2;

            if (startDate) {
                query += ` AND uploaded_at >= $${paramIdx++}`;
                params.push(new Date(startDate + 'T00:00:00.000Z'));
            }
            if (endDate) {
                query += ` AND uploaded_at <= $${paramIdx++}`;
                params.push(new Date(endDate + 'T23:59:59.999Z'));
            }
            if (userId) {
                query += ` AND uploaded_by = $${paramIdx++}`;
                params.push(userId);
            }

            const res = await client.query(query, params);
            photos = res.rows;
        } finally {
            client.release();
        }

        if (photos.length === 0) {
            return new NextResponse('No photos found for selected containers', { status: 404 });
        }

        // 2. Create the archiver and stream the zip content
        const archive = archiver('zip', { zlib: { level: 9 } });
        const passthrough = new PassThrough();
        
        // Pipe the archive output to our Passthrough stream
        archive.pipe(passthrough);

        const uploadsDir = path.join(process.cwd(), 'uploads');

        // Add each file to the archive
        photos.forEach(photo => {
            const relativePath = photo.photo_path; // e.g. "CNTR_123456/filename.jpg"
            const fullPath = path.resolve(uploadsDir, relativePath);

            // Security check: ensure filePath is inside uploads directory
            if (fullPath.startsWith(uploadsDir) && fs.existsSync(fullPath)) {
                // We add it to the zip file using the relative path so that the folder structure is preserved!
                archive.file(fullPath, { name: relativePath });
            }
        });

        // Finalize the archive (this will finish writing to the passthrough stream)
        archive.finalize();

        // Convert the stream into a web ReadableStream so NextResponse can consume it
        const responseStream = new ReadableStream({
            start(controller) {
                passthrough.on('data', chunk => controller.enqueue(chunk));
                passthrough.on('end', () => controller.close());
                passthrough.on('error', err => controller.error(err));
            }
        });

        // Set response headers to force download as a ZIP file
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const filename = `container_photos_${todayStr}.zip`;

        return new NextResponse(responseStream, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'no-cache'
            }
        });

    } catch (error) {
        console.error('Zip Download Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const OAUTH_PATH = path.join(process.cwd(), 'gdrive-oauth-client.json');
const TOKEN_PATH = path.join(process.cwd(), 'gdrive-token.json');
export const GDRIVE_FOLDER_ID = '171usj8jgkHcdSO5YKopw0tJ0yhlwQ86_';

function getOAuth2Client() {
    if (!fs.existsSync(OAUTH_PATH) || !fs.existsSync(TOKEN_PATH)) {
        throw new Error("Google Drive OAuth credentials or token file missing.");
    }
    const rawOauth = fs.readFileSync(OAUTH_PATH, 'utf8');
    const credentials = JSON.parse(rawOauth);
    const clientInfo = credentials.installed || credentials.web;
    const { client_id, client_secret } = clientInfo;

    const oauth2Client = new google.auth.OAuth2(client_id, client_secret);
    const rawToken = fs.readFileSync(TOKEN_PATH, 'utf8');
    const tokens = JSON.parse(rawToken);
    oauth2Client.setCredentials(tokens);

    return oauth2Client;
}

/**
 * Upload a local file to Google Drive folder
 */
export async function uploadToGoogleDrive(
    localFilePath: string,
    fileName: string,
    mimeType: string = 'image/jpeg',
    parentFolderId: string = GDRIVE_FOLDER_ID
): Promise<{ fileId: string; webViewLink?: string; webContentLink?: string; gdriveUrl?: string }> {
    const auth = getOAuth2Client();
    const drive = google.drive({ version: 'v3', auth });

    const fileMetadata: any = {
        name: fileName,
        parents: [parentFolderId],
    };

    const media = {
        mimeType: mimeType,
        body: fs.createReadStream(localFilePath),
    };

    const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink, webContentLink',
    });

    const fileId = response.data.id!;
    const gdriveUrl = `https://lh3.googleusercontent.com/d/${fileId}`;

    return {
        fileId: fileId,
        webViewLink: response.data.webViewLink || undefined,
        webContentLink: response.data.webContentLink || undefined,
        gdriveUrl,
    };
}

/**
 * Search Google Drive for an existing file by name
 */
export async function findGoogleDriveFileByName(
    fileName: string,
    parentFolderId: string = GDRIVE_FOLDER_ID
): Promise<{ fileId: string; gdriveUrl: string } | null> {
    try {
        const auth = getOAuth2Client();
        const drive = google.drive({ version: 'v3', auth });

        const q = `'${parentFolderId}' in parents and name = '${fileName}' and trashed = false`;
        const res = await drive.files.list({
            q,
            fields: 'files(id, name)',
            pageSize: 1
        });

        if (res.data.files && res.data.files.length > 0) {
            const fileId = res.data.files[0].id!;
            return {
                fileId,
                gdriveUrl: `https://lh3.googleusercontent.com/d/${fileId}`
            };
        }
    } catch (e) {
        console.warn(`[GDrive Search Warn] ${fileName}:`, e);
    }
    return null;
}

/**
 * Download a file from Google Drive as a Buffer
 */
export async function downloadFromGoogleDrive(fileId: string): Promise<Buffer> {
    const auth = getOAuth2Client();
    const drive = google.drive({ version: 'v3', auth });

    const response = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' }
    );

    return Buffer.from(response.data as ArrayBuffer);
}

/**
 * Fetch MD5 checksums for a batch of Google Drive file IDs
 * Returns a map of fileId -> md5Checksum
 */
export async function getGoogleDriveMd5Batch(fileIds: string[]): Promise<Record<string, string>> {
    if (!fileIds || fileIds.length === 0) return {};
    
    const auth = getOAuth2Client();
    const drive = google.drive({ version: 'v3', auth });
    
    const md5Map: Record<string, string> = {};
    
    // Chunk fileIds into groups of 30 to avoid overly long query strings or hitting rate limits
    const chunkSize = 30;
    for (let i = 0; i < fileIds.length; i += chunkSize) {
        const chunk = fileIds.slice(i, i + chunkSize);
        
        // Build query: id = 'id1' or id = 'id2' ...
        const q = chunk.map(id => `id = '${id}'`).join(' or ');
        
        try {
            const res = await drive.files.list({
                q,
                fields: 'files(id, md5Checksum)',
                pageSize: chunkSize
            });
            
            if (res.data.files) {
                for (const f of res.data.files) {
                    if (f.id && f.md5Checksum) {
                        md5Map[f.id] = f.md5Checksum;
                    }
                }
            }
        } catch (e) {
            console.error(`[GDrive MD5 Batch Fetch Error] chunk starting at index ${i}:`, e);
        }
    }
    
    return md5Map;
}

/**
 * Rename a file on Google Drive
 */
export async function renameGoogleDriveFile(fileId: string, newName: string): Promise<boolean> {
    try {
        const auth = getOAuth2Client();
        const drive = google.drive({ version: 'v3', auth });
        
        await drive.files.update({
            fileId,
            requestBody: {
                name: newName
            }
        });
        return true;
    } catch (e) {
        console.error(`[GDrive Rename Error] fileId ${fileId}:`, e);
        return false;
    }
}

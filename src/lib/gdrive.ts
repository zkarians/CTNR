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

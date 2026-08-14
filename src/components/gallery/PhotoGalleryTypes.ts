import { SessionUser } from '@/lib/auth';
import { Team } from '@/lib/types';

export interface Photo {
    id: string;
    job_id: number;
    cntr_no: string;
    photo_path: string;
    remark?: string;
    uploaded_at: string;
    uploaded_by?: string;
    uploader_name?: string;
    uploader_username?: string;
    team_id?: number;
    team_name?: string;
    job_name?: string;
    transporter?: string;
    work_duration_minutes?: number;
    is_completed?: boolean;
    completed_at?: string;
    gdrive_file_id?: string;
    gdrive_url?: string;
    photo_type?: string;
    file_created_at?: string;
}

export interface ContainerFolder {
    cntrNo: string;
    jobId: number;
    jobName?: string;
    workDateStr: string;
    photos: Photo[];
    latestUploadTime: string;
    earliestUploadTime: string;
    teamId?: number;
    teamName?: string;
    uploaderName?: string;
    transporter?: string;
    workDurationMinutes?: number;
    isCompleted?: boolean;
    completedAt?: string;
}

export type SortOption = 'NAME_ASC' | 'NAME_DESC' | 'CREATION_ASC' | 'CREATION_DESC' | 'UPLOAD_ASC' | 'UPLOAD_DESC';
export type ViewMode = 'GRID' | 'LARGE';
export type TabState = 'ACTIVE' | 'COMPLETED' | 'TRASH';
export type ActionType = 'LOCAL_COPY' | 'ZIP_DOWNLOAD' | 'GDRIVE_BACKUP';

export interface PhotoGalleryProps {
    isOpen: boolean;
    onClose: () => void;
    user: SessionUser;
    initialSearchCntrNo?: string;
    onOpenReport?: () => void;
}

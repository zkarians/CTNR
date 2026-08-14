import { useState, useEffect, useMemo, useCallback } from 'react';
import { SessionUser } from '@/lib/auth';
import { Team } from '@/lib/types';
import { Photo, ContainerFolder, SortOption, TabState } from './PhotoGalleryTypes';
import { getWorkDateString, getLocalDateString } from '@/lib/utils/dateUtils';
import { fetchTeams } from '@/lib/actions';

export function usePhotoGallery(user: SessionUser, initialSearchCntrNo?: string) {
    const isAdmin = user && (user.role.toUpperCase() === 'ADMIN' || user.role.toUpperCase() === 'MANAGER');

    const [photos, setPhotos] = useState<Photo[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isRotating, setIsRotating] = useState(false);

    // Filter states
    const [tabState, setTabState] = useState<TabState>('ACTIVE');
    const isTrashView = tabState === 'TRASH';
    const isCompletedView = tabState === 'COMPLETED';

    const [selectedTeam, setSelectedTeam] = useState<string>('ALL');
    const [selectedUser, setSelectedUser] = useState<string>('ALL');
    const [searchCntrNo, setSearchCntrNo] = useState<string>(initialSearchCntrNo || '');
    const [dateRange, setDateRange] = useState({
        startDate: '',
        endDate: '',
    });

    // Sort & View State
    const [sortBy, setSortBy] = useState<SortOption>('NAME_ASC');
    const [viewMode, setViewMode] = useState<'GRID' | 'LARGE'>('LARGE');

    // Selection
    const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
    const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
    const [selectedContainerFolder, setSelectedContainerFolder] = useState<string | null>(null);

    // Load initial teams
    useEffect(() => {
        fetchTeams().then(setTeams).catch(console.error);
    }, []);

    // Fetch photos
    const loadPhotos = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (isTrashView) {
                params.set('showTrash', 'true');
            } else if (isCompletedView) {
                params.set('showCompleted', 'true');
            }

            if (searchCntrNo.trim()) {
                params.set('cntrNo', searchCntrNo.trim());
            } else {
                if (dateRange.startDate) params.set('startDate', dateRange.startDate);
                if (dateRange.endDate) params.set('endDate', dateRange.endDate);
                if (selectedTeam !== 'ALL') params.set('teamId', selectedTeam);
                if (selectedUser !== 'ALL') params.set('userId', selectedUser);
            }

            const res = await fetch(`/api/photos?${params.toString()}`);
            if (!res.ok) throw new Error('사진 목록 조회 실패');
            const data = await res.json();
            if (data.success && Array.isArray(data.photos)) {
                setPhotos(data.photos);
            } else {
                setPhotos([]);
            }
        } catch (error) {
            console.error('loadPhotos error:', error);
            setPhotos([]);
        } finally {
            setIsLoading(false);
        }
    }, [isTrashView, isCompletedView, searchCntrNo, dateRange, selectedTeam, selectedUser]);

    useEffect(() => {
        loadPhotos();
    }, [loadPhotos]);

    // Unique uploaders for filter dropdown
    const availableUsers = useMemo(() => {
        const userMap = new Map<string, { id: string; name: string }>();
        photos.forEach(p => {
            if (p.uploaded_by && p.uploader_name) {
                userMap.set(p.uploaded_by, { id: p.uploaded_by, name: p.uploader_name });
            }
        });
        return Array.from(userMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    }, [photos]);

    // Group photos into container folders
    const folders = useMemo(() => {
        const folderMap = new Map<string, ContainerFolder>();

        photos.forEach(photo => {
            const workDateStr = getWorkDateString(new Date(photo.uploaded_at));
            const key = `${photo.cntr_no}|${workDateStr}`;

            if (!folderMap.has(key)) {
                folderMap.set(key, {
                    cntrNo: photo.cntr_no,
                    jobId: photo.job_id,
                    jobName: photo.job_name,
                    workDateStr,
                    photos: [],
                    latestUploadTime: photo.uploaded_at,
                    earliestUploadTime: photo.uploaded_at,
                    teamId: photo.team_id,
                    teamName: photo.team_name,
                    uploaderName: photo.uploader_name,
                    transporter: photo.transporter,
                    workDurationMinutes: photo.work_duration_minutes,
                    isCompleted: photo.is_completed,
                    completedAt: photo.completed_at
                });
            }

            const folder = folderMap.get(key)!;
            folder.photos.push(photo);

            if (new Date(photo.uploaded_at) > new Date(folder.latestUploadTime)) {
                folder.latestUploadTime = photo.uploaded_at;
            }
            if (new Date(photo.uploaded_at) < new Date(folder.earliestUploadTime)) {
                folder.earliestUploadTime = photo.uploaded_at;
            }
        });

        return Array.from(folderMap.values());
    }, [photos]);

    // Sort photos helper
    const sortPhotos = useCallback((photoList: Photo[], sortType: SortOption) => {
        return [...photoList].sort((a, b) => {
            if (sortType === 'NAME_ASC' || sortType === 'NAME_DESC') {
                const nameA = a.photo_path.split('/').pop() || '';
                const nameB = b.photo_path.split('/').pop() || '';
                return sortType === 'NAME_ASC' 
                    ? nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' })
                    : nameB.localeCompare(nameA, undefined, { numeric: true, sensitivity: 'base' });
            }
            if (sortType === 'CREATION_ASC' || sortType === 'CREATION_DESC') {
                const timeA = new Date(a.file_created_at || a.uploaded_at).getTime();
                const timeB = new Date(b.file_created_at || b.uploaded_at).getTime();
                return sortType === 'CREATION_ASC' ? timeA - timeB : timeB - timeA;
            }
            const timeA = new Date(a.uploaded_at).getTime();
            const timeB = new Date(b.uploaded_at).getTime();
            return sortType === 'UPLOAD_ASC' ? timeA - timeB : timeB - timeA;
        });
    }, []);

    // Rotate photos in-place
    const handleRotatePhotos = async (degrees: number, singlePhotoId?: string) => {
        const targetIds = singlePhotoId ? [singlePhotoId] : selectedPhotoIds;
        if (targetIds.length === 0 || isRotating) return;

        setIsRotating(true);
        try {
            const res = await fetch('/api/photos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'rotate',
                    ids: targetIds,
                    degrees
                })
            });
            const data = await res.json();
            if (data.success) {
                const now = Date.now();
                setPhotos(prev => prev.map(p => {
                    if (targetIds.includes(p.id)) {
                        return { ...p, photo_path: p.photo_path.split('?')[0] + '?t=' + now };
                    }
                    return p;
                }));
            } else {
                alert(`회전 실패: ${data.error}`);
            }
        } catch (error) {
            console.error('Rotate photos error:', error);
            alert('사진 회전 중 오류가 발생했습니다.');
        } finally {
            setIsRotating(false);
        }
    };

    return {
        photos,
        setPhotos,
        teams,
        isLoading,
        isRotating,
        tabState,
        setTabState,
        isTrashView,
        isCompletedView,
        selectedTeam,
        setSelectedTeam,
        selectedUser,
        setSelectedUser,
        searchCntrNo,
        setSearchCntrNo,
        dateRange,
        setDateRange,
        sortBy,
        setSortBy,
        viewMode,
        setViewMode,
        selectedPhotoIds,
        setSelectedPhotoIds,
        selectedFolders,
        setSelectedFolders,
        selectedContainerFolder,
        setSelectedContainerFolder,
        availableUsers,
        folders,
        sortPhotos,
        handleRotatePhotos,
        loadPhotos,
        isAdmin
    };
}

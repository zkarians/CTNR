
"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
    Search, Box, Package, Truck, RotateCw, Plus, Trash2,
    Settings2, ChevronLeft, ChevronRight, Filter, Calendar, Briefcase, Move3d, X,
    Camera, Upload, Loader2, Image as ImageIcon,
    Users, UserPlus, Edit3, Shield, KeyRound, Database, UserCheck, UserX,
    FileText, Copy, Download, Check, Clock, Ban, Folder, Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';
import ContainerViewer from '@/components/ContainerViewer';
import LogoutButton from '@/components/LogoutButton';
import FullscreenButton from '@/components/FullscreenButton';
import PhotoGallery from '@/components/PhotoGallery';
import CancelManageModal from '@/components/CancelManageModal';
import AddManualModal from '@/components/AddManualModal';
import ReportModal from '@/components/ReportModal';
import SettingsModal from '@/components/home/SettingsModal';
import UserFormModal from '@/components/home/UserFormModal';
import PhotoUploadModal from '@/components/home/PhotoUploadModal';
import JobCard from '@/components/home/JobCard';

import { getLocalDateString, getWorkDateString } from '@/lib/utils/dateUtils';
import { isSameTeam } from '@/lib/utils/teamUtils';
import { getCarrierColor } from '@/lib/utils/colorUtils';
import { buildReportTextFromData } from '@/lib/utils/reportUtils';
import {
    Product, PackingResult, ContainerType, CONTAINER_DATA, Job, JobFilters, DbConfig, UserAccount, Team, TeamWorkProgress
} from '@/lib/types';
import { packContainer } from '@/lib/packer';
import { fetchTeams, createTeam, updateTeam, deleteTeam } from '@/lib/actions/teamActions';
import { fetchJobs, fetchProductsByJob, searchProducts, deleteContainerResult } from '@/lib/actions/jobActions';
import { fetchTeamWorkProgress, updateContainerWorkDuration, updateContainerAdminComment, resetTeamWorkProgress } from '@/lib/actions/progressActions';
import { getDbConfig, updateDbConfig, updatePassword, fetchAllUsers, createUserAccount, updateUserAccount, deleteUserAccount, deleteMultipleUserAccounts } from '@/lib/actions/userActions';
import { exportDatabaseDump, restoreDatabaseDump, triggerManualBackupAndSync } from '@/lib/actions/syncActions';
import { generateWorkReport, saveDailyWorkReport, getSavedDailyWorkReport, addManualReportEntry, deleteManualReportEntry, updateManualReportEntry } from '@/lib/actions/reportActions';
import { SessionUser } from '@/lib/auth';
import { calculateTeamTimeline } from '@/lib/timeline';


export default function Home({ user }: { user: SessionUser }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    const userRole = (user?.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN' || userRole === 'MANAGER';

    const [selectedContainer, setSelectedContainer] = useState<ContainerType>('40hc');
    const [products, setProducts] = useState<Product[]>([]);
    const [result, setResult] = useState<PackingResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [teamProgressMap, setTeamProgressMap] = useState<Record<string, TeamWorkProgress>>({});
    const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [uploadJob, setUploadJob] = useState<Job | null>(null);
    const [uploadPhotoType, setUploadPhotoType] = useState<'normal' | 'seal'>('normal');
    const [showOnlyWithPhotos, setShowOnlyWithPhotos] = useState(false);
    const [filters, setFilters] = useState<JobFilters>({ startDate: '', endDate: '', productName: '', containerNo: '' });
    const [manualProduct, setManualProduct] = useState({ model_name: '', width: 1000, length: 800, height: 1200, quantity: 10, allow_rotate: true, allow_lay_down: false });
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [numPasses, setNumPasses] = useState(10);
    const [activeProduct, setActiveProduct] = useState<string | null>(null);
    const [isManualAddOpen, setIsManualAddOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [dbConfig, setDbConfig] = useState<DbConfig>({ host: '', database: '', user: '', password: '', port: 5432, trash_retention_days: 15, upload_dir: '' });
    const [passwordData, setPasswordData] = useState({ current: '', new: '', confirm: '' });
    const [isPasswordUpdating, setIsPasswordUpdating] = useState(false);
    const [settingsTab, setSettingsTab] = useState<'db' | 'users' | 'teams' | 'password'>('db');
    const [userList, setUserList] = useState<UserAccount[]>([]);
    const [isUserLoading, setIsUserLoading] = useState(false);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
    // Teams state
    const [teamList, setTeamList] = useState<Team[]>([]);
    const [isTeamLoading, setIsTeamLoading] = useState(false);
    const [newTeamName, setNewTeamName] = useState('');
    const [editingTeam, setEditingTeam] = useState<Team | null>(null);
    const [editingTeamName, setEditingTeamName] = useState('');
    const [userForm, setUserForm] = useState({
        username: '',
        name: '',
        password: '',
        role: 'USER',
        isApproved: true
    });

    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

    const loadUserList = async () => {
        setIsUserLoading(true);
        setSelectedUserIds([]);
        const res = await fetchAllUsers();
        if (res.success && res.users) {
            setUserList(res.users);
        } else if (res.error) {
            alert(res.error);
        }
        setIsUserLoading(false);
    };

    const loadTeamList = async () => {
        setIsTeamLoading(true);
        const data = await fetchTeams();
        setTeamList(data);
        setIsTeamLoading(false);
    };

    const handleCreateTeam = async () => {
        if (!newTeamName.trim()) return;
        setIsTeamLoading(true);
        const res = await createTeam(newTeamName);
        if (res.success) {
            setNewTeamName('');
            await loadTeamList();
        } else {
            alert(res.error || '오류가 발생했습니다.');
        }
        setIsTeamLoading(false);
    };

    const handleUpdateTeam = async () => {
        if (!editingTeam || !editingTeamName.trim()) return;
        setIsTeamLoading(true);
        const res = await updateTeam(editingTeam.id, editingTeamName);
        if (res.success) {
            setEditingTeam(null);
            setEditingTeamName('');
            await loadTeamList();
        } else {
            alert(res.error || '오류가 발생했습니다.');
        }
        setIsTeamLoading(false);
    };

    const handleDeleteTeam = async (id: number, name: string) => {
        if (!confirm(`"${name}" 조를 삭제하시겠습니까? 연결된 사진 기록의 조 정보가 초기화됩니다.`)) return;
        setIsTeamLoading(true);
        const res = await deleteTeam(id);
        if (res.success) {
            await loadTeamList();
        } else {
            alert(res.error || '오류가 발생했습니다.');
        }
        setIsTeamLoading(false);
    };

    const deletableUsers = userList.filter(u => u.id !== user.id);
    const isAllUsersSelected = deletableUsers.length > 0 && deletableUsers.every(u => selectedUserIds.includes(u.id));

    const toggleSelectAllUsers = () => {
        if (isAllUsersSelected) {
            setSelectedUserIds([]);
        } else {
            setSelectedUserIds(deletableUsers.map(u => u.id));
        }
    };

    const toggleSelectUser = (id: string) => {
        if (selectedUserIds.includes(id)) {
            setSelectedUserIds(selectedUserIds.filter(i => i !== id));
        } else {
            setSelectedUserIds([...selectedUserIds, id]);
        }
    };

    const handleDeleteSelectedUsers = async () => {
        if (selectedUserIds.length === 0) return;
        if (!confirm(`선택한 ${selectedUserIds.length}명의 사용자 계정을 정말 삭제하시겠습니까?`)) {
            return;
        }
        setIsUserLoading(true);
        const res = await deleteMultipleUserAccounts(selectedUserIds);
        setIsUserLoading(false);
        if (res.success) {
            alert(`${res.deletedCount || selectedUserIds.length}명의 계정이 성공적으로 삭제되었습니다.`);
            loadUserList();
        } else {
            alert(res.error || "일괄 삭제 중 오류가 발생했습니다.");
        }
    };

    useEffect(() => {
        if (isSettingsOpen && isAdmin && settingsTab === 'users') {
            loadUserList();
        }
        if (isSettingsOpen && isAdmin && settingsTab === 'teams') {
            loadTeamList();
        }
    }, [isSettingsOpen, settingsTab]);

    const handleOpenAddUser = () => {
        setEditingUser(null);
        setUserForm({ username: '', name: '', password: '', role: 'USER', isApproved: true });
        setIsUserModalOpen(true);
    };

    const handleOpenEditUser = (u: UserAccount) => {
        setEditingUser(u);
        setUserForm({
            username: u.username,
            name: u.name,
            password: '',
            role: u.role || 'USER',
            isApproved: u.isApproved
        });
        setIsUserModalOpen(true);
    };

    const handleToggleApproval = async (u: UserAccount) => {
        setIsUserLoading(true);
        const res = await updateUserAccount(u.id, { isApproved: !u.isApproved });
        setIsUserLoading(false);
        if (res.success) {
            loadUserList();
        } else {
            alert(res.error || "상태 변경에 실패했습니다.");
        }
    };

    const handleSaveUser = async () => {
        if (!editingUser) {
            if (!userForm.username || !userForm.name || !userForm.password) {
                alert("아이디, 이름, 비밀번호를 모두 입력해주세요.");
                return;
            }
            setIsUserLoading(true);
            const res = await createUserAccount({
                username: userForm.username,
                name: userForm.name,
                password: userForm.password,
                role: userForm.role,
                isApproved: userForm.isApproved
            });
            setIsUserLoading(false);
            if (res.success) {
                alert("사용자 계정이 등록되었습니다.");
                setIsUserModalOpen(false);
                loadUserList();
            } else {
                alert(res.error || "사용자 등록에 실패했습니다.");
            }
        } else {
            if (!userForm.name) {
                alert("이름을 입력해주세요.");
                return;
            }
            setIsUserLoading(true);
            const res = await updateUserAccount(editingUser.id, {
                name: userForm.name,
                role: userForm.role,
                isApproved: userForm.isApproved,
                password: userForm.password || undefined
            });
            setIsUserLoading(false);
            if (res.success) {
                alert("사용자 정보가 수정되었습니다.");
                setIsUserModalOpen(false);
                loadUserList();
            } else {
                alert(res.error || "사용자 정보 수정에 실패했습니다.");
            }
        }
    };

    const handleDeleteUser = async (u: UserAccount) => {
        if (u.id === user.id) {
            alert("현재 로그인된 본인 계정은 삭제할 수 없습니다.");
            return;
        }
        if (!confirm(`'${u.name}(${u.username})' 사용자 계정을 정말 삭제하시겠습니까?`)) {
            return;
        }
        setIsUserLoading(true);
        const res = await deleteUserAccount(u.id);
        setIsUserLoading(false);
        if (res.success) {
            alert("사용자 계정이 삭제되었습니다.");
            loadUserList();
        } else {
            alert(res.error || "삭제에 실패했습니다.");
        }
    };

    const controlPanelRef = useRef<HTMLDivElement>(null);

    // Photo Upload States
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);
    const [gallerySearchCntrNo, setGallerySearchCntrNo] = useState<string>('');
    const [uploadFiles, setUploadFiles] = useState<File[]>([]);
    const [uploadRemark, setUploadRemark] = useState('');
    const [uploadEmptyBoxes, setUploadEmptyBoxes] = useState<Array<{ name: string; qty: number }>>([]);
    const [uploadCntrNo, setUploadCntrNo] = useState('');
    const [uploadDurationMinutes, setUploadDurationMinutes] = useState<number | ''>('');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgressText, setUploadProgressText] = useState('');

    // Report Modal States
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [reportText, setReportText] = useState('');
    const [reportData, setReportData] = useState<any[]>([]);
    const [isReportGenerating, setIsReportGenerating] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [isImageCopied, setIsImageCopied] = useState(false);
    const [imageCopyModalUrl, setImageCopyModalUrl] = useState<string | null>(null);
    const [reportStartDate, setReportStartDate] = useState('');
    const [reportEndDate, setReportEndDate] = useState('');
    const reportCaptureRef = useRef<HTMLDivElement>(null);
    const [reportViewMode, setReportViewMode] = useState<'full' | 'compact'>('full');
    const [editingCommentCntr, setEditingCommentCntr] = useState<string | null>(null);
    const [commentInput, setCommentInput] = useState<string>('');
    const [isExportingImage, setIsExportingImage] = useState(false);
    
    // Manual Report Entry States & Position-based Timeline Recalculation
    const [isAddManualOpen, setIsAddManualOpen] = useState(false);
    const [isCancelManageOpen, setIsCancelManageOpen] = useState(false);
    const [manualTeamName, setManualTeamName] = useState('1조(BNI)');
    const [manualTransporter, setManualTransporter] = useState('천마');
    const [editingReportItem, setEditingReportItem] = useState<{ teamName: string; cntrIdx: number; dateGroupIdx?: number; cntr?: any } | null>(null);
    const [manualInsertIndex, setManualInsertIndex] = useState<number | 'end'>('end');
    const [manualCntrNo, setManualCntrNo] = useState('');
    const [manualCategory, setManualCategory] = useState('');
    const [manualDuration, setManualDuration] = useState('45');
    const [manualRemark, setManualRemark] = useState('');
    const [manualProducts, setManualProducts] = useState<Array<{ division: string; name: string; qty: number }>>([
        { division: 'DFZ', name: '', qty: 0 }
    ]);
    const [manualEmptyBoxes, setManualEmptyBoxes] = useState<Array<{ name: string; qty: number }>>([
        { name: '', qty: 0 }
    ]);
    const [isManualCancelled, setIsManualCancelled] = useState(false);

    const currentTeamContainers = React.useMemo(() => {
        if (!reportData || reportData.length === 0) return [];
        const targetDateGroup = reportData[0];
        const teamGroup = targetDateGroup?.uploaders?.find((u: any) => isSameTeam(u.teamName, manualTeamName));
        return teamGroup?.containers || [];
    }, [reportData, manualTeamName]);

    const [cancelMode, setCancelMode] = useState<'cancel' | 'exclude'>('cancel');

    const rebuildReportTextFromData = (dataArray: any[]) => buildReportTextFromData(dataArray);

    const handleUpdateReportHeader = (dateStr: string, customCarrierCounts: Record<string, number> | undefined, customRemark: string) => {
        setReportData((prevData: any[]) => {
            const nextData = prevData.map(d => 
                d.dateStr === dateStr 
                    ? { ...d, customCarrierCounts, customRemark } 
                    : d
            );
            setReportText(rebuildReportTextFromData(nextData));
            return nextData;
        });
    };

    const handleToggleCancelCntr = (cntrNo: string, mode?: 'cancel' | 'exclude') => {
        const targetMode = mode || cancelMode;
        let updatedComment: string | null = null;

        setReportData((prevData: any[]) => {
            if (!prevData || prevData.length === 0) return prevData;
            const nextData = JSON.parse(JSON.stringify(prevData));
            
            nextData.forEach((dateGroup: any) => {
                dateGroup.uploaders.forEach((team: any) => {
                    team.containers.forEach((cntr: any) => {
                        if (cntr.cntrNo === cntrNo) {
                            const currentlyCancelled = cntr.isCancelled || cntr.adminComment?.includes('[취소]') || cntr.adminComment?.includes('[작업취소]') || cntr.adminComment?.includes('[작업제외]');
                            if (currentlyCancelled) {
                                cntr.isCancelled = false;
                                const clean = (cntr.adminComment || '').replace(/\[작업취소\]/g, '').replace(/\[작업제외\]/g, '').replace(/\[취소\]/g, '').trim();
                                cntr.adminComment = clean;
                                updatedComment = clean;

                                const catStr = clean ? ` ( ${clean} )` : '';
                                const modelCount = cntr.products ? cntr.products.length : cntr.modelCount || 1;
                                const totalQty = cntr.products ? cntr.products.reduce((s: any, p: any) => s + p.qty, 0) : cntr.totalQty || 0;
                                cntr.modelSummaryStr = `${modelCount}모델, ${totalQty.toLocaleString()}개${catStr}`;
                            } else {
                                cntr.isCancelled = true;
                                const tag = targetMode === 'exclude' ? '[작업제외]' : '[작업취소]';
                                const clean = (cntr.adminComment || '').replace(/\[작업취소\]/g, '').replace(/\[작업제외\]/g, '').replace(/\[취소\]/g, '').trim();
                                const newComment = clean ? `${clean} ${tag}`.trim() : tag;
                                cntr.adminComment = newComment;
                                updatedComment = newComment;

                                const catStr = newComment ? ` ( ${newComment} )` : '';
                                const modelCount = cntr.products ? cntr.products.length : cntr.modelCount || 1;
                                const totalQty = cntr.products ? cntr.products.reduce((s: any, p: any) => s + p.qty, 0) : cntr.totalQty || 0;
                                cntr.modelSummaryStr = `${modelCount}모델, ${totalQty.toLocaleString()}개${catStr}`;
                            }
                        }
                    });
                });
            });

            setReportText(rebuildReportTextFromData(nextData));
            return nextData;
        });

        if (updatedComment !== null) {
            updateContainerAdminComment(cntrNo, updatedComment, reportStartDate).catch(err => console.error("Cancel comment DB save error:", err));
        }
    };

    const handleSetCancelType = (cntrNo: string, targetMode: 'cancel' | 'exclude') => {
        let updatedComment: string | null = null;

        setReportData((prevData: any[]) => {
            if (!prevData || prevData.length === 0) return prevData;
            const nextData = JSON.parse(JSON.stringify(prevData));
            
            nextData.forEach((dateGroup: any) => {
                dateGroup.uploaders.forEach((team: any) => {
                    team.containers.forEach((cntr: any) => {
                        if (cntr.cntrNo === cntrNo) {
                            cntr.isCancelled = true;
                            let comment = cntr.adminComment || '';
                            comment = comment.replace(/\[작업취소\]/g, '').replace(/\[작업제외\]/g, '').replace(/\[취소\]/g, '').trim();
                            const tag = targetMode === 'exclude' ? '[작업제외]' : '[작업취소]';
                            const newComment = comment ? `${comment} ${tag}`.trim() : tag;
                            cntr.adminComment = newComment;
                            updatedComment = newComment;

                            const catStr = newComment ? ` ( ${newComment} )` : '';
                            const modelCount = cntr.products ? cntr.products.length : cntr.modelCount || 1;
                            const totalQty = cntr.products ? cntr.products.reduce((s: any, p: any) => s + p.qty, 0) : cntr.totalQty || 0;
                            cntr.modelSummaryStr = `${modelCount}모델, ${totalQty.toLocaleString()}개${catStr}`;
                        }
                    });
                });
            });

            setReportText(rebuildReportTextFromData(nextData));
            return nextData;
        });

        if (updatedComment !== null) {
            updateContainerAdminComment(cntrNo, updatedComment, reportStartDate).catch(err => console.error("Set cancel type DB save error:", err));
        }
    };

    const handlePasteExcel = (e: React.ClipboardEvent<HTMLDivElement>) => {
        const text = e.clipboardData.getData('Text');
        if (!text) return;

        const rows = text.split(/\r?\n/).filter(row => row.trim() !== '');
        const parsedProducts: { division: string, name: string, qty: number }[] = [];
        
        for (const row of rows) {
            const cols = row.split('\t').map(c => c.trim());
            
            if (cols.length >= 3) {
                const qty = parseInt(cols[2].replace(/,/g, ''), 10) || 0;
                parsedProducts.push({
                    division: cols[0] || 'DFZ',
                    name: cols[1],
                    qty
                });
            } else if (cols.length === 2) {
                const qty = parseInt(cols[1].replace(/,/g, ''), 10) || 0;
                parsedProducts.push({
                    division: 'DFZ',
                    name: cols[0],
                    qty
                });
            }
        }

        if (parsedProducts.length > 0) {
            e.preventDefault();
            const isInitialEmpty = manualProducts.length === 1 && !manualProducts[0].name && !manualProducts[0].qty;
            
            if (isInitialEmpty) {
                setManualProducts(parsedProducts);
            } else {
                setManualProducts([...manualProducts, ...parsedProducts]);
            }
        }
    };

    const handleAddManualSubmit = () => {
        if (!manualCntrNo.trim()) {
            alert("컨테이너 번호를 입력해주세요.");
            return;
        }
        const validProducts = manualProducts.filter(p => p.name.trim() && p.qty > 0);
        if (validProducts.length === 0) {
            alert("최소 1개 이상의 제품 모델명과 수량을 입력해 주세요.");
            return;
        }

        const parsedDuration = parseInt(manualDuration, 10);
        const duration = isNaN(parsedDuration) ? 45 : parsedDuration;
        const totalQty = validProducts.reduce((sum, p) => sum + p.qty, 0);

        const adminCommentStr = isManualCancelled 
            ? (manualCategory.trim() ? `${manualCategory.trim()} [작업취소]` : '[작업취소]')
            : manualCategory.trim();

        let newRawContainer = {
            cntrNo: manualCntrNo.trim().toUpperCase(),
            isCompleted: true,
            isCancelled: isManualCancelled,
            division: validProducts[0]?.division || 'DFZ',
            durationMinutes: duration,
            hasBreak: false,
            modelCount: validProducts.length,
            totalQty: totalQty,
            modelSummaryStr: `${validProducts.length}모델, ${totalQty.toLocaleString()}개${adminCommentStr ? ` ( ${adminCommentStr} )`: ''}`,
            lastRemark: manualRemark.trim() ? `지연사유: ${manualRemark.trim()}` : '',
            transporter: manualTransporter,
            adminComment: adminCommentStr,
            products: validProducts.map(p => ({
                division: p.division.trim() || 'DFZ',
                name: p.name.trim().toUpperCase(),
                qty: p.qty
            })),
            emptyBoxes: manualEmptyBoxes.filter(e => e.name.trim() && e.qty > 0).map(e => ({
                name: e.name.trim().toUpperCase(),
                qty: e.qty
            }))
        };

        let targetFirstUploadedAt: string | undefined = undefined;

        const updateData = (prevData: any[]) => {

            let dateStr = reportStartDate || getLocalDateString(new Date());
            if (!prevData || prevData.length === 0) {
                const timelineList = calculateTeamTimeline<any>([newRawContainer]).map(item => ({
                    ...item,
                    workTimeStr: `${item.durationMinutes}분 (${item.startTimeStr}~${item.endTimeStr}${item.hasBreak ? ' *휴식/식사포함*' : ''})`
                }));
                const newReportData = [{
                    dateStr,
                    uploaders: [{
                        teamName: manualTeamName,
                        containers: timelineList
                    }]
                }];
                setReportText(rebuildReportTextFromData(newReportData));
                return newReportData;
            }

            const nextData = JSON.parse(JSON.stringify(prevData));
            
            let targetDateGroupIdx = 0;
            if (editingReportItem && editingReportItem.dateGroupIdx !== undefined) {
                targetDateGroupIdx = editingReportItem.dateGroupIdx;
            } else if (reportStartDate) {
                const foundIdx = nextData.findIndex((dg: any) => dg.dateStr === reportStartDate);
                if (foundIdx !== -1) targetDateGroupIdx = foundIdx;
            }
            const targetDateGroup = nextData[targetDateGroupIdx];
            let teamGroup = targetDateGroup.uploaders.find((u: any) => isSameTeam(u.teamName, manualTeamName));

            if (!teamGroup) {
                teamGroup = { teamName: manualTeamName, containers: [] };
                targetDateGroup.uploaders.push(teamGroup);
            }

            const existingCntrs = teamGroup.containers || [];
            
            if (editingReportItem) {
                // 1. Remove from old team
                const oldTeamGroup = targetDateGroup.uploaders.find((u: any) => isSameTeam(u.teamName, editingReportItem.teamName));
                let oldCntr = null;
                if (oldTeamGroup && oldTeamGroup.containers) {
                    oldCntr = oldTeamGroup.containers.splice(editingReportItem.cntrIdx, 1)[0];
                    if (!isSameTeam(editingReportItem.teamName, manualTeamName)) {
                        oldTeamGroup.containers = calculateTeamTimeline<any>(oldTeamGroup.containers).map((item: any) => ({
                            ...item,
                            workTimeStr: `${item.durationMinutes}분 (${item.startTimeStr}~${item.endTimeStr}${item.hasBreak ? ' *휴식/식사포함*' : ''})`
                        }));
                    }
                }
                newRawContainer = { ...oldCntr, ...newRawContainer };

                // 2. Determine new position in new team
                let insertIdx = existingCntrs.length;
                if (manualInsertIndex !== 'end' && typeof manualInsertIndex === 'number') {
                    insertIdx = Math.min(Math.max(0, manualInsertIndex), existingCntrs.length);
                }

                // 3. Re-calculate firstUploadedAt if position changed or team changed
                const isSamePosition = isSameTeam(editingReportItem.teamName, manualTeamName) && (insertIdx === editingReportItem.cntrIdx);
                if (!isSamePosition) {
                    if (existingCntrs.length > 0) {
                        if (insertIdx === 0) {
                            const firstTime = existingCntrs[0].firstUploadedAt ? new Date(existingCntrs[0].firstUploadedAt).getTime() : new Date().getTime();
                            targetFirstUploadedAt = new Date(firstTime - 60000).toISOString();
                        } else if (insertIdx >= existingCntrs.length) {
                            const lastTime = existingCntrs[existingCntrs.length - 1].firstUploadedAt ? new Date(existingCntrs[existingCntrs.length - 1].firstUploadedAt).getTime() : new Date().getTime();
                            targetFirstUploadedAt = new Date(lastTime + 60000).toISOString();
                        } else {
                            const prevTime = existingCntrs[insertIdx - 1].firstUploadedAt ? new Date(existingCntrs[insertIdx - 1].firstUploadedAt).getTime() : new Date().getTime();
                            const nextTime = existingCntrs[insertIdx].firstUploadedAt ? new Date(existingCntrs[insertIdx].firstUploadedAt).getTime() : new Date().getTime();
                            targetFirstUploadedAt = new Date((prevTime + nextTime) / 2).toISOString();
                        }
                    } else {
                        targetFirstUploadedAt = new Date().toISOString();
                    }
                    if (targetFirstUploadedAt) {
                        (newRawContainer as any).firstUploadedAt = targetFirstUploadedAt;
                    }
                }

                existingCntrs.splice(insertIdx, 0, newRawContainer);
            } else {
                let insertIdx = existingCntrs.length;
                if (manualInsertIndex !== 'end' && typeof manualInsertIndex === 'number') {
                    insertIdx = Math.min(Math.max(0, manualInsertIndex), existingCntrs.length);
                }
                
                if (existingCntrs.length > 0) {
                    if (insertIdx === 0) {
                        const firstTime = existingCntrs[0].firstUploadedAt ? new Date(existingCntrs[0].firstUploadedAt).getTime() : new Date().getTime();
                        targetFirstUploadedAt = new Date(firstTime - 60000).toISOString();
                    } else if (insertIdx >= existingCntrs.length) {
                        const lastTime = existingCntrs[existingCntrs.length - 1].firstUploadedAt ? new Date(existingCntrs[existingCntrs.length - 1].firstUploadedAt).getTime() : new Date().getTime();
                        targetFirstUploadedAt = new Date(lastTime + 60000).toISOString();
                    } else {
                        const prevTime = existingCntrs[insertIdx - 1].firstUploadedAt ? new Date(existingCntrs[insertIdx - 1].firstUploadedAt).getTime() : new Date().getTime();
                        const nextTime = existingCntrs[insertIdx].firstUploadedAt ? new Date(existingCntrs[insertIdx].firstUploadedAt).getTime() : new Date().getTime();
                        targetFirstUploadedAt = new Date((prevTime + nextTime) / 2).toISOString();
                    }
                } else {
                    targetFirstUploadedAt = new Date().toISOString();
                }
                
                if (targetFirstUploadedAt) {
                    (newRawContainer as any).firstUploadedAt = targetFirstUploadedAt;
                }

                existingCntrs.splice(insertIdx, 0, newRawContainer);
            }

            // Recalculate team timeline for all containers in this team!
            const recalculatedTimeline = calculateTeamTimeline<any>(existingCntrs).map(item => {
                const catStr = item.adminComment ? ` ( ${item.adminComment} )`: '';
                const modelCount = item.products ? item.products.length : item.modelCount || 1;
                const totalQty = item.products ? item.products.reduce((s: number, p: any) => s + p.qty, 0) : item.totalQty || 0;
                return {
                    ...item,
                    modelCount,
                    totalQty,
                    modelSummaryStr: `${modelCount}모델, ${totalQty.toLocaleString()}개${catStr}`,
                    workTimeStr: `${item.durationMinutes}분 (${item.startTimeStr}~${item.endTimeStr}${item.hasBreak ? ' *휴식/식사포함*' : ''})`
                };
            });

            teamGroup.containers = recalculatedTimeline;
            setReportText(rebuildReportTextFromData(nextData));
            return nextData;
        };
        
        const nextReportData = updateData(reportData);
        setReportData(nextReportData);

        setIsAddManualOpen(false);
        setManualCntrNo('');
        setManualCategory('');
        setManualRemark('');
        setManualInsertIndex('end');
        setManualProducts([{ division: 'DFZ', name: '', qty: 0 }]);
        setIsManualCancelled(false);

                if (!editingReportItem) {
            addManualReportEntry({
                workDate: reportStartDate || getLocalDateString(new Date()),
                teamName: manualTeamName,
                cntrNo: manualCntrNo.trim().toUpperCase(),
                category: adminCommentStr,
                durationMinutes: duration,
                remark: manualRemark.trim(),
                products: validProducts,
                emptyBoxes: manualEmptyBoxes.filter(e => e.name.trim() && e.qty > 0),
                firstUploadedAt: targetFirstUploadedAt,
                transporter: manualTransporter
            }).catch(console.error);
        } else if (editingReportItem.cntr && editingReportItem.cntr.manualEntryId) {
            updateManualReportEntry(editingReportItem.cntr.manualEntryId, {
                workDate: reportStartDate || getLocalDateString(new Date()),
                teamName: manualTeamName,
                cntrNo: manualCntrNo.trim().toUpperCase(),
                category: adminCommentStr,
                durationMinutes: duration,
                remark: manualRemark.trim(),
                products: validProducts,
                emptyBoxes: manualEmptyBoxes.filter(e => e.name.trim() && e.qty > 0),
                firstUploadedAt: targetFirstUploadedAt,
                transporter: manualTransporter
            }).catch(console.error);
        }
    };
const handleSaveComment = async (cntrNo: string) => {
        setEditingCommentCntr(null);
        if (!isAdmin) return;
        try {
            await updateContainerAdminComment(cntrNo, commentInput, reportStartDate);
            setReportData((prevData: any[]) =>
                prevData.map((dGroup) => ({
                    ...dGroup,
                    uploaders: dGroup.uploaders.map((uGroup: any) => ({
                        ...uGroup,
                        containers: uGroup.containers.map((cntr: any) =>
                            cntr.cntrNo === cntrNo ? { ...cntr, adminComment: commentInput } : cntr
                        )
                    }))
                }))
            );
        } catch (err) {
            console.error("Save comment error:", err);
        }
    };

    const handleDownloadReportImage = async () => {
        if (!reportCaptureRef.current) return;
        setIsExportingImage(true);
        try {
            const node = reportCaptureRef.current;

            // Temporarily expand all inner scrollable children (team cards & container lists)
            const scrollableChildren = node.querySelectorAll('.overflow-y-auto, [class*="max-h-"], .custom-scrollbar');
            const originalStyles: { el: HTMLElement; maxHeight: string; height: string; overflowY: string }[] = [];
            
            scrollableChildren.forEach((child) => {
                const htmlEl = child as HTMLElement;
                originalStyles.push({
                    el: htmlEl,
                    maxHeight: htmlEl.style.maxHeight,
                    height: htmlEl.style.height,
                    overflowY: htmlEl.style.overflowY
                });
                htmlEl.style.maxHeight = 'none';
                htmlEl.style.height = 'auto';
                htmlEl.style.overflowY = 'visible';
            });

            // Measure full unclipped scroll dimensions
            const finalWidth = Math.max(node.scrollWidth, node.offsetWidth);
            const finalHeight = Math.max(node.scrollHeight, node.offsetHeight);

            const dataUrl = await toPng(node, {
                quality: 0.98,
                pixelRatio: 2,
                width: finalWidth,
                height: finalHeight,
                backgroundColor: '#ffffff',
                style: {
                    maxHeight: 'none',
                    height: `${finalHeight}px`,
                    width: `${finalWidth}px`,
                    overflow: 'visible'
                }
            });

            // Restore original styles
            originalStyles.forEach(({ el, maxHeight, height, overflowY }) => {
                el.style.maxHeight = maxHeight;
                el.style.height = height;
                el.style.overflowY = overflowY;
            });

            const dateStr = reportStartDate || getWorkDateString(new Date());
            const link = document.createElement('a');
            link.download = `작업완료보고서_${dateStr}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error("Download report image error:", err);
            alert("보고서 이미지 저장 중 오류가 발생했습니다.");
        } finally {
            setIsExportingImage(false);
        }
    };

    const handleCopyReportImage = async () => {
        if (!reportCaptureRef.current) return;
        setIsExportingImage(true);
        try {
            const node = reportCaptureRef.current;

            // Temporarily expand all inner scrollable children (team cards & container lists)
            const scrollableChildren = node.querySelectorAll('.overflow-y-auto, [class*="max-h-"], .custom-scrollbar');
            const originalStyles: { el: HTMLElement; maxHeight: string; height: string; overflowY: string }[] = [];
            
            scrollableChildren.forEach((child) => {
                const htmlEl = child as HTMLElement;
                originalStyles.push({
                    el: htmlEl,
                    maxHeight: htmlEl.style.maxHeight,
                    height: htmlEl.style.height,
                    overflowY: htmlEl.style.overflowY
                });
                htmlEl.style.maxHeight = 'none';
                htmlEl.style.height = 'auto';
                htmlEl.style.overflowY = 'visible';
            });

            // Measure full unclipped scroll dimensions
            const finalWidth = Math.max(node.scrollWidth, node.offsetWidth);
            const finalHeight = Math.max(node.scrollHeight, node.offsetHeight);

            const dataUrl = await toPng(node, {
                quality: 0.98,
                pixelRatio: 2,
                width: finalWidth,
                height: finalHeight,
                backgroundColor: '#ffffff',
                style: {
                    maxHeight: 'none',
                    height: `${finalHeight}px`,
                    width: `${finalWidth}px`,
                    overflow: 'visible'
                }
            });

            // Restore original styles
            originalStyles.forEach(({ el, maxHeight, height, overflowY }) => {
                el.style.maxHeight = maxHeight;
                el.style.height = height;
                el.style.overflowY = overflowY;
            });

            const res = await fetch(dataUrl);
            const blob = await res.blob();

            let copied = false;

            // 1. Standard Clipboard API (HTTPS or localhost)
            if (window.isSecureContext && navigator.clipboard && window.ClipboardItem) {
                try {
                    await navigator.clipboard.write([
                        new window.ClipboardItem({
                            [blob.type]: blob
                        })
                    ]);
                    copied = true;
                } catch (clipErr) {
                    console.warn("Clipboard API write failed:", clipErr);
                }
            }

            if (copied) {
                setIsImageCopied(true);
                setTimeout(() => setIsImageCopied(false), 2000);
            } else {
                // HTTP / non-secure context fallback: open dedicated KakaoTalk image copy modal
                setImageCopyModalUrl(dataUrl);
            }
        } catch (err) {
            console.error("Copy report image error:", err);
            alert("보고서 이미지 생성 중 오류가 발생했습니다.");
        } finally {
            setIsExportingImage(false);
        }
    };

    const handleNavigateDate = async (offsetDays: number) => {
        const baseStr = reportStartDate || getWorkDateString(new Date());
        const parts = baseStr.split('-').map(Number);
        const currentDate = new Date(parts[0], parts[1] - 1, parts[2]);
        currentDate.setDate(currentDate.getDate() + offsetDays);
        const newDateStr = getLocalDateString(currentDate);
        
        setReportStartDate(newDateStr);
        setReportEndDate(newDateStr);

        setIsReportGenerating(true);
        try {
            const res = await generateWorkReport({
                ...filters,
                containerNo: '', // Ignore dashboard text search for the full report
                productName: '', // Ignore dashboard text search for the full report
                startDate: newDateStr,
                endDate: newDateStr
            });
            if (res.success && res.reportText) {
                setReportText(res.reportText);
                let data = res.reportData || [];
                if (!isAdmin && user.teamName) {
                    data = data.map((dg: any) => ({
                        ...dg,
                        uploaders: dg.uploaders.filter((u: any) => isSameTeam(u.teamName, user.teamName))
                    })).filter((dg: any) => dg.uploaders.length > 0);
                }
                setReportData(data);
            } else {
                setReportText(res.error || '보고서를 생성할 데이터가 없습니다.');
                setReportData([]);
            }
        } catch (err) {
            console.error("Single date report error:", err);
        } finally {
            setIsReportGenerating(false);
        }
    };

    const handleOpenReportFromGallery = () => {
        setIsGalleryOpen(false);
        handleGenerateReport();
    };

    const handleOpenGalleryFromReport = () => {
        setIsReportOpen(false);
        setIsGalleryOpen(true);
    };

    const handleGenerateReport = async () => {
        const defaultWorkDate = getWorkDateString(new Date());
        const singleDate = filters.startDate || defaultWorkDate;
        
        setReportStartDate(singleDate);
        setReportEndDate(singleDate);

        setIsReportGenerating(true);
        setIsReportOpen(true);
        setIsCopied(false);
        try {
            const res = await generateWorkReport({
                ...filters,
                startDate: singleDate,
                endDate: singleDate
            });
            if (res.success && res.reportText) {
                setReportText(res.reportText);
                let data = res.reportData || [];
                if (!isAdmin && user.teamName) {
                    data = data.map((dg: any) => ({
                        ...dg,
                        uploaders: dg.uploaders.filter((u: any) => isSameTeam(u.teamName, user.teamName))
                    })).filter((dg: any) => dg.uploaders.length > 0);
                }
                setReportData(data);
            } else {
                setReportText(res.error || '보고서를 생성할 데이터가 없습니다.');
                setReportData([]);
            }
        } catch (err) {
            console.error("Report error:", err);
            setReportText('보고서 생성 중 오류가 발생했습니다.');
            setReportData([]);
        } finally {
            setIsReportGenerating(false);
        }
    };

    const handleRegenerateReport = async () => {
        setIsReportGenerating(true);
        setIsCopied(false);
        try {
            const res = await generateWorkReport({
                ...filters,
                containerNo: '', // Ignore dashboard text search for the full report
                productName: '', // Ignore dashboard text search for the full report
                startDate: reportStartDate,
                endDate: reportEndDate
            });
            if (res.success && res.reportText) {
                setReportText(res.reportText);
                let data = res.reportData || [];
                if (!isAdmin && user.teamName) {
                    data = data.map((dg: any) => ({
                        ...dg,
                        uploaders: dg.uploaders.filter((u: any) => isSameTeam(u.teamName, user.teamName))
                    })).filter((dg: any) => dg.uploaders.length > 0);
                }
                setReportData(data);
            } else {
                setReportText(res.error || '보고서를 생성할 데이터가 없습니다.');
                setReportData([]);
            }
        } catch (err) {
            console.error("Report error:", err);
            setReportText('보고서 생성 중 오류가 발생했습니다.');
            setReportData([]);
        } finally {
            setIsReportGenerating(false);
        }
    };

    const [savedReportInfo, setSavedReportInfo] = useState<{ isSaved: boolean; savedAt?: string; savedBy?: string }>({ isSaved: false });
    const [isSavingReport, setIsSavingReport] = useState<boolean>(false);
    const [isLoadingSavedReport, setIsLoadingSavedReport] = useState<boolean>(false);

    const handleSaveReport = async () => {
        if (!reportStartDate || !reportText) return;

        // 기존 저장된 보고서가 있는지 사전 체크
        try {
            const checkRes = await getSavedDailyWorkReport(reportStartDate);
            if (checkRes.success && checkRes.reportText) {
                const confirmChange = window.confirm(`⚠️ ${reportStartDate}일 보고서가 이미 저장되어 있습니다.\n\n새로운 내용으로 변경하시겠습니까?`);
                if (!confirmChange) {
                    return;
                }
            }
        } catch (e) {
            // ignore check error and proceed
        }

        setIsSavingReport(true);
        try {
            const res = await saveDailyWorkReport({
                workDate: reportStartDate,
                reportText,
                reportData,
                savedBy: user?.name || user?.username || '관리자'
            });
            if (res.success) {
                setSavedReportInfo({
                    isSaved: true,
                    savedAt: res.updatedAt ? new Date(res.updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : undefined,
                    savedBy: user?.name || user?.username || '관리자'
                });
                alert(`💾 ${res.message}`);
            } else {
                alert(res.error || "보고서 저장에 실패했습니다.");
            }
        } catch (err: any) {
            console.error("handleSaveReport Error:", err);
            alert("보고서 저장 중 오류가 발생했습니다.");
        } finally {
            setIsSavingReport(false);
        }
    };

    const handleLoadSavedReport = async () => {
        if (!reportStartDate) return;
        setIsLoadingSavedReport(true);
        try {
            const res = await getSavedDailyWorkReport(reportStartDate);
            if (res.success && res.reportText) {
                setReportText(res.reportText);
                if (res.reportData && res.reportData.length > 0) {
                    setReportData(res.reportData);
                }
                setSavedReportInfo({
                    isSaved: true,
                    savedAt: res.updatedAt ? new Date(res.updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : undefined,
                    savedBy: res.savedBy
                });
                alert(`📂 ${reportStartDate} 저장된 보고서를 불러왔습니다.`);
            } else {
                alert(res.error || `${reportStartDate}에 저장된 보고서가 없습니다.`);
            }
        } catch (err: any) {
            console.error("handleLoadSavedReport Error:", err);
            alert("저장된 보고서 불러오기 중 오류가 발생했습니다.");
        } finally {
            setIsLoadingSavedReport(false);
        }
    };

    const [isExportingDb, setIsExportingDb] = useState<boolean>(false);
    const [isRestoringDb, setIsRestoringDb] = useState<boolean>(false);
    const [isTriggeringSync, setIsTriggeringSync] = useState<boolean>(false);
    const restoreFileInputRef = useRef<HTMLInputElement | null>(null);

    const handleExportDbDump = async () => {
        setIsExportingDb(true);
        try {
            const res = await exportDatabaseDump();
            if (res.success && res.dump) {
                const dateStr = getLocalDateString(new Date()).replace(/-/g, '');
                const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
                const filename = `ctnr_db_backup_${dateStr}_${timeStr}.json`;
                const jsonStr = JSON.stringify(res.dump, null, 2);
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                alert(`💾 DB 백업 파일(${filename})이 정상 다운로드되었습니다.`);
            } else {
                alert(res.error || "DB 백업 추출에 실패했습니다.");
            }
        } catch (err: any) {
            console.error("handleExportDbDump Error:", err);
            alert("DB 백업 중 오류가 발생했습니다.");
        } finally {
            setIsExportingDb(false);
        }
    };

    const handleRestoreDbDump = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const confirmRestore = window.confirm(`⚠️ DB 복구 주의사항\n\n업로드한 백업 데이터(${file.name})로 데이터베이스가 복원됩니다.\n\n정말로 DB 복구를 진행하시겠습니까?`);
        if (!confirmRestore) {
            if (restoreFileInputRef.current) restoreFileInputRef.current.value = '';
            return;
        }

        setIsRestoringDb(true);
        try {
            const text = await file.text();
            const dumpData = JSON.parse(text);
            const res = await restoreDatabaseDump(dumpData);
            if (res.success) {
                alert(`🎉 ${res.message}\n화면 새로고침 후 복원된 최신 데이터를 확인합니다.`);
                window.location.reload();
            } else {
                alert(res.error || "DB 복구에 실패했습니다.");
            }
        } catch (err: any) {
            console.error("handleRestoreDbDump Error:", err);
            alert(`DB 백업 파일 구문 해석 및 복구 오류: ${err?.message || '유효한 JSON 파일이 아닙니다.'}`);
        } finally {
            setIsRestoringDb(false);
            if (restoreFileInputRef.current) restoreFileInputRef.current.value = '';
        }
    };


    const handleTriggerManualBackupAndSync = async () => {
        const confirmSync = window.confirm("⚡ [즉시 실행] 지금 바로 로컬 PC DB 백업 파일 생성 및 원격 DB 동기화를 진행하시겠습니까?");
        if (!confirmSync) return;

        setIsTriggeringSync(true);
        try {
            const res = await triggerManualBackupAndSync();
            if (res.success) {
                alert(`🎉 ${res.message}\n\n[1:1 레코드 수량 동기화 확정]\n- container_jobs: ${res.report?.container_jobs?.remote}개\n- container_results: ${res.report?.container_results?.remote}개\n- container_photos: ${res.report?.container_photos?.remote}개`);
            } else {
                alert(res.error || "즉시 동기화 실행 실패!");
            }
        } catch (err: any) {
            console.error("handleTriggerManualBackupAndSync error:", err);
            alert("즉시 동기화 실행 중 오류가 발생했습니다.");
        } finally {
            setIsTriggeringSync(false);
        }
    };

    const handleCopyReport = () => {
        if (!reportText) return;
        
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(reportText).then(() => {
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
            }).catch(() => {
                fallbackCopyText(reportText);
            });
        } else {
            fallbackCopyText(reportText);
        }
    };

    const fallbackCopyText = (text: string) => {
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.top = '0';
            textArea.style.left = '0';
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            if (successful) {
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
            } else {
                alert('텍스트 선택 후 Ctrl+C를 눌러 복사해 주세요.');
            }
        } catch (err) {
            console.error('Fallback copy error:', err);
            alert('복사 중 오류가 발생했습니다.');
        }
    };

    const handleDownloadReport = () => {
        if (!reportText) return;
        const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().split('T')[0];
        a.download = `작업완료보고서_${dateStr}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // V4.22: Auto Real-time Search with Debounce
    useEffect(() => {
        const timer = setTimeout(async () => {
            setIsLoading(true);
            try {
                const data = await fetchJobs(filters);
                setJobs(data);
            } catch (error) {
                console.error("Error loading jobs:", error);
            } finally {
                setIsLoading(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [filters]);

    useEffect(() => {
        const loadDbConfig = async () => {
            const config = await getDbConfig();
            setDbConfig(config);
        };
        loadDbConfig();
    }, []);

    const handleDbSave = async () => {
        setIsLoading(true);
        const res = await updateDbConfig(dbConfig);
        alert(res.message);
        setIsLoading(false);
        if (res.success) {
            setIsSettingsOpen(false);
            const data = await fetchJobs(filters);
            setJobs(data);
        }
    };

    const handlePasswordUpdate = async () => {
        if (!passwordData.current || !passwordData.new || !passwordData.confirm) {
            alert("모든 필드를 입력해주세요.");
            return;
        }
        if (passwordData.new !== passwordData.confirm) {
            alert("새 비밀번호가 일치하지 않습니다.");
            return;
        }
        if (passwordData.new.length < 4) {
            alert("비밀번호는 최소 4자 이상이어야 합니다.");
            return;
        }

        setIsPasswordUpdating(true);
        try {
            const res = await updatePassword(passwordData.current, passwordData.new);
            alert(res.success ? "비밀번호가 성공적으로 변경되었습니다." : res.error);
            if (res.success) {
                setPasswordData({ current: '', new: '', confirm: '' });
            }
        } catch (error) {
            alert("비밀번호 변경 중 오류가 발생했습니다.");
        } finally {
            setIsPasswordUpdating(false);
        }
    };


    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSearch = async (query: string) => {
        setManualProduct(prev => ({ ...prev, model_name: query }));
        if (query.length >= 2) setSearchResults(await searchProducts(query));
        else setSearchResults([]);
    };

    const selectSearchResult = (p: Product) => {
        setManualProduct({ model_name: p.model_name, width: p.width, length: p.length, height: p.height, quantity: 10, allow_rotate: p.allow_rotate, allow_lay_down: p.allow_lay_down });
        setSearchResults([]);
    };

    const handlePassesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const valStr = e.target.value;
        if (valStr === '') {
            setNumPasses('' as any);
            return;
        }
        let val = parseInt(valStr);
        if (isNaN(val)) return;
        if (val > 50) { val = 50; alert("최대 50회까지 입력 가능합니다."); }
        setNumPasses(val);
    };

    const loadTeamProgress = async () => {
        try {
            const progress = await fetchTeamWorkProgress();
            setTeamProgressMap(progress);
        } catch (e) {
            console.error("Error loading team progress:", e);
        }
    };

    const handleResetTeamProgress = async () => {
        if (!confirm("오늘 조별 근무시간/작업 완료 기록을 초기화하시겠습니까?\n\n[확인]을 누르면 오늘 완료 처리된 모든 컨테이너가 '진행 중' 상태로 원복되고 조별 근무시간이 19:00시작 초기 상태로 초기화됩니다.")) {
            return;
        }

        setIsLoading(true);
        try {
            const res = await resetTeamWorkProgress('COMPLETE_RESET');
            if (res.success) {
                alert(res.message || "조별 근무시간이 성공적으로 초기화되었습니다.");
                await loadTeamProgress();
                await refreshJobs();
            } else {
                alert(res.error || "초기화 실패");
            }
        } catch (e: any) {
            console.error("Error resetting team progress:", e);
            alert("조별 근무시간 초기화 중 오류가 발생했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenAddManual = () => {
        setEditingReportItem(null);
        setManualCntrNo('');
        setManualCategory('');
        setManualDuration('45');
        setManualRemark('');
        setManualProducts([{ division: 'DFZ', name: '', qty: 0 }]);
        setManualEmptyBoxes([{ name: '', qty: 0 }]);
        setIsManualCancelled(false);

        if (!isAdmin && !user.teamName) {
            alert("소속 조(팀)가 지정되지 않았습니다. 소속 조를 먼저 선택해 주세요.");
            return;
        }
        if (!isAdmin && user.teamName) {
            const availableTeams = ['1조(BNI)', '2조(천마)', '3조(천마)'];
            const matched = availableTeams.find(t => isSameTeam(t, user.teamName)) || user.teamName;
            setManualTeamName(matched);
        }
        setIsAddManualOpen(true);
    };

    const handleEditReportItem = (teamName: string, cntrIdx: number, cntr: any, dateGroupIdx?: number) => {
        setEditingReportItem({ teamName, cntrIdx, dateGroupIdx, cntr });
        setManualInsertIndex(cntrIdx);
        setManualTeamName(teamName);
        setManualCntrNo(cntr.cntrNo || '');
        
        const adminComment = cntr.adminComment || '';
        const isExcluded = adminComment.includes('[작업제외]');
        const isCancelled = cntr.isCancelled || adminComment.includes('[취소]') || adminComment.includes('[작업취소]');
        setIsManualCancelled(isCancelled);

        let cleanCategory = adminComment.replace(/\[작업취소\]/g, '').replace(/\[작업제외\]/g, '').replace(/\[취소\]/g, '').trim();
        setManualCategory(cleanCategory);

        setManualDuration(String(cntr.durationMinutes || 45));
        
        let remark = cntr.remark || cntr.lastRemark || '';
        if (remark.startsWith('지연사유: ')) {
            remark = remark.substring(6).trim();
        }
        setManualRemark(remark);

        if (cntr.products && cntr.products.length > 0) {
            setManualProducts(cntr.products.map((p: any) => ({
                division: p.division || 'DFZ',
                name: p.name || '',
                qty: p.qty || 0
            })));
        } else {
            setManualProducts([{ division: 'DFZ', name: '', qty: 0 }]);
        }

        if (cntr.emptyBoxes && cntr.emptyBoxes.length > 0) {
            setManualEmptyBoxes(cntr.emptyBoxes.map((e: any) => ({
                name: e.name || '',
                qty: e.qty || 0
            })));
        } else {
            setManualEmptyBoxes([{ name: '', qty: 0 }]);
        }

        setIsAddManualOpen(true);
    };

    const handleDeleteReportItem = (teamName: string, cntrIdx: number, dateGroupIdx?: number) => {
        if (!window.confirm("정말 삭제하시겠습니까?\n(실제 데이터는 삭제되지 않으며 보고서에서만 제외됩니다.)")) return;

        setReportData((prevData: any[]) => {
            if (!prevData || prevData.length === 0) return prevData;
            const nextData = JSON.parse(JSON.stringify(prevData));
            let targetDateGroupIdx = dateGroupIdx !== undefined ? dateGroupIdx : 0;
            const targetDateGroup = nextData[targetDateGroupIdx];
            const teamGroup = targetDateGroup.uploaders.find((u: any) => isSameTeam(u.teamName, teamName));
            
            if (teamGroup && teamGroup.containers) {
                const container = teamGroup.containers[cntrIdx];
                if (container && container.manualEntryId) {
                    deleteManualReportEntry(container.manualEntryId).catch(console.error);
                }
                teamGroup.containers.splice(cntrIdx, 1);
                teamGroup.containers = calculateTeamTimeline<any>(teamGroup.containers).map((item: any) => ({
                    ...item,
                    workTimeStr: `${item.durationMinutes}분 (${item.startTimeStr}~${item.endTimeStr}${item.hasBreak ? ' *휴식/식사포함*' : ''})`
                }));
            }
            
            setReportText(rebuildReportTextFromData(nextData));
            return nextData;
        });
    };

    useEffect(() => {
        loadTeamProgress();
        loadTeamList();
    }, []);

    const refreshJobs = async () => {
        setIsLoading(true);
        try {
            const data = await fetchJobs(filters);
            setJobs(data);
            loadTeamProgress();
        } catch (error) {
            console.error("Error refreshing jobs:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const runSimulation = () => {
        if (products.length === 0) return;
        setIsLoading(true);
        setTimeout(() => {
            const container = CONTAINER_DATA[selectedContainer];
            const res = packContainer(container, products, numPasses);
            setResult(res);
            setIsLoading(false);
            // 모바일: 시뮬레이션 후 컨트롤 패널 최상단으로 스크롤
            setTimeout(() => {
                const mobileScroll = document.getElementById('mobile-scroll-container');
                if (mobileScroll) {
                    mobileScroll.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }, 100);
        }, 100);
    };

    const handleJobSelect = async (jobId: number) => {
        setSelectedJobId(jobId);
        setIsFilterOpen(false);
        setIsLoading(true);
        // Reset results and products immediately for UI responsiveness
        setResult(null);
        setProducts([]);
        setUploadFiles([]);
        setUploadRemark('');

        try {
            const data = await fetchProductsByJob(jobId);
            setProducts(data);
            const job = jobs.find(j => j.id === jobId);
            if (job) {
                setSelectedContainer(job.container_type);
                setUploadCntrNo(job.cntr_no || '');
            }
        } catch (error) {
            console.error("Error selecting job:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenUploadModal = (job: Job, type: 'normal' | 'seal' = 'normal') => {
        setUploadJob(job);
        setUploadCntrNo(job.cntr_no || '');
        setUploadFiles([]);
        setUploadPhotoType(type);
        setUploadDurationMinutes(job.work_duration_minutes ?? '');

        let remark = job.remark || '';
        
        // Initialize empty boxes
        let useWorkerSavedBoxes = false;
        if (job.empty_boxes_updated_at) {
            const lastUpdated = new Date(job.empty_boxes_updated_at).getTime();
            const now = new Date().getTime();
            const hoursDiff = (now - lastUpdated) / (1000 * 60 * 60);
            if (hoursDiff <= 16) {
                useWorkerSavedBoxes = true;
            }
        }

        const parsedBoxes: { name: string, qty: number }[] = [];
        if (useWorkerSavedBoxes && job.empty_boxes) {
            parsedBoxes.push(...job.empty_boxes);
        } else if (job.db_remark) {
            const regex = /(MAY[A-Z0-9]+)\s*(?:\*\s*)?([0-9]+)/gi;
            let match;
            while ((match = regex.exec(job.db_remark)) !== null) {
                parsedBoxes.push({
                    name: match[1].toUpperCase(),
                    qty: parseInt(match[2], 10)
                });
            }
        }
        setUploadEmptyBoxes(parsedBoxes);

        // Clean up any remaining MAY tags in remark if necessary
        let cleanedRemark = remark.replace(/(MAY[A-Z0-9]+)\s*(?:\*\s*)?([0-9]+)(?:\s*장)?/gi, '').trim();
        // Also remove duplicate spaces and trim
        cleanedRemark = cleanedRemark.replace(/\s{2,}/g, ' ').trim();
        setUploadRemark(cleanedRemark);
    };

    const handlePhotoUpload = async () => {
        if (!isAdmin && !user.teamName) {
            if (confirm("사진 및 작업시간을 등록하려면 먼저 소속 조를 선택해야 합니다.\n조 선택 화면으로 이동하시겠습니까?")) {
                window.location.href = "/select-team";
            }
            return;
        }
        const targetJobId = uploadJob?.id || selectedJobId;
        if (!targetJobId) {
            alert("선택된 작업이 없습니다.");
            return;
        }
        if (!uploadCntrNo.trim()) {
            alert("컨테이너 번호를 입력해 주세요.");
            return;
        }

        const emptyBoxText = uploadEmptyBoxes.filter(eb => eb.qty > 0).map(eb => `${eb.name} ${eb.qty}장`).join(' ');
        const finalRemark = (uploadRemark.trim() + (emptyBoxText ? ' ' + emptyBoxText : '')).trim();

        if (uploadFiles.length === 0) {
            if (uploadJob && uploadJob.photo_count && uploadJob.photo_count > 0) {
                setIsUploading(true);
                try {
                    const finalDuration = uploadDurationMinutes === '' ? 45 : Number(uploadDurationMinutes);
                    const res = await updateContainerWorkDuration(targetJobId, uploadCntrNo.trim(), finalDuration, finalRemark, uploadEmptyBoxes);
                    if (res.success) {
                        alert("작업시간 및 지연사유가 수정되었습니다.");
                        setUploadFiles([]);
                        setUploadRemark('');
                        setUploadJob(null);
                        refreshJobs();
                        loadTeamProgress();
                    } else {
                        alert(res.error || "수정 중 오류가 발생했습니다.");
                    }
                } catch (e) {
                    console.error("Update duration error:", e);
                    alert("작업시간 수정 중 오류가 발생했습니다.");
                } finally {
                    setIsUploading(false);
                }
                return;
            } else {
                alert("업로드할 사진을 선택해 주세요.");
                return;
            }
        }

        setIsUploading(true);
        let successCount = 0;
        const duplicatesUploaded: { id: string; name: string }[] = [];
        try {
            for (let i = 0; i < uploadFiles.length; i++) {
                const file = uploadFiles[i];
                setUploadProgressText(`업로드 중... (${i + 1}/${uploadFiles.length})`);
                
                const formData = new FormData();
                formData.append('file', file);
                formData.append('lastModified', file.lastModified.toString());
                formData.append('jobId', targetJobId.toString());
                formData.append('cntrNo', uploadCntrNo.trim());
                formData.append('remark', finalRemark);
                formData.append('emptyBoxes', JSON.stringify(uploadEmptyBoxes));
                formData.append('durationMinutes', (uploadDurationMinutes === '' ? 45 : uploadDurationMinutes).toString());
                formData.append('photoType', uploadPhotoType);

                const res = await fetch('/api/photos', {
                    method: 'POST',
                    body: formData,
                });

                const data = await res.json();
                if (data.success) {
                    successCount++;
                    if (data.isDuplicate && data.photo) {
                        duplicatesUploaded.push({ id: data.photo.id, name: file.name });
                    }
                } else {
                    console.error(`Failed to upload file ${file.name}:`, data.error);
                    alert(`사진 업로드 실패 (${file.name}): ${data.error || '알 수 없는 오류가 발생했습니다.'}`);
                }
            }

            if (duplicatesUploaded.length > 0) {
                const dupNames = duplicatesUploaded.map(d => d.name).join('\n');
                if (confirm(`⚠️ 업로드된 사진 중 완전히 일치하는 중복 사진이 ${duplicatesUploaded.length}장 존재합니다:\n\n${dupNames}\n\n이 중복 사진들을 휴지통으로 이동(삭제)하시겠습니까?`)) {
                    for (const dup of duplicatesUploaded) {
                        try {
                            await fetch(`/api/photos?id=${dup.id}`, { method: 'DELETE' });
                        } catch (e) {
                            console.error("Failed to delete duplicate upload:", e);
                        }
                    }
                    alert("중복 사진이 휴지통으로 이동되었습니다.");
                }
            } else {
                alert(`성공적으로 ${successCount}장의 사진을 업로드했습니다.`);
            }

            setUploadFiles([]);
            setUploadRemark('');
            setUploadJob(null);
            setUploadPhotoType('normal');
            refreshJobs();
        } catch (error) {
            console.error("Upload error:", error);
            alert("사진 업로드 중 오류가 발생했습니다.");
        } finally {
            setIsUploading(false);
            setUploadProgressText('');
        }
    };

    const addManualProduct = () => {
        const newProd: Product = {
            id: `manual_${Date.now()}`,
            model_name: manualProduct.model_name,
            width: manualProduct.width, length: manualProduct.length,
            height: manualProduct.height, quantity: manualProduct.quantity,
            allow_rotate: manualProduct.allow_rotate, allow_lay_down: manualProduct.allow_lay_down
        };
        setProducts(prev => [...prev, newProd]);
        setResult(null);
    };

    const toggleProductFlag = (id: string, field: 'allow_rotate' | 'allow_lay_down') => {
        setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: !p[field] } : p));
        setResult(null);
    };

    const removeProduct = async (id: string) => {
        if (isAdmin && !id.startsWith('manual_')) {
            if (window.confirm("이 제품을 데이터베이스에서 영구적으로 삭제하시겠습니까?\n[확인]을 누르면 DB에서 삭제되며, [취소]를 누르면 현재 화면에서만 임시로 제외됩니다.")) {
                try {
                    const jobId = selectedJobId;
                    if (!jobId) {
                        alert("작업을 먼저 선택해주세요.");
                        return;
                    }
                    const res = await deleteContainerResult(String(jobId), id);
                    if (!res.success) {
                        alert(res.error || "DB 삭제에 실패했습니다.");
                        return; // DB 삭제 실패 시 UI에서도 지우지 않음 (또는 지워도 되지만 일관성을 위해 리턴)
                    }
                } catch (e: any) {
                    console.error("delete product error:", e);
                    alert("DB 삭제 중 오류가 발생했습니다. 상세: " + (e.message || String(e)));
                    return;
                }
            }
        }
        
        setProducts(prev => prev.filter(p => p.id !== id));
        setResult(null);
    };


    // ────────────────────────────────
    // 공통 컨트롤 패널 JSX (데스크탑 aside + 모바일 section 공용)
    // ────────────────────────────────
    const controlPanel = (
        <>
            {/* Header - Desktop Only (Single Integrated Container, Ultra-Tight) */}
            <div className="hidden md:flex flex-col gap-1 shrink-0 pb-1">
                {/* Top Row: Logo & User info */}
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-1.5">
                        <Package className="w-5 h-5 text-sky-500 shrink-0" />
                        <h1 className="text-base font-black tracking-tight uppercase">
                            CTNR <span className="text-sky-500">Optimizer</span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-1">
                        {user.teamName && (
                            <a
                                href="/select-team"
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-black hover:bg-emerald-500/20 transition-all mr-0.5 whitespace-nowrap shrink-0"
                                title="조 변경"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                                <span className="whitespace-nowrap">{user.teamName}</span>
                            </a>
                        )}
                        <button onClick={() => setIsGalleryOpen(true)} className="p-1 hover:bg-white/5 rounded-full text-slate-400 hover:text-sky-400 transition-all" title="사진 보관함">
                            <ImageIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => setIsSettingsOpen(true)} className="p-1 hover:bg-white/5 rounded-full text-slate-400 hover:text-sky-400 transition-all" title="설정">
                            <Settings2 className="w-4 h-4" />
                        </button>
                        <LogoutButton username={user.username} name={user.name} role={user.role} />
                    </div>
                </div>

                {/* Bottom Row: Team Work Completion Progress Bar (Directly Attached) */}
                <div>
                    {(() => {
                        const allTeamNames = Array.from(new Set([
                            ...teamList.map(t => t.name),
                            ...Object.keys(teamProgressMap).filter(name => name !== '미지정 조')
                        ])).sort();

                        if (isAdmin) {
                            return (
                                <div className="w-full bg-[#111625] border border-sky-500/30 rounded-lg px-2.5 py-1 flex items-center justify-between gap-2 shadow-sm text-xs">
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <Clock className="w-3.5 h-3.5 text-sky-400 animate-pulse shrink-0" />
                                        <span className="font-black text-slate-200 text-[11px]">전체 조 작업시간</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full">
                                        {allTeamNames.length > 0 ? (
                                            allTeamNames.map(tName => {
                                                const prog = teamProgressMap[tName];
                                                return (
                                                    <div key={tName} className="flex items-center gap-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap">
                                                        <span className="font-bold text-slate-300">{tName}:</span>
                                                        {prog ? (
                                                            <span className="font-black text-emerald-400">~{prog.endTimeStr} ({prog.completedCount}대)</span>
                                                        ) : (
                                                            <span className="text-slate-500">19:00시작</span>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <span className="text-[10px] text-slate-500">등록된 조 없음</span>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        const myTeamProgress = user.teamName ? (teamProgressMap[user.teamName] || Object.values(teamProgressMap).find((tp: any) => isSameTeam(tp.teamName, user.teamName))) : null;
                        return (
                            <div className="w-full bg-[#111625] border border-sky-500/30 rounded-lg px-2.5 py-1 flex items-center justify-between text-xs shadow-sm">
                                <div className="flex items-center gap-1.5 min-w-0 pr-2">
                                    <Clock className="w-3.5 h-3.5 text-sky-400 animate-pulse shrink-0" />
                                    <span className="font-black text-slate-200 text-[11px] truncate">
                                        {user.teamName ? `${user.teamName} 완료 현황` : '소속 조 미지정'}
                                    </span>
                                    {!user.teamName && (
                                        <a href="/select-team" className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold shrink-0 hover:bg-amber-500/30">
                                            조 선택
                                        </a>
                                    )}
                                </div>
                                {myTeamProgress ? (
                                    <div className="flex items-center gap-1.5 text-[11px] font-black shrink-0">
                                        <span className="text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-md border border-emerald-500/30">
                                            ~ {myTeamProgress.endTimeStr} 완료
                                        </span>
                                        <span className="text-slate-400 text-[10px] font-bold">
                                            ({myTeamProgress.completedCount}대/{myTeamProgress.totalDurationMinutes}분)
                                        </span>
                                    </div>
                                ) : (
                                    <span className="text-[10px] text-slate-500 font-medium shrink-0">
                                        19:00 shift 시작 (완료건 없음)
                                    </span>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Job Selection */}
            <section className="space-y-4 shrink-0">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2 text-[13px] md:text-xs font-bold text-slate-500 uppercase tracking-widest">
                        <Briefcase className="w-4 h-4 md:w-3.5 md:h-3.5" />
                        작업 데이터 조회
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button 
                            onClick={handleGenerateReport} 
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-white text-xs md:text-[11px] font-black transition-all cursor-pointer shadow-sm"
                            title={isAdmin ? "작업 완료 보고서 생성" : `${user.teamName || '소속 조'} 작업내역 조회`}
                        >
                            <FileText className="w-3.5 h-3.5" />
                            {isAdmin ? "보고서 생성" : "작업내역"}
                        </button>

                        <button onClick={refreshJobs} className={`p-1.5 hover:bg-white/5 rounded-lg text-slate-400 transition-all ${isLoading ? "animate-spin text-sky-500" : ""}`} title="새로고침">
                            <RotateCw className="w-4 h-4 md:w-3.5 md:h-3.5" />
                        </button>
                        {isAdmin && (
                            <>
                                <button 
                                    onClick={() => setShowOnlyWithPhotos(!showOnlyWithPhotos)} 
                                    className={`p-1.5 hover:bg-white/5 rounded-lg transition-colors ${showOnlyWithPhotos ? "text-sky-500 bg-sky-500/10" : "text-slate-400"}`} 
                                    title={showOnlyWithPhotos ? "전체 작업 보기" : "사진 등록된 작업만 보기"}
                                >
                                    <Camera className="w-4 h-4 md:w-3.5 md:h-3.5" />
                                </button>
                                <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 transition-colors">
                                    <Filter className={`w-5 h-5 md:w-4 md:h-4 ${isFilterOpen ? "text-sky-500" : ""}`} />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {isAdmin ? (
                    <>
                        <AnimatePresence>
                            {isFilterOpen && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                    <div className="space-y-4 pb-1">
                                        <div className="space-y-3">
                                            <div className="relative group/search">
                                                <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                                <input placeholder="컨테이너 번호 검색..." name="containerNo" value={filters.containerNo} onChange={handleFilterChange}
                                                    className="w-full bg-[#11111a] border border-white/5 rounded-2xl py-3.5 md:py-2.5 pl-10 pr-10 text-sm md:text-xs focus:ring-1 focus:ring-sky-500 outline-none transition-all placeholder:text-slate-600" />
                                                {filters.containerNo && (
                                                    <button 
                                                        onClick={() => setFilters(prev => ({ ...prev, containerNo: '' }))}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full text-slate-500 hover:text-sky-400 transition-all"
                                                    >
                                                        <X className="w-4 h-4 md:w-3.5 md:h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="space-y-2 overflow-y-auto max-h-[220px] md:max-h-[160px] custom-scrollbar pr-1 pb-2">
                            {(() => {
                                const filteredJobs = showOnlyWithPhotos 
                                    ? jobs.filter(job => job.photo_count && job.photo_count > 0)
                                    : jobs;
                                
                                return filteredJobs.length === 0 && !isLoading ? (
                                    <div className="flex flex-col items-center justify-center p-8 md:p-6 bg-white/5 border border-white/5 rounded-3xl opacity-40">
                                        <Search className="w-6 h-6 mb-2" />
                                        <p className="text-xs md:text-[10px] font-medium italic">조회 결과가 없습니다.</p>
                                    </div>
                                ) : (
                                    filteredJobs.map((job, idx) => (
                                        <JobCard
                                            key={`${job.id}_${idx}`}
                                            job={job}
                                            isSelected={selectedJobId === job.id}
                                            onSelect={handleJobSelect}
                                            onOpenGallery={(cntrNo) => {
                                                setGallerySearchCntrNo(cntrNo);
                                                setIsGalleryOpen(true);
                                            }}
                                            onOpenUploadModal={handleOpenUploadModal}
                                        />
                                    ))
                                );
                            })()}
                        </div>
                    </>
                ) : (
                    <div className="space-y-2.5">
                        {/* 1. 컨테이너 번호 조회 박스 (검색 및 신규 등록) */}
                        <div className="bg-[#11111a] border border-white/10 rounded-xl p-2.5 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-black text-slate-300">
                                    <Truck className="w-4 h-4 text-sky-400" />
                                    <span>컨테이너조회</span>
                                </div>
                                <span className="text-[10px] text-slate-500 font-bold">신규 작업 시 번호 검색</span>
                            </div>

                            <div className="relative group/search">
                                <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input 
                                    placeholder="컨테이너 번호 검색 (예: TGHU...)" 
                                    name="containerNo" 
                                    value={filters.containerNo} 
                                    onChange={handleFilterChange}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl py-1.5 pl-10 pr-10 text-xs focus:ring-1 focus:ring-sky-500 outline-none transition-all placeholder:text-slate-600 text-white font-bold" 
                                />
                                {filters.containerNo && (
                                    <button 
                                        onClick={() => setFilters(prev => ({ ...prev, containerNo: '' }))}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full text-slate-500 hover:text-sky-400 transition-all"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* 검색 결과 표시 */}
                            {filters.containerNo.trim() !== '' && (
                                <div className="space-y-2 pt-1 border-t border-white/5 max-h-[140px] overflow-y-auto custom-scrollbar">
                                    {(() => {
                                        const searchResults = jobs.filter(j => 
                                            j.cntr_no && j.cntr_no.toLowerCase().includes(filters.containerNo.trim().toLowerCase())
                                        );

                                        return searchResults.length === 0 ? (
                                            <div className="p-3 text-center text-xs font-bold text-slate-500">
                                                일치하는 컨테이너 번호가 없습니다.
                                            </div>
                                        ) : (
                                            searchResults.map((job, idx) => (
                                                <div key={idx} onClick={() => handleJobSelect(job.id)}
                                                    className={`w-full px-3 py-2 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                                                        selectedJobId === job.id ? "bg-sky-500/10 border-sky-500" : "bg-black/20 border-white/5 hover:border-white/10"
                                                    }`}
                                                >
                                                    <div className={`text-xs font-black truncate uppercase ${getCarrierColor(job.transporter)}`}>
                                                        {job.cntr_no}
                                                        <span className="ml-1.5 text-[10px] text-slate-500 font-normal">
                                                            [{job.transporter?.split('(')[0] || '미정'}]
                                                            {(job.model_count && job.total_qty) ? ` (${job.model_count}모델 / ${job.total_qty}개)` : ''}
                                                        </span>
                                                    </div>
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (!user.teamName) {
                                                                if (confirm("사진 및 작업시간을 등록하려면 먼저 소속 조를 선택해야 합니다.\n조 선택 화면으로 이동하시겠습니까?")) {
                                                                    window.location.href = "/select-team";
                                                                }
                                                                return;
                                                            }
                                                            handleOpenUploadModal(job, 'normal');
                                                        }}
                                                        className="p-1 hover:bg-white/10 rounded-lg text-sky-400 hover:text-white transition-all cursor-pointer"
                                                        title="사진 등록"
                                                    >
                                                        <Camera className="w-4 h-4 md:w-3.5 md:h-3.5" />
                                                    </button>
                                                </div>
                                            ))
                                        );
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* 2. 본인 진행 중인 작업 리스트 박스 (독립 영역) */}
                        <div className="bg-[#11111a] border border-white/10 rounded-xl p-2.5 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-black text-sky-400">
                                    <FileText className="w-4 h-4 text-sky-400" />
                                    <span>작업완료리스트</span>
                                </div>
                                {(() => {
                                    const isMyActiveJob = (job: Job) => {
                                        if (!job.uploaders || job.uploaders.length === 0 || !user) return false;
                                        const isUploadedByMe = job.uploaders.some(u => u === user.username || u === user.name || u === user.id);
                                        const hasActivePhotos = job.active_photo_count !== undefined ? job.active_photo_count > 0 : (job.photo_count || 0) > 0;
                                        return isUploadedByMe && hasActivePhotos;
                                    };
                                    const myActiveJobsCount = jobs.filter(isMyActiveJob).length;
                                    return <span className="text-[10px] font-bold text-slate-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">총 {myActiveJobsCount}건</span>;
                                })()}
                            </div>

                            <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                                {(() => {
                                    const isMyActiveJob = (job: Job) => {
                                        if (!job.uploaders || job.uploaders.length === 0 || !user) return false;
                                        const isUploadedByMe = job.uploaders.some(u => u === user.username || u === user.name || u === user.id);
                                        const hasActivePhotos = job.active_photo_count !== undefined ? job.active_photo_count > 0 : (job.photo_count || 0) > 0;
                                        return isUploadedByMe && hasActivePhotos;
                                    };
                                    const myActiveJobs = jobs.filter(isMyActiveJob);

                                    return myActiveJobs.length === 0 ? (
                                        <div className="p-5 text-center bg-black/20 rounded-xl border border-white/5 space-y-1">
                                            <p className="text-xs font-bold text-slate-400">현재 작업 진행 중인 컨테이너가 없습니다.</p>
                                            <p className="text-[10px] text-slate-500">위 조회 박스에서 컨테이너 번호를 검색하여 사진을 등록해 보세요.</p>
                                        </div>
                                    ) : (
                                        myActiveJobs.map((job, idx) => (
                                            <div key={idx} onClick={() => handleJobSelect(job.id)}
                                                className={`w-full px-3 py-2.5 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                                                    selectedJobId === job.id ? "bg-sky-500/10 border-sky-500" : "bg-black/20 border-white/5 hover:border-white/10"
                                                }`}
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className={`text-xs font-black truncate uppercase ${getCarrierColor(job.transporter)}`}>
                                                        {job.cntr_no}
                                                        <span className="ml-1.5 text-[10px] text-slate-500 font-normal">
                                                            [{job.transporter?.split('(')[0] || '미정'}]
                                                            {(job.model_count && job.total_qty) ? ` (${job.model_count}모델 / ${job.total_qty}개)` : ''}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                                    <span className="text-[10px] font-bold text-slate-500 tabular-nums mr-1">{job.work_date}</span>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (job.cntr_no) {
                                                                setGallerySearchCntrNo(job.cntr_no);
                                                                setIsGalleryOpen(true);
                                                            }
                                                        }}
                                                        className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-[10px] font-black transition-all flex items-center gap-1 cursor-pointer"
                                                        title="이 컨테이너의 사진 및 상세 확인/수정/삭제"
                                                    >
                                                        <ImageIcon className="w-3.5 h-3.5" />
                                                        <span>({job.photo_count || 0})</span>
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleOpenUploadModal(job, 'normal');
                                                        }}
                                                        className="p-1 hover:bg-white/10 rounded-lg text-sky-400 hover:text-white transition-all"
                                                        title="사진 추가 등록"
                                                    >
                                                        <Camera className="w-3.5 h-3.5" />
                                                    </button>
                                                    {/* 씰사진 전용 빨간 카메라: seal_photo_count가 0일 때만 표시 */}
                                                    {((job.photo_count || 0) > 0) && (job.seal_photo_count === undefined || job.seal_photo_count === 0) && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleOpenUploadModal(job, 'seal');
                                                            }}
                                                            className="p-1 hover:bg-rose-500/20 rounded-lg text-rose-500 hover:text-rose-400 transition-all animate-pulse"
                                                            title="씰(Seal) 사진 등록 — 반드시 등록해 주세요!"
                                                        >
                                                            <Camera className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                )}
            </section>



            {/* Container Selection & Manual Add */}
            <section className="space-y-4 shrink-0">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2 text-[13px] md:text-xs font-bold text-slate-500 uppercase tracking-widest">
                        <Settings2 className="w-4 h-4 md:w-3.5 md:h-3.5" />컨테이너 및 제품 등록
                    </div>
                    <button onClick={() => setIsManualAddOpen(!isManualAddOpen)}
                        className="flex items-center gap-1.5 px-3 py-1.5 md:px-2.5 md:py-1 rounded-xl md:rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs md:text-[10px] font-black hover:bg-sky-500 hover:text-white transition-all">
                        <Plus className={`w-3.5 h-3.5 md:w-3 md:h-3 transition-transform duration-300 ${isManualAddOpen ? "rotate-45" : ""}`} />제품추가
                    </button>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                    {(Object.keys(CONTAINER_DATA) as ContainerType[]).map((key) => (
                        <button key={key} onClick={() => setSelectedContainer(key)}
                            className={`py-1.5 px-1.5 rounded-xl border text-center transition-all duration-200 cursor-pointer ${selectedContainer === key
                                ? "bg-sky-500/10 border-sky-500 text-sky-400 shadow-sm ring-1 ring-sky-500/30 font-black"
                                : "bg-[#11111a] border-white/5 text-slate-400 hover:border-white/10 hover:bg-white/[0.04]"}`}>
                            <p className="text-[10px] md:text-[9px] font-black truncate leading-tight">{CONTAINER_DATA[key].name}</p>
                        </button>
                    ))}
                </div>

                <AnimatePresence>
                    {isManualAddOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="p-4 md:p-3 rounded-2xl md:rounded-xl bg-white/5 border border-white/5 space-y-3 relative">
                                <div className="flex justify-between items-center">
                                    <p className="text-[11px] md:text-[10px] font-black text-slate-500 uppercase tracking-tighter">개별 제품 추가</p>
                                    <div className="flex gap-4 md:gap-3">
                                        <button onClick={() => setManualProduct({ ...manualProduct, allow_rotate: !manualProduct.allow_rotate })}
                                            className={`flex items-center gap-1.5 text-[10px] md:text-[9px] font-black transition-colors ${manualProduct.allow_rotate ? "text-sky-400" : "text-slate-600"}`}>
                                            <RotateCw className="w-3.5 h-3.5 md:w-3 md:h-3" />돌리기
                                        </button>
                                        <button onClick={() => setManualProduct({ ...manualProduct, allow_lay_down: !manualProduct.allow_lay_down })}
                                            className={`flex items-center gap-1.5 text-[10px] md:text-[9px] font-black transition-colors ${manualProduct.allow_lay_down ? "text-indigo-400" : "text-slate-600"}`}>
                                            <Move3d className="w-3.5 h-3.5 md:w-3 md:h-3" />눕히기
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="relative">
                                        <label className="text-[10px] md:text-[9px] text-slate-500 font-bold ml-1 mb-1 block">모델명 검색</label>
                                        <input className="w-full bg-black/40 border border-white/10 rounded-xl md:rounded-lg px-4 py-2.5 md:px-3 md:py-1.5 text-xs md:text-[11px] outline-none focus:border-sky-500 transition-colors"
                                            placeholder="모델명 입력 (예: sk)" value={manualProduct.model_name} onChange={e => handleSearch(e.target.value)} />
                                        {searchResults.length > 0 && (
                                            <div className="absolute z-30 bottom-full left-0 w-full mb-1 bg-[#1a1a24] border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto custom-scrollbar">
                                                {searchResults.map((p, i) => (
                                                    <button key={i} onClick={() => selectSearchResult(p)}
                                                        className="w-full px-5 py-3 text-left text-sm md:text-[11px] hover:bg-sky-500/20 border-b border-white/5 last:border-0 transition-colors">
                                                        <div className="font-bold text-slate-200">{p.model_name}</div>
                                                        <div className="text-[11px] md:text-[10px] text-slate-500">{p.width}x{p.length}x{p.height}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        {(['width', 'length', 'height'] as const).map((dim, i) => (
                                            <div key={dim} className="space-y-1.5">
                                                <label className="text-[10px] md:text-[9px] text-slate-500 font-bold text-center block">{['가로(W)', '세로(L)', '높이(H)'][i]}</label>
                                                <input type="number" className="w-full bg-black/40 border border-white/10 rounded-xl md:rounded-lg px-2 py-2.5 md:py-1.5 text-xs md:text-[11px] outline-none focus:border-sky-500 text-center transition-colors"
                                                    value={manualProduct[dim]} onChange={e => setManualProduct({ ...manualProduct, [dim]: parseInt(e.target.value) })} />
                                            </div>
                                        ))}
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] md:text-[9px] text-slate-500 font-bold text-center block">수량</label>
                                            <input type="number" className="w-full bg-black/40 border border-white/10 rounded-xl md:rounded-lg px-2 py-2.5 md:py-1.5 text-xs md:text-[11px] outline-none focus:border-sky-500 text-center font-black text-sky-400 transition-colors"
                                                value={manualProduct.quantity} onChange={e => setManualProduct({ ...manualProduct, quantity: parseInt(e.target.value) })} />
                                        </div>
                                    </div>
                                </div>
                                <button onClick={addManualProduct} className="w-full py-3 md:py-2 rounded-2xl md:rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs md:text-[11px] font-black transition-all border border-sky-400/20 shadow-lg mt-1 active:scale-[0.98]">
                                    리스트에 아이템 추가
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </section>

            {/* Product List */}
            <section className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between px-1 mb-3">
                    <div className="flex items-center gap-2 text-[13px] md:text-xs font-bold text-slate-500 uppercase tracking-widest">
                        <Box className="w-4 h-4 md:w-3.5 md:h-3.5" />
                        적재 리스트
                        {products.length > 0 && (
                            <span className="ml-1 text-sky-500/80 font-black tracking-normal normal-case animate-in fade-in slide-in-from-left-2 transition-all">
                                총 {products.reduce((acc, p) => acc + p.quantity, 0).toLocaleString()} pkgs
                            </span>
                        )}
                    </div>
                    <button onClick={() => { setProducts([]); setResult(null); }} className="text-[11px] md:text-[10px] font-black text-rose-500 hover:text-rose-400 transition-colors uppercase tracking-tight">
                        전체 초기화
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-2.5 min-h-[120px] pb-4">
                    {products.length === 0 ? (
                        <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-[2.5rem] opacity-20">
                            <Box className="w-10 h-10 mb-2" /><p className="text-sm font-black">비어 있음</p>
                        </div>
                    ) : (
                        products.map((p, idx) => (
                            <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} key={`${p.id}-${idx}`}
                                onMouseEnter={() => setActiveProduct(p.model_name)} onMouseLeave={() => setActiveProduct(null)}
                                className={`group relative px-3 py-1.5 md:px-3 md:py-2 rounded-[1rem] md:rounded-2xl border transition-all duration-300 ${activeProduct === p.model_name
                                    ? "bg-sky-500/10 border-sky-500 shadow-xl shadow-sky-500/5 scale-[1.02] md:scale-[1.01]"
                                    : (result?.unpacked.some(u => u.id === p.id)
                                        ? "bg-rose-500/5 border-rose-500/30 shadow-none"
                                        : "bg-[#11111a] border-white/5 hover:border-white/10")}`}
                            >
                                <div className="flex justify-between items-center mb-1.5">
                                    <h5 className={`text-[12px] md:text-[11px] font-bold truncate flex-1 min-w-0 pr-2 ${activeProduct === p.model_name ? "text-sky-400" : (result?.unpacked.some(u => u.id === p.id) ? "text-rose-400" : "text-slate-200")}`}>
                                        {p.model_name}
                                    </h5>
                                    <div className="flex items-center gap-3 md:gap-2 shrink-0">
                                        {result && (
                                            <div className="text-[10px] md:text-[9px] font-black uppercase tracking-tighter text-right">
                                                <span className="text-sky-500">OK {p.quantity - (result.unpacked.find(u => u.id === p.id)?.quantity || 0)}</span>
                                                {result.unpacked.find(u => u.id === p.id) && (
                                                    <span className="text-rose-500 ml-2 md:ml-1.5">FAIL {result.unpacked.find(u => u.id === p.id)?.quantity}</span>
                                                )}
                                            </div>
                                        )}
                                        <div className={`flex items-center gap-1 md:gap-0.5 px-2.5 py-1 md:px-1.5 md:py-0.5 rounded-xl md:rounded-lg text-[11px] md:text-[10px] font-black border focus-within:ring-2 transition-all ${result?.unpacked.some(u => u.id === p.id) ? "bg-rose-500/10 text-rose-400 border-rose-500/20 focus-within:ring-rose-500" : "bg-sky-500/10 text-sky-400 border-sky-500/20 focus-within:ring-sky-500"}`}>
                                            <span className="opacity-60 font-medium">Qty</span>
                                            <input type="number" min="1" value={p.quantity === 0 ? '' : p.quantity}
                                                onChange={(e) => {
                                                    const valStr = e.target.value;
                                                    const val = valStr === '' ? 0 : parseInt(valStr);
                                                    setProducts(prev => prev.map(prod => prod.id === p.id ? { ...prod, quantity: isNaN(val) ? 0 : val } : prod));
                                                    setResult(null);
                                                }}
                                                onBlur={() => { if (!p.quantity || p.quantity < 1) setProducts(prev => prev.map(prod => prod.id === p.id ? { ...prod, quantity: 1 } : prod)); }}
                                                className="w-8 md:w-6 bg-transparent border-none outline-none p-0 m-0 text-center font-black [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4 md:gap-3">
                                        <span className="text-[11px] md:text-[10px] text-slate-500 font-bold whitespace-nowrap tracking-tight">{p.width}x{p.length}x{p.height}</span>
                                        <div className="flex gap-2 md:gap-1 border-l border-white/10 pl-4 md:pl-3">
                                            <button onClick={() => toggleProductFlag(p.id, 'allow_rotate')} className={`p-1 rounded-md md:rounded hover:bg-white/10 transition-colors ${p.allow_rotate ? "text-sky-400" : "text-slate-600"}`}>
                                                <RotateCw className="w-4 h-4 md:w-2.5 md:h-2.5" />
                                            </button>
                                            <button onClick={() => toggleProductFlag(p.id, 'allow_lay_down')} className={`p-1 rounded-md md:rounded hover:bg-white/10 transition-colors ${p.allow_lay_down ? "text-indigo-400" : "text-slate-600"}`}>
                                                <Move3d className="w-4 h-4 md:w-2.5 md:h-2.5" />
                                            </button>
                                        </div>
                                    </div>
                                    <button onClick={() => removeProduct(p.id)} className="p-1 px-2 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all md:opacity-0 md:group-hover:opacity-100">
                                        <Trash2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                                    </button>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            </section>

            {/* Simulation Button — Desktop Only */}
            <div className="hidden md:flex gap-2 shrink-0 pt-2 border-t border-white/5">
                <div className="flex flex-col items-center justify-center bg-white/5 border border-white/10 rounded-2xl px-3 min-w-[100px] group hover:border-sky-500/50 transition-colors">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter mb-1 select-none">시도횟수(MAX 50)</span>
                    <input type="number" min="1" max="50" value={numPasses} onChange={handlePassesChange}
                        className="bg-transparent text-sky-400 font-bold text-center w-full outline-none text-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                </div>
                <button disabled={products.length === 0 || isLoading} onClick={runSimulation}
                    className="group relative flex items-center justify-center overflow-hidden flex-1 py-4 rounded-2xl bg-sky-500 hover:bg-sky-400 active:scale-[0.98] disabled:opacity-50 text-white font-black text-lg transition-all shadow-lg shadow-sky-500/20">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-[100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
                    {isLoading ? (
                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <div className="flex items-center gap-2">
                            시뮬레이션 실행<ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </div>
                    )}
                </button>
            </div>
        </>
    );

    if (!mounted) {
        return (
            <div className="h-screen w-screen bg-[#030712] flex items-center justify-center text-slate-400 font-sans">
                <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div suppressHydrationWarning>
            {/* ──────────── 데스크탑 레이아웃 (md 이상) ──────────── */}
            <main className="hidden md:flex h-screen bg-[#030712] text-slate-100 overflow-hidden font-sans antialiased" suppressHydrationWarning>
                <aside className="w-[460px] h-full flex flex-col border-r border-white/5 bg-[#0a0a0f] px-5 py-6 gap-4 z-20 overflow-hidden shadow-2xl shadow-black/80" suppressHydrationWarning>
                    {controlPanel}
                </aside>
                <div className="flex-1 relative p-6 bg-[#030712]">
                    <ContainerViewer highlightedProduct={activeProduct} result={result} hideLabels={isGalleryOpen || isSettingsOpen || isManualAddOpen} />
                    {/* Floating HUD info if needed */}
                </div>
            </main>

            {/* ──────────── 모바일 레이아웃 (md 미만) ──────────── */}
            <div className="md:hidden flex flex-col h-screen bg-[#030712] text-slate-100 overflow-hidden" suppressHydrationWarning>

                {/* Mobile Floating Header (Single Fixed Container, Ultra-Tight) */}
                <header className="fixed top-0 left-0 right-0 z-[60] px-3 py-1.5 bg-[#030712]/95 backdrop-blur-xl border-b border-white/10 flex flex-col gap-1">
                    <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-1.5">
                            <Package className="w-5 h-5 text-sky-500 shrink-0" />
                            <h1 className="text-sm font-black tracking-tight uppercase">
                                CTNR <span className="text-sky-400">Optimizer</span>
                            </h1>
                        </div>
                        <div className="flex items-center gap-1">
                            {user.teamName && (
                                <a
                                    href="/select-team"
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black hover:bg-emerald-500/20 transition-all mr-0.5 whitespace-nowrap shrink-0"
                                    title="조 변경"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                                    <span className="whitespace-nowrap">{user.teamName}</span>
                                </a>
                            )}
                            <button onClick={() => setIsGalleryOpen(true)} className="p-1 hover:bg-white/5 rounded-full text-slate-400" title="사진 보관함">
                                <ImageIcon className="w-4 h-4" />
                            </button>
                            <button onClick={() => setIsSettingsOpen(true)} className="p-1 hover:bg-white/5 rounded-full text-slate-400">
                                <Settings2 className="w-4 h-4" />
                            </button>
                            <LogoutButton username={user.username} name={user.name} role={user.role} />
                        </div>
                    </div>

                    {/* Sub Bar: Team Work Completion Time */}
                    {(() => {
                        const allTeamNames = Array.from(new Set([
                            ...teamList.map(t => t.name),
                            ...Object.keys(teamProgressMap).filter(name => name !== '미지정 조')
                        ])).sort();

                        if (isAdmin) {
                            return (
                                <div className="w-full bg-[#111625] border border-sky-500/30 rounded-lg px-2 py-0.5 flex items-center justify-between gap-1.5 text-xs">
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Clock className="w-3.5 h-3.5 text-sky-400 animate-pulse shrink-0" />
                                        <span className="font-bold text-slate-200 text-[10px]">전체조:</span>
                                    </div>
                                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
                                        {allTeamNames.length > 0 ? (
                                            allTeamNames.map(tName => {
                                                const prog = teamProgressMap[tName];
                                                return (
                                                    <div key={tName} className="flex items-center gap-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[9px] whitespace-nowrap">
                                                        <span className="font-bold text-slate-300">{tName}:</span>
                                                        {prog ? (
                                                            <span className="font-black text-emerald-400">~{prog.endTimeStr}({prog.completedCount}대)</span>
                                                        ) : (
                                                            <span className="text-slate-500">19:00시작</span>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <span className="text-[9px] text-slate-500">조 없음</span>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        const myTeamProgress = user.teamName ? (teamProgressMap[user.teamName] || Object.values(teamProgressMap).find((tp: any) => isSameTeam(tp.teamName, user.teamName))) : null;
                        return (
                            <div className="w-full bg-[#111625] border border-sky-500/30 rounded-lg px-2.5 py-1 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0 animate-pulse" />
                                    <span className="font-bold text-slate-200 text-[11px] truncate">
                                        {user.teamName ? `${user.teamName} 진행` : '작업 진행'}
                                    </span>
                                </div>
                                {myTeamProgress ? (
                                    <div className="flex items-center gap-1.5 text-[11px] font-black shrink-0">
                                        <span className="text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-md border border-emerald-500/30">
                                            ~ {myTeamProgress.endTimeStr} 완료
                                        </span>
                                        <span className="text-slate-400 text-[10px] font-medium">
                                            ({myTeamProgress.completedCount}대)
                                        </span>
                                    </div>
                                ) : (
                                    <span className="text-[10px] text-slate-400 font-medium shrink-0">
                                        완료건 없음 (19:00 시작)
                                    </span>
                                )}
                            </div>
                        );
                    })()}
                </header>

                <div id="mobile-scroll-container" className="flex-1 flex flex-col overflow-y-auto mt-[70px] pb-32">
                    {/* 시뮬레이션 결과 뷰어 — 결과 있을 때만 상단 표시 */}
                    <AnimatePresence>
                        {result && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                                className="w-full shrink-0 bg-[#030712] border-b border-white/5 relative"
                            >
                                <ContainerViewer highlightedProduct={activeProduct} result={result} hideLabels={isGalleryOpen || isSettingsOpen || isManualAddOpen} />
                                <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-sky-500/20 border border-sky-500/30 text-[10px] font-black text-sky-400 uppercase tracking-widest backdrop-blur-md">
                                    3D Simulation Map
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* 컨트롤 패널 — 스크롤 가능 영역 */}
                    <div ref={controlPanelRef} className="flex-1 flex flex-col px-4 py-5 gap-6 md:px-5 md:py-6 md:gap-8">
                        {controlPanel}
                    </div>
                </div>

                {/* 모바일 하단 고정 시뮬레이션 버튼 — Premium Floating Bar */}
                <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-3 md:px-5 md:pb-8 md:pt-4 bg-gradient-to-t from-[#030712] via-[#030712]/95 to-transparent flex flex-col gap-3 md:gap-4">
                    <div className="flex gap-2 text-xs md:gap-3 items-end">
                        {/* Passes Count UI with Circle 'N' Style */}
                        <div className="relative flex items-center gap-2 md:gap-3 flex-shrink-0 bg-[#1a1a24] border border-white/10 rounded-[1.25rem] px-3 py-1.5 md:px-4 md:py-2 mt-auto">
                            <div className="w-8 h-8 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                                <span className="text-xs font-black text-sky-500 tracking-tighter">N</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Passes</span>
                                <input type="number" min="1" max="50" value={numPasses} onChange={handlePassesChange}
                                    className="bg-transparent text-sky-400 font-black text-lg w-10 outline-none leading-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                            </div>
                        </div>

                        {/* Large Action Button */}
                        <button disabled={products.length === 0 || isLoading} onClick={runSimulation}
                            className="flex-1 py-3 md:py-[1.125rem] rounded-[1.25rem] md:rounded-3xl bg-sky-500 hover:bg-sky-400 active:scale-[0.98] disabled:opacity-50 text-white font-black text-[15px] md:text-[17px] transition-all flex items-center justify-center gap-2 md:gap-3 shadow-[0_12px_40px_rgba(56,189,248,0.3)] shadow-sky-500/20">
                            {isLoading ? (
                                <div className="w-5 h-5 md:w-6 md:h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>시뮬레이션 실행 <ChevronRight className="w-5 h-5 bg-white/20 rounded-full p-0.5" /></>
                            )}
                        </button>
                    </div>
                </div>
            </div>
            {/* Database & Account Settings Modal */}
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                user={user}
                isAdmin={isAdmin}
                settingsTab={settingsTab}
                setSettingsTab={setSettingsTab}
                dbConfig={dbConfig}
                setDbConfig={setDbConfig}
                handleDbSave={handleDbSave}
                isExportingDb={isExportingDb}
                handleExportDbDump={handleExportDbDump}
                isRestoringDb={isRestoringDb}
                handleRestoreDbDump={handleRestoreDbDump}
                isTriggeringSync={isTriggeringSync}
                handleTriggerManualBackupAndSync={handleTriggerManualBackupAndSync}
                userList={userList}
                isUserLoading={isUserLoading}
                selectedUserIds={selectedUserIds}
                toggleSelectUser={toggleSelectUser}
                toggleSelectAllUsers={toggleSelectAllUsers}
                handleDeleteSelectedUsers={handleDeleteSelectedUsers}
                handleOpenAddUser={handleOpenAddUser}
                handleOpenEditUser={handleOpenEditUser}
                handleToggleApproval={handleToggleApproval}
                teamList={teamList}
                isTeamLoading={isTeamLoading}
                newTeamName={newTeamName}
                setNewTeamName={setNewTeamName}
                handleAddTeam={handleCreateTeam}
                editingTeam={editingTeam}
                editingTeamName={editingTeamName}
                setEditingTeamName={setEditingTeamName}
                handleStartEditTeam={(team: Team) => { setEditingTeam(team); setEditingTeamName(team.name); }}
                handleCancelEditTeam={() => { setEditingTeam(null); setEditingTeamName(''); }}
                handleSaveEditTeam={handleUpdateTeam}
                handleDeleteTeam={handleDeleteTeam}
                passwordData={passwordData}
                setPasswordData={setPasswordData}
                isPasswordUpdating={isPasswordUpdating}
                handlePasswordUpdate={handlePasswordUpdate}
                handleResetTeamProgress={handleResetTeamProgress}
            />

            {/* User Form Modal (Create / Edit User) */}
            <UserFormModal
                isOpen={isUserModalOpen}
                onClose={() => setIsUserModalOpen(false)}
                editingUser={editingUser}
                userForm={userForm}
                setUserForm={setUserForm}
                onSave={handleSaveUser}
                isLoading={isUserLoading}
            />

            {/* Photo Upload Modal */}
            <PhotoUploadModal
                uploadJob={uploadJob}
                uploadPhotoType={uploadPhotoType}
                onClose={() => { if (!isUploading) { setUploadJob(null); setUploadPhotoType('normal'); } }}
                uploadFiles={uploadFiles}
                setUploadFiles={setUploadFiles}
                uploadCntrNo={uploadCntrNo}
                setUploadCntrNo={setUploadCntrNo}
                uploadDurationMinutes={uploadDurationMinutes}
                setUploadDurationMinutes={setUploadDurationMinutes}
                uploadEmptyBoxes={uploadEmptyBoxes}
                setUploadEmptyBoxes={setUploadEmptyBoxes}
                uploadRemark={uploadRemark}
                setUploadRemark={setUploadRemark}
                isUploading={isUploading}
                uploadProgressText={uploadProgressText}
                handlePhotoUpload={handlePhotoUpload}
                onOpenGalleryForCntr={(cntrNo) => {
                    setGallerySearchCntrNo(cntrNo);
                    setIsGalleryOpen(true);
                }}
            />

            <ReportModal
                isReportOpen={isReportOpen}
                setIsReportOpen={setIsReportOpen}
                isAdmin={isAdmin}
                user={user}
                reportData={reportData}
                onUpdateReportHeader={handleUpdateReportHeader}
                reportStartDate={reportStartDate}
                setReportStartDate={setReportStartDate}
                reportEndDate={reportEndDate}
                setReportEndDate={setReportEndDate}
                handleNavigateDate={handleNavigateDate}
                handleRegenerateReport={handleRegenerateReport}
                handleLoadSavedReport={handleLoadSavedReport}
                isLoadingSavedReport={isLoadingSavedReport}
                setIsCancelManageOpen={setIsCancelManageOpen}
                reportViewMode={reportViewMode}
                setReportViewMode={setReportViewMode as any}
                handleOpenAddManual={handleOpenAddManual}
                isReportGenerating={isReportGenerating}
                isExportingImage={isExportingImage}
                handleEditReportItem={handleEditReportItem}
                handleDeleteReportItem={handleDeleteReportItem}
                handleToggleCancelCntr={handleToggleCancelCntr}
                editingCommentCntr={editingCommentCntr}
                setEditingCommentCntr={setEditingCommentCntr}
                commentInput={commentInput}
                setCommentInput={setCommentInput}
                handleSaveComment={handleSaveComment}
                reportCaptureRef={reportCaptureRef}
                handleSaveReport={handleSaveReport}
                handleCopyReport={handleCopyReport}
                handleCopyReportImage={handleCopyReportImage}
                handleDownloadReportImage={handleDownloadReportImage}
                isSavingReport={isSavingReport}
                imageCopyModalUrl={imageCopyModalUrl}
                setImageCopyModalUrl={setImageCopyModalUrl}
                isCopied={isCopied}
                reportText={reportText}
                savedReportInfo={savedReportInfo}
                onOpenGallery={handleOpenGalleryFromReport}
                isImageCopied={isImageCopied}
            />
            {/* Manual Entry Modal Popover */}
            <AddManualModal
                isOpen={isAddManualOpen}
                onClose={() => setIsAddManualOpen(false)}
                editingReportItem={editingReportItem}
                isAdmin={isAdmin}
                user={user}
                manualTeamName={manualTeamName}
                setManualTeamName={setManualTeamName}
                manualTransporter={manualTransporter}
                setManualTransporter={setManualTransporter}
                manualCntrNo={manualCntrNo}
                setManualCntrNo={setManualCntrNo}
                manualCategory={manualCategory}
                setManualCategory={setManualCategory}
                manualInsertIndex={manualInsertIndex}
                setManualInsertIndex={setManualInsertIndex as any}
                currentTeamContainers={currentTeamContainers}
                manualDuration={manualDuration}
                setManualDuration={setManualDuration}
                manualRemark={manualRemark}
                setManualRemark={setManualRemark}
                isManualCancelled={isManualCancelled}
                setIsManualCancelled={setIsManualCancelled}
                manualProducts={manualProducts}
                setManualProducts={setManualProducts}
                manualEmptyBoxes={manualEmptyBoxes}
                setManualEmptyBoxes={setManualEmptyBoxes}
                handlePasteExcel={handlePasteExcel}
                handleAddManualSubmit={handleAddManualSubmit}
            />

            {/* 작업취소 / 작업제외 관리 팝업 모달 */}
            <CancelManageModal
                isOpen={isCancelManageOpen}
                onClose={() => setIsCancelManageOpen(false)}
                cancelMode={cancelMode}
                setCancelMode={setCancelMode as any}
                reportData={reportData}
                handleToggleCancelCntr={handleToggleCancelCntr as any}
                handleSetCancelType={handleSetCancelType}
            />
            

            {isGalleryOpen && (
                <PhotoGallery
                    user={user}
                    isOpen={isGalleryOpen}
                    initialSearchCntrNo={gallerySearchCntrNo}
                    onClose={() => {
                        setIsGalleryOpen(false);
                        setGallerySearchCntrNo('');
                        refreshJobs();
                        loadTeamProgress();
                    }}
                    onOpenReport={handleOpenReportFromGallery}
                />
            )}
        </div>
    );
}





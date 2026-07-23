"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
    Search, Box, Package, Truck, RotateCw, Plus, Trash2,
    Settings2, ChevronRight, Filter, Calendar, Briefcase, Move3d, X,
    Camera, Upload, Loader2, Image as ImageIcon,
    Users, UserPlus, Edit3, Shield, KeyRound, Database, UserCheck, UserX,
    FileText, Copy, Download, Check, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ContainerViewer from '@/components/ContainerViewer';
import LogoutButton from '@/components/LogoutButton';
import PhotoGallery from '@/components/PhotoGallery';
import {
    Product, PackingResult, ContainerType, CONTAINER_DATA, Job, JobFilters, DbConfig, UserAccount, Team
} from '@/lib/types';
import { packContainer } from '@/lib/packer';
import { fetchJobs, fetchProductsByJob, searchProducts, getDbConfig, updateDbConfig, updatePassword, fetchAllUsers, createUserAccount, updateUserAccount, deleteUserAccount, deleteMultipleUserAccounts, generateWorkReport, fetchTeams, createTeam, updateTeam, deleteTeam, fetchTeamWorkProgress, TeamWorkProgress, updateContainerWorkDuration } from '@/lib/actions';
import { SessionUser } from '@/lib/auth';


function getLocalDateString(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getWorkDateString(d: Date = new Date()): string {
    const workDate = new Date(d);
    if (workDate.getHours() < 19) {
        workDate.setDate(workDate.getDate() - 1);
    }
    const year = workDate.getFullYear();
    const month = String(workDate.getMonth() + 1).padStart(2, '0');
    const day = String(workDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export default function Home({ user }: { user: SessionUser }) {
    const isAdmin = user && (user.role.toUpperCase() === 'ADMIN' || user.role.toUpperCase() === 'MANAGER');

    const [selectedContainer, setSelectedContainer] = useState<ContainerType>('40hc');
    const [products, setProducts] = useState<Product[]>([]);
    const [result, setResult] = useState<PackingResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [teamProgressMap, setTeamProgressMap] = useState<Record<string, TeamWorkProgress>>({});
    const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [uploadJob, setUploadJob] = useState<Job | null>(null);
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
    const [uploadFiles, setUploadFiles] = useState<File[]>([]);
    const [uploadRemark, setUploadRemark] = useState('');
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
    const [reportStartDate, setReportStartDate] = useState('');
    const [reportEndDate, setReportEndDate] = useState('');

    const handleGenerateReport = async () => {
        const defaultWorkDate = getWorkDateString(new Date());
        const start = filters.startDate || defaultWorkDate;
        const end = filters.endDate || defaultWorkDate;
        
        setReportStartDate(start);
        setReportEndDate(end);

        setIsReportGenerating(true);
        setIsReportOpen(true);
        setIsCopied(false);
        try {
            const res = await generateWorkReport({
                ...filters,
                startDate: start,
                endDate: end
            });
            if (res.success && res.reportText) {
                setReportText(res.reportText);
                let data = res.reportData || [];
                if (!isAdmin && user.teamName) {
                    data = data.map((dg: any) => ({
                        ...dg,
                        uploaders: dg.uploaders.filter((u: any) => u.teamName === user.teamName)
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
                startDate: reportStartDate,
                endDate: reportEndDate
            });
            if (res.success && res.reportText) {
                setReportText(res.reportText);
                let data = res.reportData || [];
                if (!isAdmin && user.teamName) {
                    data = data.map((dg: any) => ({
                        ...dg,
                        uploaders: dg.uploaders.filter((u: any) => u.teamName === user.teamName)
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

        if (uploadFiles.length === 0) {
            if (uploadJob && uploadJob.photo_count && uploadJob.photo_count > 0) {
                setIsUploading(true);
                try {
                    const finalDuration = uploadDurationMinutes === '' ? 45 : Number(uploadDurationMinutes);
                    const res = await updateContainerWorkDuration(targetJobId, uploadCntrNo.trim(), finalDuration, uploadRemark.trim());
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
                formData.append('jobId', targetJobId.toString());
                formData.append('cntrNo', uploadCntrNo.trim());
                formData.append('remark', uploadRemark.trim());
                formData.append('durationMinutes', (uploadDurationMinutes === '' ? 45 : uploadDurationMinutes).toString());

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

    const removeProduct = (id: string) => {
        setProducts(prev => prev.filter(p => p.id !== id));
        setResult(null);
    };

    const getCarrierColor = (transporter: string | undefined) => {
        if (!transporter) return "text-slate-300";
        if (transporter.includes("천마")) return "text-rose-500 font-black";
        if (transporter.includes("BNI") || transporter.includes("비엔아이")) return "text-indigo-500 font-bold";
        return "text-emerald-500 font-bold";
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
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-black hover:bg-emerald-500/20 transition-all mr-0.5"
                                title="조 변경"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                {user.teamName}
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

                        const myTeamProgress = user.teamName ? teamProgressMap[user.teamName] : null;
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
                    </div>
                </div>

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
                                <div key={idx} onClick={() => handleJobSelect(job.id)}
                                    className={`w-full px-3.5 py-3 md:px-4 md:py-3 rounded-2xl text-left border transition-all duration-300 flex items-center justify-between group cursor-pointer select-none ${selectedJobId === job.id
                                        ? "bg-sky-500/10 border-sky-500 shadow-[0_0_25px_rgba(56,189,248,0.15)] ring-1 ring-sky-500/30"
                                        : "bg-[#11111a] border-white/5 text-slate-400 hover:border-white/10 hover:bg-white/[0.07]"}`}
                                >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className={`text-[15px] md:text-sm font-black truncate uppercase tracking-tight ${getCarrierColor(job.transporter)}`}>
                                            {job.cntr_no || "번호없음"}
                                            <span className="ml-2 text-[10px] font-bold text-slate-600 normal-case tracking-normal">
                                                [{job.transporter ? (job.transporter.includes("천마") ? "천마" : (job.transporter.includes("BNI") || job.transporter.includes("비엔아이") ? "BNI" : job.transporter.split('(')[0])) : "미정"}]
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                        <div className="text-[11px] md:text-[10px] font-bold text-slate-600 shrink-0 tabular-nums">{job.work_date}</div>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (!isAdmin && !user.teamName) {
                                                    if (confirm("사진 및 작업시간을 등록하려면 먼저 소속 조를 선택해야 합니다.\n조 선택 화면으로 이동하시겠습니까?")) {
                                                        window.location.href = "/select-team";
                                                    }
                                                    return;
                                                }
                                                setUploadJob(job);
                                                setUploadCntrNo(job.cntr_no || '');
                                                setUploadFiles([]);
                                                setUploadRemark(job.remark || '');
                                                setUploadDurationMinutes(job.work_duration_minutes ?? '');
                                            }}
                                            className={`p-1.5 hover:bg-white/10 rounded-lg transition-all flex items-center gap-1 ${
                                                job.photo_count && job.photo_count > 0 
                                                    ? "text-sky-400 bg-sky-500/10 border border-sky-500/20" 
                                                    : "text-slate-500 hover:text-sky-400 border border-transparent"
                                            }`}
                                            title={job.photo_count && job.photo_count > 0 ? `사진 등록 (현재 ${job.photo_count}장 등록됨)` : "사진 등록"}
                                        >
                                            <Camera className="w-4 h-4 md:w-3.5 md:h-3.5" />
                                            {job.photo_count && job.photo_count > 0 ? (
                                                <span className="text-[10px] md:text-[9px] font-black">{job.photo_count}</span>
                                            ) : null}
                                        </button>
                                    </div>
                                </div>
                            ))
                        );
                    })()}
                </div>
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

                <div className="grid grid-cols-2 gap-2.5">
                    {(Object.keys(CONTAINER_DATA) as ContainerType[]).map((key) => (
                        <button key={key} onClick={() => setSelectedContainer(key)}
                            className={`px-3 py-2 md:p-2 rounded-2xl md:rounded-xl text-left border transition-all duration-300 ${selectedContainer === key
                                ? "bg-sky-500/10 border-sky-500 text-sky-400 shadow-lg shadow-sky-500/5 ring-1 ring-sky-500/20"
                                : "bg-[#11111a] border-white/5 text-slate-400 hover:border-white/10"}`}>
                            <p className="text-[11px] md:text-[10px] font-black truncate">{CONTAINER_DATA[key].name}</p>
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

    return (
        <>
            <style jsx global>{`
                input[type="date"]::-webkit-calendar-picker-indicator {
                    filter: invert(1);
                    opacity: 0.5;
                }
            `}</style>

            {/* ──────────── 데스크탑 레이아웃 (md 이상) ──────────── */}
            <main className="hidden md:flex h-screen bg-[#030712] text-slate-100 overflow-hidden font-sans antialiased">
                <aside className="w-[460px] h-full flex flex-col border-r border-white/5 bg-[#0a0a0f] px-5 py-6 gap-4 z-20 overflow-hidden shadow-2xl shadow-black/80">
                    {controlPanel}
                </aside>
                <div className="flex-1 relative p-6 bg-[#030712]">
                    <ContainerViewer highlightedProduct={activeProduct} result={result} hideLabels={isGalleryOpen || isSettingsOpen || isManualAddOpen} />
                    {/* Floating HUD info if needed */}
                </div>
            </main>

            {/* ──────────── 모바일 레이아웃 (md 미만) ──────────── */}
            <div className="md:hidden flex flex-col h-screen bg-[#030712] text-slate-100 overflow-hidden">

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
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black hover:bg-emerald-500/20 transition-all mr-0.5"
                                    title="조 변경"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    {user.teamName}
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

                        const myTeamProgress = user.teamName ? teamProgressMap[user.teamName] : null;
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
            <AnimatePresence>
                {isSettingsOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSettingsOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-lg bg-[#0f111a] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden p-6 md:p-8 max-h-[90vh] flex flex-col">
                            
                            {/* Modal Header */}
                            <div className="flex items-center justify-between gap-3 mb-6 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-sky-500/10 rounded-2xl">
                                        <Settings2 className="w-6 h-6 text-sky-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-white">
                                            {isAdmin ? "시스템 설정" : "사용자 설정"}
                                        </h2>
                                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                                            {isAdmin ? "System Configuration" : "User Settings"}
                                        </p>
                                    </div>
                                </div>
                                <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Settings Tab Navigation (Admin gets DB / Users / Password tabs) */}
                            {isAdmin && (
                                <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5 mb-6 shrink-0 gap-1">
                                    <button 
                                        onClick={() => setSettingsTab('db')}
                                        className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${settingsTab === 'db' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                    >
                                        <Database className="w-3.5 h-3.5" />
                                        DB 설정
                                    </button>
                                    <button 
                                        onClick={() => setSettingsTab('users')}
                                        className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${settingsTab === 'users' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                    >
                                        <Users className="w-3.5 h-3.5" />
                                        계정 관리
                                    </button>
                                    <button 
                                        onClick={() => setSettingsTab('teams')}
                                        className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${settingsTab === 'teams' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                    >
                                        <Users className="w-3.5 h-3.5" />
                                        조 관리
                                    </button>
                                    <button 
                                        onClick={() => setSettingsTab('password')}
                                        className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${settingsTab === 'password' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                    >
                                        <KeyRound className="w-3.5 h-3.5" />
                                        비밀번호
                                    </button>
                                </div>
                            )}

                            {/* Current Team Info & Quick Change */}
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between mb-5 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 font-black text-lg flex items-center justify-center border border-emerald-500/30">
                                        {user.teamName ? user.teamName.charAt(0) : "조"}
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">현재 선택된 작업 조</span>
                                        <span className="text-sm font-black text-white">{user.teamName || "미선택 (조 선택 필요)"}</span>
                                    </div>
                                </div>
                                <a
                                    href="/select-team"
                                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5 whitespace-nowrap"
                                >
                                    <Users className="w-3.5 h-3.5" />
                                    조 변경하기
                                </a>
                            </div>

                            {/* Tab Content */}
                            <div className="overflow-y-auto custom-scrollbar flex-1 pr-1 space-y-6">
                                {(settingsTab === 'db' && isAdmin) && (
                                    <>
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <label className="text-[11px] font-black text-slate-500 ml-1">Host 주소</label>
                                                <input value={dbConfig.host} onChange={e => setDbConfig({ ...dbConfig, host: e.target.value })}
                                                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all" placeholder="localhost 또는 IP주소" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-[11px] font-black text-slate-500 ml-1">DB 이름</label>
                                                    <input value={dbConfig.database} onChange={e => setDbConfig({ ...dbConfig, database: e.target.value })}
                                                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all" />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[11px] font-black text-slate-500 ml-1">Port</label>
                                                    <input type="number" value={dbConfig.port} onChange={e => setDbConfig({ ...dbConfig, port: parseInt(e.target.value) })}
                                                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all" />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[11px] font-black text-slate-500 ml-1">User ID</label>
                                                <input value={dbConfig.user} onChange={e => setDbConfig({ ...dbConfig, user: e.target.value })}
                                                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[11px] font-black text-slate-500 ml-1">Password</label>
                                                <input type="password" value={dbConfig.password} onChange={e => setDbConfig({ ...dbConfig, password: e.target.value })}
                                                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all" placeholder="비밀번호 입력" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[11px] font-black text-slate-500 ml-1">휴지통 보관 기간 (일)</label>
                                                <input type="number" value={dbConfig.trash_retention_days} onChange={e => setDbConfig({ ...dbConfig, trash_retention_days: parseInt(e.target.value) || 15 })}
                                                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all" min={1} max={365} />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[11px] font-black text-slate-500 ml-1">사진 저장 폴더 (저장지)</label>
                                                <input value={dbConfig.upload_dir || ''} onChange={e => setDbConfig({ ...dbConfig, upload_dir: e.target.value })}
                                                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all" placeholder="예: C:\CTNR_uploads (기본값: uploads)" />
                                            </div>
                                        </div>

                                        <div className="flex gap-3 mt-6">
                                            <button onClick={() => setIsSettingsOpen(false)} className="flex-1 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 font-bold text-sm transition-all">취소</button>
                                            <button onClick={handleDbSave} className="flex-2 py-4 px-8 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-black text-sm transition-all shadow-lg shadow-sky-500/20">설정 저장</button>
                                        </div>
                                    </>
                                )}

                                {(settingsTab === 'users' && isAdmin) && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between gap-2 flex-wrap bg-black/40 p-3 rounded-2xl border border-white/5">
                                            <label className="flex items-center gap-2 text-xs font-bold text-slate-300 cursor-pointer select-none">
                                                <input 
                                                    type="checkbox"
                                                    checked={isAllUsersSelected}
                                                    disabled={deletableUsers.length === 0}
                                                    onChange={toggleSelectAllUsers}
                                                    className="w-4 h-4 rounded border-white/20 bg-black/40 text-sky-500 focus:ring-0 cursor-pointer accent-sky-500 disabled:opacity-30"
                                                />
                                                <span>전체 선택 ({deletableUsers.length}명 중 {selectedUserIds.length}명 선택)</span>
                                            </label>

                                            <div className="flex items-center gap-2">
                                                {selectedUserIds.length > 0 && (
                                                    <button 
                                                        onClick={handleDeleteSelectedUsers}
                                                        disabled={isUserLoading}
                                                        className="px-3.5 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 hover:bg-rose-500 hover:text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        선택 삭제 ({selectedUserIds.length})
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={handleOpenAddUser}
                                                    className="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm"
                                                >
                                                    <UserPlus className="w-3.5 h-3.5" />
                                                    계정 추가
                                                </button>
                                            </div>
                                        </div>

                                        {isUserLoading ? (
                                            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                                                <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
                                                <p className="text-xs">사용자 목록을 불러오는 중...</p>
                                            </div>
                                        ) : userList.length === 0 ? (
                                            <div className="py-12 text-center text-xs text-slate-500 bg-white/5 rounded-2xl border border-white/5">
                                                등록된 사용자 계정이 없습니다.
                                            </div>
                                        ) : (
                                            <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                                                {userList.map((u) => {
                                                    const isSelf = u.id === user.id;
                                                    const isSelected = selectedUserIds.includes(u.id);
                                                    const roleUpper = (u.role || 'USER').toUpperCase();
                                                    return (
                                                        <div key={u.id} className={`p-3.5 rounded-2xl bg-black/40 border transition-all flex items-center justify-between gap-3 ${isSelected ? 'border-sky-500/50 bg-sky-500/5' : 'border-white/5 hover:border-white/10'}`}>
                                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                <input 
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    disabled={isSelf}
                                                                    onChange={() => toggleSelectUser(u.id)}
                                                                    className="w-4 h-4 rounded border-white/20 bg-black/40 text-sky-500 focus:ring-0 cursor-pointer accent-sky-500 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                                                                    title={isSelf ? "본인 계정은 선택할 수 없습니다" : "선택"}
                                                                />
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className="font-bold text-sm text-white truncate">{u.name}</span>
                                                                        <span className="text-xs text-slate-400 font-mono">({u.username})</span>
                                                                        {isSelf && (
                                                                            <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 text-[10px] font-black">나</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                                                            roleUpper === 'ADMIN' 
                                                                                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' 
                                                                                : roleUpper === 'MANAGER' 
                                                                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                                                                                : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                                                                        }`}>
                                                                            {roleUpper}
                                                                        </span>
                                                                        {u.isApproved ? (
                                                                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                                                                                <UserCheck className="w-3 h-3" /> 승인됨
                                                                            </span>
                                                                        ) : (
                                                                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                                                                                <UserX className="w-3 h-3" /> 승인대기
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <button 
                                                                    onClick={() => handleOpenEditUser(u)}
                                                                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all text-xs font-bold flex items-center gap-1"
                                                                    title="수정"
                                                                >
                                                                    <Edit3 className="w-3.5 h-3.5" />
                                                                </button>
                                                                {!isSelf && (
                                                                    <button 
                                                                        onClick={() => handleDeleteUser(u)}
                                                                        className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white transition-all text-xs font-bold flex items-center gap-1"
                                                                        title="개별 삭제"
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {(settingsTab === 'teams' && isAdmin) && (
                                    <div className="space-y-5">
                                        {/* 조 추가 */}
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-black text-slate-500 ml-1 uppercase tracking-widest">새 조 추가</label>
                                            <div className="flex gap-2">
                                                <input
                                                    value={newTeamName}
                                                    onChange={e => setNewTeamName(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleCreateTeam()}
                                                    placeholder="조 이름 입력 (예: 1조, 2조)"
                                                    className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-emerald-500/50 outline-none transition-all"
                                                    disabled={isTeamLoading}
                                                />
                                                <button
                                                    onClick={handleCreateTeam}
                                                    disabled={isTeamLoading || !newTeamName.trim()}
                                                    className="px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold text-sm transition-all flex items-center gap-1.5 whitespace-nowrap"
                                                >
                                                    + 추가
                                                </button>
                                            </div>
                                        </div>

                                        {/* 조 목록 */}
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-black text-slate-500 ml-1 uppercase tracking-widest">등록된 조 목록</label>
                                            {isTeamLoading ? (
                                                <div className="flex items-center justify-center py-8">
                                                    <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
                                                </div>
                                            ) : teamList.length === 0 ? (
                                                <div className="text-center py-8 text-slate-600 text-sm">
                                                    등록된 조가 없습니다. 위에서 추가해주세요.
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    {teamList.map(team => (
                                                        <div key={team.id} className="flex items-center gap-2 bg-black/30 border border-white/5 rounded-2xl px-4 py-3">
                                                            {editingTeam?.id === team.id ? (
                                                                <>
                                                                    <input
                                                                        value={editingTeamName}
                                                                        onChange={e => setEditingTeamName(e.target.value)}
                                                                        onKeyDown={e => { if (e.key === 'Enter') handleUpdateTeam(); if (e.key === 'Escape') { setEditingTeam(null); setEditingTeamName(''); } }}
                                                                        className="flex-1 bg-black/40 border border-emerald-500/40 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500"
                                                                        autoFocus
                                                                        disabled={isTeamLoading}
                                                                    />
                                                                    <button
                                                                        onClick={handleUpdateTeam}
                                                                        disabled={isTeamLoading}
                                                                        className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold transition-all"
                                                                    >
                                                                        저장
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { setEditingTeam(null); setEditingTeamName(''); }}
                                                                        className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 text-xs font-bold transition-all"
                                                                    >
                                                                        취소
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-black text-sm shrink-0">
                                                                        {team.name.charAt(0)}
                                                                    </div>
                                                                    <span className="flex-1 text-sm font-bold text-slate-200">{team.name}</span>
                                                                    <button
                                                                        onClick={() => { setEditingTeam(team); setEditingTeamName(team.name); }}
                                                                        className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-bold transition-all"
                                                                    >
                                                                        수정
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteTeam(team.id, team.name)}
                                                                        className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold transition-all"
                                                                    >
                                                                        삭제
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {(settingsTab === 'password' || !isAdmin) && (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-black text-slate-500 ml-1">현재 비밀번호</label>
                                            <input type="password" value={passwordData.current} onChange={e => setPasswordData({ ...passwordData, current: e.target.value })}
                                                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-amber-500/50 outline-none transition-all" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[11px] font-black text-slate-500 ml-1">새 비밀번호</label>
                                                <input type="password" value={passwordData.new} onChange={e => setPasswordData({ ...passwordData, new: e.target.value })}
                                                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-amber-500/50 outline-none transition-all" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[11px] font-black text-slate-500 ml-1">비밀번호 확인</label>
                                                <input type="password" value={passwordData.confirm} onChange={e => setPasswordData({ ...passwordData, confirm: e.target.value })}
                                                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-amber-500/50 outline-none transition-all" />
                                            </div>
                                        </div>
                                        <button onClick={handlePasswordUpdate} disabled={isPasswordUpdating}
                                            className="w-full py-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500 hover:text-white font-black text-sm transition-all mt-2">
                                            {isPasswordUpdating ? "변경 중..." : "비밀번호 변경 적용"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* User Form Modal (Create / Edit User) */}
            <AnimatePresence>
                {isUserModalOpen && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsUserModalOpen(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-sm bg-[#0f111a] border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden p-6 flex flex-col">
                            
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-lg font-black text-white flex items-center gap-2">
                                    {editingUser ? <Edit3 className="w-5 h-5 text-sky-400" /> : <UserPlus className="w-5 h-5 text-emerald-400" />}
                                    {editingUser ? "사용자 정보 수정" : "신규 사용자 등록"}
                                </h3>
                                <button onClick={() => setIsUserModalOpen(false)} className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-black text-slate-400 ml-1">아이디 (Username)</label>
                                    <input 
                                        value={userForm.username} 
                                        disabled={!!editingUser}
                                        onChange={e => setUserForm({ ...userForm, username: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm focus:border-sky-500 outline-none transition-all disabled:opacity-50 disabled:bg-white/5"
                                        placeholder="로그인 아이디 입력" 
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-black text-slate-400 ml-1">이름 (Name)</label>
                                    <input 
                                        value={userForm.name} 
                                        onChange={e => setUserForm({ ...userForm, name: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm focus:border-sky-500 outline-none transition-all"
                                        placeholder="사용자 이름 입력" 
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-black text-slate-400 ml-1">
                                        비밀번호 {editingUser && <span className="text-[10px] text-slate-500 font-normal">(변경 시에만 입력)</span>}
                                    </label>
                                    <input 
                                        type="password"
                                        value={userForm.password} 
                                        onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm focus:border-sky-500 outline-none transition-all"
                                        placeholder={editingUser ? "변경할 비밀번호 입력 (선택)" : "비밀번호 입력"} 
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black text-slate-400 ml-1">권한 (Role)</label>
                                        <select 
                                            value={userForm.role}
                                            onChange={e => setUserForm({ ...userForm, role: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-sky-500 outline-none transition-all text-white"
                                        >
                                            <option value="USER" className="bg-[#0f111a]">일반 (USER)</option>
                                            <option value="MANAGER" className="bg-[#0f111a]">매니저 (MANAGER)</option>
                                            <option value="ADMIN" className="bg-[#0f111a]">관리자 (ADMIN)</option>
                                        </select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black text-slate-400 ml-1">승인 상태</label>
                                        <button
                                            type="button"
                                            onClick={() => setUserForm({ ...userForm, isApproved: !userForm.isApproved })}
                                            className={`w-full py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                                userForm.isApproved 
                                                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' 
                                                    : 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                                            }`}
                                        >
                                            {userForm.isApproved ? (
                                                <><UserCheck className="w-3.5 h-3.5" /> 승인됨</>
                                            ) : (
                                                <><UserX className="w-3.5 h-3.5" /> 승인 대기</>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <button 
                                        type="button"
                                        onClick={() => setIsUserModalOpen(false)}
                                        className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 font-bold text-xs transition-all"
                                    >
                                        취소
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={handleSaveUser}
                                        disabled={isUserLoading}
                                        className="flex-1 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs transition-all shadow-lg shadow-sky-500/20 disabled:opacity-50"
                                    >
                                        {isUserLoading ? "저장 중..." : "저장"}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>


            {/* Photo Upload Modal */}
            <AnimatePresence>
                {uploadJob && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
                            onClick={() => { if (!isUploading) setUploadJob(null); }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-md bg-[#0f111a] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden p-8 max-h-[90vh] flex flex-col">
                            <div className="flex items-center justify-between gap-3 mb-6 shrink-0">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className="p-3 bg-sky-500/10 rounded-2xl shrink-0">
                                        <Camera className="w-6 h-6 text-sky-500" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h2 className="text-lg font-black text-white truncate">사진 완료 등록</h2>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate">
                                            {uploadJob.cntr_no || "번호없음"} ({uploadJob.transporter ? (uploadJob.transporter.includes("천마") ? "천마" : (uploadJob.transporter.includes("BNI") || uploadJob.transporter.includes("비엔아이") ? "BNI" : uploadJob.transporter.split('(')[0])) : "미정"})
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    disabled={isUploading}
                                    onClick={() => setUploadJob(null)}
                                    className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-rose-500 transition-colors shrink-0 disabled:opacity-50"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="overflow-y-auto custom-scrollbar flex-1 pr-1 space-y-5 pb-2">
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    id="photo-upload-modal-input" 
                                    multiple
                                    disabled={isUploading}
                                    onChange={(e) => {
                                        if (e.target.files && e.target.files.length > 0) {
                                            setUploadFiles(Array.from(e.target.files));
                                        }
                                    }} 
                                />
                                
                                <label htmlFor="photo-upload-modal-input" className={`flex items-center justify-center gap-3 border-2 border-dashed border-white/10 rounded-2xl py-3.5 px-4 transition-all ${isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-sky-500 hover:bg-sky-500/5 cursor-pointer'}`}>
                                    {uploadFiles.length > 0 ? (
                                        <div className="flex items-center gap-2 text-center">
                                            <ImageIcon className="w-5 h-5 text-sky-400 shrink-0 animate-pulse" />
                                            <p className="text-xs font-bold text-slate-200 truncate max-w-[200px]">선택된 사진: {uploadFiles.length}장</p>
                                            <span className="text-[10px] text-slate-500">({(uploadFiles.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(2)} MB)</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-slate-400">
                                            <Camera className="w-5 h-5 text-sky-400 shrink-0" />
                                            <span className="text-xs font-bold text-slate-200">사진 촬영 또는 파일 선택</span>
                                            <span className="text-[10px] text-slate-500">(터치하여 선택)</span>
                                        </div>
                                    )}
                                </label>

                                <div className="space-y-4 pt-1">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="text-xs text-slate-500 font-bold ml-1 block">컨테이너 번호</label>
                                            <input 
                                                value={uploadCntrNo} 
                                                onChange={e => setUploadCntrNo(e.target.value)}
                                                disabled={isUploading}
                                                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2.5 text-sm outline-none focus:border-sky-500 transition-colors uppercase font-bold text-slate-200 disabled:opacity-50"
                                                placeholder="컨테이너 번호 입력"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs text-slate-500 font-bold ml-1 block">작업 소요시간 (분)</label>
                                            <input 
                                                type="number"
                                                min={1}
                                                max={300}
                                                value={uploadDurationMinutes} 
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    if (val === '') {
                                                        setUploadDurationMinutes('');
                                                    } else {
                                                        const num = parseInt(val, 10);
                                                        setUploadDurationMinutes(isNaN(num) ? '' : num);
                                                    }
                                                }}
                                                disabled={isUploading}
                                                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2.5 text-sm outline-none focus:border-sky-500 transition-colors font-bold text-emerald-400 disabled:opacity-50"
                                                placeholder="소요 분 (기본 45분)"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-xs text-slate-500 font-bold ml-1 block">작업자 메모 (작업시간 지연사유 등)</label>
                                        <textarea 
                                            rows={2}
                                            value={uploadRemark} 
                                            onChange={e => setUploadRemark(e.target.value)}
                                            disabled={isUploading}
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl p-3 text-xs outline-none focus:border-sky-500 transition-colors disabled:opacity-50 text-slate-200 resize-none"
                                            placeholder="작업시간 지연사유 기재바람"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-4 shrink-0">
                                <button 
                                    disabled={isUploading}
                                    onClick={() => setUploadJob(null)} 
                                    className="flex-1 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 font-bold text-sm transition-all disabled:opacity-50"
                                >
                                    취소
                                </button>
                                <button 
                                    onClick={handlePhotoUpload} 
                                    disabled={isUploading || (uploadFiles.length === 0 && (!uploadJob?.photo_count || uploadJob.photo_count === 0))}
                                    className="flex-2 py-4 px-8 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-black text-sm transition-all shadow-lg shadow-sky-500/20 disabled:opacity-50 disabled:hover:bg-sky-500"
                                >
                                    {isUploading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {uploadProgressText || "처리 중..."}
                                        </span>
                                    ) : (
                                        <span className="flex items-center justify-center gap-2">
                                            <Upload className="w-4 h-4" />
                                            {uploadFiles.length > 0 ? "사진 저장하기" : (uploadJob?.photo_count && uploadJob.photo_count > 0 ? "작업시간/메모 수정 저장" : "사진 저장하기")}
                                        </span>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Work Report Modal */}
            <AnimatePresence>
                {isReportOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            exit={{ opacity: 0 }} 
                            onClick={() => setIsReportOpen(false)} 
                            className="absolute inset-0 bg-black/70 backdrop-blur-md" 
                        />
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0, y: 20 }} 
                            animate={{ scale: 1, opacity: 1, y: 0 }} 
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative w-full max-w-7xl bg-[#0f111a] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden p-6 md:p-8 z-10 max-h-[90vh] flex flex-col"
                        >
                            <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-emerald-500/10 rounded-2xl">
                                        <FileText className="w-6 h-6 text-emerald-400" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-white">{isAdmin ? "작업 완료 보고서" : `${user.teamName || ''} 작업 내역`}</h2>
                                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Work Summary Report</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setIsReportOpen(false)}
                                    className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-all cursor-pointer"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Date Selector inside Modal */}
                            {isAdmin && (<div className="flex flex-wrap items-center gap-3 p-4 mb-4 bg-white/5 border border-white/5 rounded-2xl shrink-0">
                                <span className="text-xs font-bold text-slate-400">조회 기간 설정:</span>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="date"
                                        value={reportStartDate}
                                        onChange={(e) => setReportStartDate(e.target.value)}
                                        className="bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 transition-all font-bold cursor-pointer"
                                    />
                                    <span className="text-xs text-slate-500 font-bold">~</span>
                                    <input 
                                        type="date"
                                        value={reportEndDate}
                                        onChange={(e) => setReportEndDate(e.target.value)}
                                        className="bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 transition-all font-bold cursor-pointer"
                                    />
                                </div>
                                <button
                                    onClick={handleRegenerateReport}
                                    className="ml-auto px-4 py-1.5 bg-emerald-500 text-black hover:bg-emerald-400 text-xs font-black rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                                >
                                    <RotateCw className="w-3.5 h-3.5" />
                                    보고서 조회
                                </button>
                            </div>)}

                            <div className="flex-1 overflow-y-auto min-h-[350px] max-h-[60vh] bg-black/50 border border-white/5 rounded-2xl p-6 custom-scrollbar">
                                {isReportGenerating ? (
                                    <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
                                        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                                        <p className="text-xs font-bold">보고서를 생성하는 중입니다...</p>
                                    </div>
                                ) : reportData && reportData.length > 0 ? (
                                    isAdmin ? (
                                    <div className="space-y-8">
                                        {reportData.map((dateGroup: any) => {
                                            const totalCntr = dateGroup.uploaders.reduce((sum: number, u: any) => sum + u.containers.length, 0);
                                            const dayNum = parseInt(dateGroup.dateStr.split('-')[2]);
                                            return (
                                                <div key={dateGroup.dateStr} className="bg-[#121422]/50 border border-white/5 rounded-3xl p-6">
                                                    <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-5">
                                                        <h3 className="text-sm font-black text-sky-400 flex items-center gap-2">
                                                            <Calendar className="w-4 h-4 text-sky-400 animate-pulse" />
                                                            {dateGroup.dateStr} 작업 분량
                                                        </h3>
                                                        <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                                                            총합계: {totalCntr}개 작업완료
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
                                                        {dateGroup.uploaders.map((upGroup: any) => (
                                                            <div key={upGroup.teamName ?? upGroup.uploaderName} className="bg-[#1a1d2e]/40 border border-white/5 rounded-2xl p-4 flex flex-col gap-4 max-h-[45vh] overflow-y-auto custom-scrollbar">
                                                                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                                                                    <span className="text-xs font-black text-white flex items-center gap-1.5">
                                                                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                                                        {upGroup.teamName ?? upGroup.uploaderName}
                                                                    </span>
                                                                    <span className="text-[10px] font-bold text-slate-500">합계 {upGroup.containers.length}개</span>
                                                                </div>
                                                                <div className="space-y-3">
                                                                    {upGroup.containers.map((cntr: any) => {
                                                                        const totalQty = cntr.products.reduce((sum: number, p: any) => sum + p.qty, 0);
                                                                        return (
                                                                            <div key={cntr.cntrNo} className="bg-white/5 border border-white/5 rounded-xl p-3 hover:bg-white/10 transition-all">
                                                                                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                                                                                    <span className="text-[11px] font-black text-slate-200 truncate uppercase">{cntr.cntrNo}</span>
                                                                                    {cntr.startTimeStr && cntr.endTimeStr && (
                                                                                        <span className="text-sky-300 font-black text-[10px] bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20 shrink-0">
                                                                                            {cntr.durationMinutes || 45}분 ({cntr.startTimeStr}~{cntr.endTimeStr})
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <div className="text-[10px] text-slate-400 font-bold mb-2">
                                                                                    {cntr.products.length}모델, {totalQty.toLocaleString()}개
                                                                                </div>
                                                                                {cntr.remark && cntr.remark.trim() && (
                                                                                    <div className="text-[10px] text-amber-300 font-bold bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg mb-2 flex items-center gap-1.5">
                                                                                        <span className="shrink-0 text-amber-400">💬</span>
                                                                                        <span className="truncate">지연사유: {cntr.remark.trim()}</span>
                                                                                    </div>
                                                                                )}
                                                                                <div className="space-y-1 pl-1.5 border-l border-white/5">
                                                                                    {cntr.products.map((p: any, idx: number) => (
                                                                                        <div key={idx} className="text-[10px] text-slate-500 font-bold truncate">
                                                                                            - [{p.division}] {p.name} {p.qty.toLocaleString()}개
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    ) : (
                                    /* 근무자 간소화 뷰 */
                                    <div className="space-y-3">
                                        {reportData.flatMap((dateGroup: any) =>
                                            dateGroup.uploaders.flatMap((upGroup: any) =>
                                                upGroup.containers.map((cntr: any) => {
                                                    const totalQty = cntr.products.reduce((sum: number, p: any) => sum + p.qty, 0);
                                                    return (
                                                        <div key={cntr.cntrNo} className="bg-white/5 border border-white/5 rounded-2xl p-4 hover:bg-white/10 transition-all">
                                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                                <span className="text-[13px] font-black text-slate-100 uppercase">{cntr.cntrNo}</span>
                                                                {cntr.startTimeStr && cntr.endTimeStr && (
                                                                    <span className="text-sky-300 font-black text-[11px] bg-sky-500/10 px-2 py-0.5 rounded-lg border border-sky-500/20 shrink-0">
                                                                        {cntr.durationMinutes || 45}분 ({cntr.startTimeStr}~{cntr.endTimeStr})
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-[11px] text-slate-400 font-bold mb-1">
                                                                {cntr.products.length}모델, {totalQty.toLocaleString()}개
                                                            </div>
                                                            {cntr.remark && cntr.remark.trim() && (
                                                                <div className="text-[11px] text-amber-300 font-bold bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg mt-2 flex items-center gap-1.5">
                                                                    <span className="shrink-0 text-amber-400">💬</span>
                                                                    <span>지연사유: {cntr.remark.trim()}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )
                                        )}
                                    </div>
                                    )
                                ) : (
                                    <div className="font-mono text-xs md:text-sm leading-relaxed text-slate-200 select-all whitespace-pre-wrap">
                                        {reportText}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2.5 mt-6 shrink-0">
                                {isAdmin && (<button
                                    onClick={handleCopyReport}
                                    disabled={isReportGenerating || !reportText}
                                    className={`flex-1 py-3.5 px-4 rounded-2xl font-bold text-xs md:text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer ${
                                        isCopied
                                            ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                                            : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500 hover:text-white'
                                    }`}
                                >
                                    {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    {isCopied ? '복사 완료!' : '📋 1초 텍스트 복사'}
                                </button>)}

                                {isAdmin && (
                                <button
                                    onClick={handleDownloadReport}
                                    disabled={isReportGenerating || !reportText}
                                    className="py-3.5 px-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 hover:text-white font-bold text-xs md:text-sm transition-all flex items-center gap-2 cursor-pointer"
                                >
                                    <Download className="w-4 h-4" />
                                    .txt 파일 저장
                                </button>
                                )}

                                <button
                                    onClick={() => setIsReportOpen(false)}
                                    className="py-3.5 px-5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 font-bold text-xs md:text-sm transition-all cursor-pointer"
                                >
                                    닫기
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <PhotoGallery user={user} isOpen={isGalleryOpen} onClose={() => { setIsGalleryOpen(false); refreshJobs(); loadTeamProgress(); }} />
        </>
    );
}

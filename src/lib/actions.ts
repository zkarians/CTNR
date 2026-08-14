'use server';

import * as teamActions from './actions/teamActions';
import * as jobActions from './actions/jobActions';
import * as progressActions from './actions/progressActions';
import * as userActions from './actions/userActions';
import * as syncActions from './actions/syncActions';
import * as reportActions from './actions/reportActions';

export type { TeamWorkProgress } from './actions/progressActions';

// Team Actions
export async function fetchTeams() { return teamActions.fetchTeams(); }
export async function createTeam(name: string) { return teamActions.createTeam(name); }
export async function updateTeam(id: number, name: string) { return teamActions.updateTeam(id, name); }
export async function deleteTeam(id: number) { return teamActions.deleteTeam(id); }
export async function selectTeam(teamId: number) { return teamActions.selectTeam(teamId); }

// Job Actions
export async function fetchJobs(filters?: Parameters<typeof jobActions.fetchJobs>[0]) { return jobActions.fetchJobs(filters); }
export async function searchProducts(query: string) { return jobActions.searchProducts(query); }
export async function fetchProductsByJob(jobId: number) { return jobActions.fetchProductsByJob(jobId); }
export async function deleteContainerResult(jobId: string, prodName: string) { return jobActions.deleteContainerResult(jobId, prodName); }

// Progress Actions
export async function fetchTeamWorkProgress(targetWorkDate?: string) { return progressActions.fetchTeamWorkProgress(targetWorkDate); }
export async function updateContainerWorkDuration(jobId: number, cntrNo: string, durationMinutes: number, remark?: string, emptyBoxes?: { name: string; qty: number }[]) {
    return progressActions.updateContainerWorkDuration(jobId, cntrNo, durationMinutes, remark, emptyBoxes);
}
export async function updateContainerAdminComment(cntrNo: string, comment: string, workDate?: string) {
    return progressActions.updateContainerAdminComment(cntrNo, comment, workDate);
}
export async function resetTeamWorkProgress(actionType?: 'COMPLETE_RESET' | 'TRASH_RESET', targetDateStr?: string) {
    return progressActions.resetTeamWorkProgress(actionType, targetDateStr);
}

// User Actions
export async function getDbConfig() { return userActions.getDbConfig(); }
export async function updateDbConfig(config: Parameters<typeof userActions.updateDbConfig>[0]) { return userActions.updateDbConfig(config); }
export async function updatePassword(currentPassword: string, newPassword: string) { return userActions.updatePassword(currentPassword, newPassword); }
export async function fetchUsers() { return userActions.fetchUsers(); }
export async function fetchAllUsers() { return userActions.fetchAllUsers(); }
export async function getAllUsers() { return userActions.getAllUsers(); }
export async function createUserAccount(data: Parameters<typeof userActions.createUserAccount>[0]) { return userActions.createUserAccount(data); }
export async function updateUserAccount(id: string, data: Parameters<typeof userActions.updateUserAccount>[1]) { return userActions.updateUserAccount(id, data); }
export async function deleteUserAccount(id: string) { return userActions.deleteUserAccount(id); }
export async function deleteMultipleUserAccounts(ids: string[]) { return userActions.deleteMultipleUserAccounts(ids); }

// Sync Actions
export async function exportDatabaseDump() { return syncActions.exportDatabaseDump(); }
export async function restoreDatabaseDump(dumpData: any) { return syncActions.restoreDatabaseDump(dumpData); }
export async function getAutoSyncConfig() { return syncActions.getAutoSyncConfig(); }
export async function updateAutoSyncConfig(enabled: boolean) { return syncActions.updateAutoSyncConfig(enabled); }
export async function getAutoGdriveSyncConfig() { return syncActions.getAutoGdriveSyncConfig(); }
export async function updateAutoGdriveSyncConfig(enabled: boolean) { return syncActions.updateAutoGdriveSyncConfig(enabled); }
export async function triggerManualBackupAndSync() { return syncActions.triggerManualBackupAndSync(); }

// Report Actions
export async function generateWorkReport(filters: Parameters<typeof reportActions.generateWorkReport>[0]) { return reportActions.generateWorkReport(filters); }
export async function saveDailyWorkReport(params: Parameters<typeof reportActions.saveDailyWorkReport>[0]) { return reportActions.saveDailyWorkReport(params); }
export async function getSavedDailyWorkReport(workDate: string) { return reportActions.getSavedDailyWorkReport(workDate); }
export async function addManualReportEntry(params: Parameters<typeof reportActions.addManualReportEntry>[0]) { return reportActions.addManualReportEntry(params); }
export async function deleteManualReportEntry(id: number) { return reportActions.deleteManualReportEntry(id); }
export async function updateManualReportEntry(id: number, params: Parameters<typeof reportActions.updateManualReportEntry>[1]) { return reportActions.updateManualReportEntry(id, params); }

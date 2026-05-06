'use client';

import { useState, useEffect, useMemo } from 'react';
import { authFetch } from '@/lib/api/authFetch';
import { fetchActivityLogs, postComment, deleteComment, ActivityLogItem, ActivityFilter } from '@/lib/api/activity';
import { useAuthStore } from '@/lib/authStore';
import { parseLocalDate, formatLogbookDate } from './utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const ACTIVITY_ITEMS_PER_PAGE = 10;

function dedupeLogbooks(logbooks: any[]): any[] {
  const statusPriority: Record<string, number> = { PUBLISHED: 3, DRAFT: 2, SUPERSEDED: 1 };
  const byDate = new Map<string, { logbook: any; versionCount: number }>();

  for (const l of logbooks) {
    const dateKey = new Date(l.date).toISOString().split('T')[0];
    const existing = byDate.get(dateKey);
    const currentPriority = statusPriority[l.status] || 0;
    const existingPriority = existing ? (statusPriority[existing.logbook.status] || 0) : -1;

    if (existing) {
      existing.versionCount++;
      if (currentPriority > existingPriority) {
        existing.logbook = l;
      }
    } else {
      byDate.set(dateKey, { logbook: l, versionCount: 1 });
    }
  }

  return Array.from(byDate.values()).map(({ logbook, versionCount }) => ({
    ...logbook,
    versionCount,
  }));
}

export function useHomeData(storeId: string) {
  const { user } = useAuthStore();

  // Raw API data
  const [apiStore, setApiStore] = useState<any>(null);
  const [apiCrew, setApiCrew] = useState<any[]>([]);
  const [apiRoles, setApiRoles] = useState<any[]>([]);
  const [apiRoleFamilies, setApiRoleFamilies] = useState<any[]>([]);
  const [apiPreferences, setApiPreferences] = useState<any[]>([]);
  const [apiRuns, setApiRuns] = useState<any[]>([]);
  const [apiLogbooks, setApiLogbooks] = useState<any[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Activity log state
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('recent');
  const [activityUserFilter, setActivityUserFilter] = useState<'everyone' | 'mine'>('everyone');
  const [activityPage, setActivityPage] = useState(1);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  const [deleteConfirmLogId, setDeleteConfirmLogId] = useState<string | null>(null);

  // Initial data load
  useEffect(() => {
    async function fetchData() {
      try {
        const [storeRes, crewRes, rolesRes, roleFamiliesRes, preferencesRes, runsRes, logbooksRes] = await Promise.all([
          authFetch(`${API_URL}/stores/${storeId}`).then(r => r.ok ? r.json() : null),
          authFetch(`${API_URL}/crew?storeId=${storeId}`).then(r => r.ok ? r.json() : []),
          authFetch(`${API_URL}/roles?storeId=${storeId}`).then(r => r.ok ? r.json() : []),
          authFetch(`${API_URL}/role-families`).then(r => r.ok ? r.json() : []),
          authFetch(`${API_URL}/role-rules?constraintType=SOFT&storeId=${storeId}`).then(r => r.ok ? r.json() : []),
          authFetch(`${API_URL}/runs?storeId=${storeId}`).then(r => r.ok ? r.json() : { runs: [] }),
          authFetch(`${API_URL}/logbooks?storeId=${storeId}`).then(r => r.ok ? r.json() : { logbooks: [] }),
        ]);
        setApiStore(storeRes);
        setApiCrew(Array.isArray(crewRes) ? crewRes : []);
        setApiRoles(Array.isArray(rolesRes) ? rolesRes : []);
        setApiRoleFamilies(Array.isArray(roleFamiliesRes) ? roleFamiliesRes : []);
        setApiPreferences(Array.isArray(preferencesRes) ? preferencesRes : []);
        setApiRuns(Array.isArray(runsRes?.runs) ? runsRes.runs : []);
        setApiLogbooks(Array.isArray(logbooksRes?.logbooks) ? logbooksRes.logbooks : []);
        setDataLoaded(true);
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setDataLoaded(true);
      }
    }
    fetchData();
  }, [storeId]);

  // Activity log fetch
  useEffect(() => {
    async function loadActivity() {
      setActivityLoading(true);
      try {
        const response = await fetchActivityLogs(Number(storeId), activityFilter);
        setActivityLogs(response.logs);
      } catch (err) {
        console.error('Failed to load activity:', err);
        setActivityLogs([]);
      } finally {
        setActivityLoading(false);
      }
    }
    loadActivity();
  }, [storeId, activityFilter]);

  // Reset activity page when filter changes
  useEffect(() => {
    setActivityPage(1);
  }, [activityFilter, activityUserFilter]);

  const refreshData = async () => {
    try {
      const [storeRes, crewRes, rolesRes, roleFamiliesRes, preferencesRes, logbooksRes] = await Promise.all([
        authFetch(`${API_URL}/stores/${storeId}`).then(r => r.ok ? r.json() : null),
        authFetch(`${API_URL}/crew?storeId=${storeId}`).then(r => r.ok ? r.json() : []),
        authFetch(`${API_URL}/roles?storeId=${storeId}`).then(r => r.ok ? r.json() : []),
        authFetch(`${API_URL}/role-families`).then(r => r.ok ? r.json() : []),
        authFetch(`${API_URL}/role-rules?constraintType=SOFT&storeId=${storeId}`).then(r => r.ok ? r.json() : []),
        authFetch(`${API_URL}/logbooks?storeId=${storeId}`).then(r => r.ok ? r.json() : { logbooks: [] }),
      ]);
      setApiStore(storeRes);
      setApiCrew(Array.isArray(crewRes) ? crewRes : []);
      setApiRoles(Array.isArray(rolesRes) ? rolesRes : []);
      setApiRoleFamilies(Array.isArray(roleFamiliesRes) ? roleFamiliesRes : []);
      setApiPreferences(Array.isArray(preferencesRes) ? preferencesRes : []);
      setApiLogbooks(Array.isArray(logbooksRes?.logbooks) ? logbooksRes.logbooks : []);
    } catch (err) {
      console.error('Failed to refresh data:', err);
    }
  };

  const handleCommentSubmit = async () => {
    if (!commentText.trim() || commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      const newLog = await postComment(Number(storeId), commentText.trim());
      setActivityLogs(prev => [...prev, newLog]);
      setCommentText('');
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDeleteComment = async (logId: string) => {
    try {
      const updatedLog = await deleteComment(Number(storeId), logId);
      setActivityLogs(prev => prev.map(log => log.id === logId ? updatedLog : log));
      setDeleteConfirmLogId(null);
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  // Derived data (no search dependency — search filtering stays in the component)
  const effectiveCrew = useMemo(
    () => apiCrew.map((c: any) => ({ id: c.id, name: c.name })),
    [apiCrew]
  );

  const effectiveRoles = useMemo(
    () => apiRoles
      .map((r: any) => ({ id: String(r.id), name: r.displayName, familyId: r.familyId ? String(r.familyId) : null }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [apiRoles]
  );

  const effectiveRoleFamilies = useMemo(
    () => apiRoleFamilies
      .map((f: any) => ({ id: String(f.id), name: f.displayName || f.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [apiRoleFamilies]
  );

  const effectiveLogbooks = useMemo(
    () => dedupeLogbooks(apiLogbooks).map((l: any) => ({
      id: l.id,
      date: parseLocalDate(l.date),
      status: l.status,
      hasSuperseded: l.hasSupersededVersions || false,
      versionCount: l.versionCount,
      crewCount: l.crewCount ?? null,
      prefsMet: l.metadata?.percentMet ?? null,
      violationCount: l.violationCount ?? null,
    })),
    [apiLogbooks]
  );

  const effectiveDateEntries = useMemo(() => {
    const runsByDate = new Map<string, any[]>();
    for (const run of apiRuns) {
      const dk = new Date(run.date).toISOString().split('T')[0];
      runsByDate.set(dk, [...(runsByDate.get(dk) || []), run]);
    }

    const entries = new Map<string, any>();
    for (const l of dedupeLogbooks(apiLogbooks)) {
      const dk = new Date(l.date).toISOString().split('T')[0];
      entries.set(dk, {
        id: l.id,
        date: parseLocalDate(l.date),
        dateKey: dk,
        hasLogbook: true,
        status: l.status,
        versionCount: l.versionCount,
        crewCount: l.crewCount ?? null,
        prefsMet: l.metadata?.percentMet ?? null,
        violationCount: l.violationCount ?? null,
        runs: (runsByDate.get(dk) || []).sort((a: any, b: any) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      });
    }
    for (const [dk, runs] of Array.from(runsByDate.entries())) {
      if (!entries.has(dk)) {
        entries.set(dk, {
          id: `date:${dk}`,
          date: parseLocalDate(dk),
          dateKey: dk,
          hasLogbook: false,
          runs: [...runs].sort((a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          ),
        });
      }
    }
    return Array.from(entries.values()).sort((a: any, b: any) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [apiRuns, apiLogbooks]);

  // Activity log derived data
  const filteredActivityLogs = useMemo(
    () => (activityUserFilter === 'mine' && user
      ? activityLogs.filter(log => log.User.id === user.id)
      : activityLogs
    ).slice().reverse(),
    [activityLogs, activityUserFilter, user]
  );

  const totalActivityPages = Math.ceil(filteredActivityLogs.length / ACTIVITY_ITEMS_PER_PAGE);

  const paginatedActivityLogs = useMemo(
    () => filteredActivityLogs.slice(
      (activityPage - 1) * ACTIVITY_ITEMS_PER_PAGE,
      activityPage * ACTIVITY_ITEMS_PER_PAGE
    ),
    [filteredActivityLogs, activityPage]
  );

  return {
    // Raw API data
    apiStore, apiCrew, apiRoles, apiRoleFamilies, apiPreferences, apiRuns, apiLogbooks,
    dataLoaded,
    // Derived data
    effectiveCrew, effectiveRoles, effectiveRoleFamilies, effectiveLogbooks, effectiveDateEntries,
    // Activity
    activityLogs, activityLoading,
    activityFilter, setActivityFilter,
    activityUserFilter, setActivityUserFilter,
    activityPage, setActivityPage,
    filteredActivityLogs, totalActivityPages, paginatedActivityLogs,
    commentText, setCommentText,
    commentSubmitting,
    hoveredCommentId, setHoveredCommentId,
    deleteConfirmLogId, setDeleteConfirmLogId,
    ACTIVITY_ITEMS_PER_PAGE,
    // Actions
    refreshData,
    handleCommentSubmit,
    handleDeleteComment,
  };
}

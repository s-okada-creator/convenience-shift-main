'use client';

import { useState, useEffect, useCallback } from 'react';
import { getDay, parseISO } from 'date-fns';
import type { SessionUser } from '@/lib/auth';
import type { Store, Staff, Shift, ShiftRequirement, AvailabilityPattern } from '../types';

interface UseShiftDataProps {
  user: SessionUser;
  date: string;
  initialStoreId?: number;
}

interface UseShiftDataReturn {
  stores: Store[];
  selectedStoreId: string;
  setSelectedStoreId: (id: string) => void;
  staffList: Staff[];
  shifts: Shift[];
  requirements: ShiftRequirement[];
  availabilityMap: Map<number, AvailabilityPattern[]>;
  loading: boolean;
  dayOfWeek: number;
  fetchShifts: () => Promise<void>;
}

export function useShiftData({ user, date, initialStoreId }: UseShiftDataProps): UseShiftDataReturn {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    initialStoreId?.toString() || ''
  );
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [requirements, setRequirements] = useState<ShiftRequirement[]>([]);
  const [availabilityMap, setAvailabilityMap] = useState<Map<number, AvailabilityPattern[]>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);

  const currentDate = parseISO(date);
  const dayOfWeek = getDay(currentDate);

  const fetchStores = useCallback(async () => {
    try {
      const res = await fetch('/api/stores');
      if (res.ok) {
        const data = await res.json();
        setStores(data);
        if (!selectedStoreId && data.length > 0) {
          const defaultStore = user.storeId
            ? data.find((s: Store) => s.id === user.storeId)
            : data[0];
          setSelectedStoreId((defaultStore?.id || data[0].id).toString());
        }
      }
    } catch (error) {
      console.error('店舗取得エラー:', error);
    }
  }, [user.storeId, selectedStoreId]);

  const fetchStaff = useCallback(async () => {
    try {
      const [staffRes, availRes] = await Promise.all([
        fetch(`/api/staff?storeId=${selectedStoreId}`),
        fetch(`/api/availability?storeId=${selectedStoreId}`),
      ]);

      if (staffRes.ok) {
        const staffData = await staffRes.json();
        setStaffList(staffData);
      }

      if (availRes.ok) {
        const availData: Record<string, AvailabilityPattern[]> = await availRes.json();
        const availMap = new Map<number, AvailabilityPattern[]>();
        for (const [staffId, patterns] of Object.entries(availData)) {
          availMap.set(parseInt(staffId), patterns);
        }
        setAvailabilityMap(availMap);
      }
    } catch (error) {
      console.error('スタッフ取得エラー:', error);
    }
  }, [selectedStoreId]);

  const fetchShifts = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/shifts?storeId=${selectedStoreId}&startDate=${date}&endDate=${date}`
      );
      if (res.ok) {
        const data = await res.json();
        setShifts(data);
      }
    } catch (error) {
      console.error('シフト取得エラー:', error);
    }
  }, [selectedStoreId, date]);

  const fetchRequirements = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/shift-requirements?storeId=${selectedStoreId}&dayOfWeek=${dayOfWeek}`
      );
      if (res.ok) {
        const data = await res.json();
        setRequirements(data);
      }
    } catch (error) {
      console.error('必要人数取得エラー:', error);
    }
  }, [selectedStoreId, dayOfWeek]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStaff(), fetchShifts(), fetchRequirements()]);
    setLoading(false);
  }, [fetchStaff, fetchShifts, fetchRequirements]);

  useEffect(() => {
    // 初回マウント時に店舗一覧を取得（初期化のため必要）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    if (selectedStoreId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchData();
    }
  }, [selectedStoreId, date, fetchData]);

  return {
    stores,
    selectedStoreId,
    setSelectedStoreId,
    staffList,
    shifts,
    requirements,
    availabilityMap,
    loading,
    dayOfWeek,
    fetchShifts,
  };
}

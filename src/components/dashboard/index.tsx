'use client';

import { useEffect, useState, useMemo } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ShiftCard } from '@/components/dashboard/shift-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { startOfWeek, endOfWeek, startOfToday, isWithinInterval, addWeeks } from 'date-fns';
import type { FirebaseUser, Shift } from '@/types';

interface DashboardProps {
  user: FirebaseUser;
}

export default function Dashboard({ user }: DashboardProps) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchShifts() {
      if (!user) return;
      try {
        const shiftsCollection = collection(db, 'shifts');
        const q = query(shiftsCollection, where('userId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        const fetchedShifts: Shift[] = [];
        querySnapshot.forEach((doc) => {
          fetchedShifts.push({ id: doc.id, ...doc.data() } as Shift);
        });
        setShifts(fetchedShifts.sort((a, b) => a.date.toMillis() - b.date.toMillis()));
      } catch (error) {
        console.error("Error fetching shifts: ", error);
      } finally {
        setLoading(false);
      }
    }

    fetchShifts();
  }, [user]);

  const { todayShifts, thisWeekShifts, nextWeekShifts } = useMemo(() => {
    const today = startOfToday();
    const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 1 });
    const endOfCurrentWeek = endOfWeek(today, { weekStartsOn: 1 });
    const startOfNextWeek = addWeeks(startOfCurrentWeek, 1);
    const endOfNextWeek = addWeeks(endOfCurrentWeek, 1);

    const todayShifts = shifts.filter(s => s.date.toDate().toDateString() === today.toDateString());
    const thisWeekShifts = shifts.filter(s => isWithinInterval(s.date.toDate(), { start: startOfCurrentWeek, end: endOfCurrentWeek }));
    const nextWeekShifts = shifts.filter(s => isWithinInterval(s.date.toDate(), { start: startOfNextWeek, end: endOfNextWeek }));
    
    return { todayShifts, thisWeekShifts, nextWeekShifts };
  }, [shifts]);

  const renderShiftList = (shiftList: Shift[]) => {
    if (loading) {
      return Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-lg" />
      ));
    }
    if (shiftList.length === 0) {
      return <p className="text-muted-foreground mt-4 text-center">No shifts scheduled for this period.</p>;
    }
    return shiftList.map(shift => <ShiftCard key={shift.id} shift={shift} />);
  };
  
  return (
    <Tabs defaultValue="today" className="w-full">
      <div className="flex items-center">
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="this-week">This Week</TabsTrigger>
          <TabsTrigger value="next-week">Next Week</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="today">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {renderShiftList(todayShifts)}
        </div>
      </TabsContent>
      <TabsContent value="this-week">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {renderShiftList(thisWeekShifts)}
        </div>
      </TabsContent>
      <TabsContent value="next-week">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {renderShiftList(nextWeekShifts)}
        </div>
      </TabsContent>
    </Tabs>
  );
}

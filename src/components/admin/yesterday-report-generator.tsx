
'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Shift, UserProfile } from '@/types';
import { subDays, format, isSameDay } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getCorrectedLocalDate } from '@/lib/utils';
import { History } from 'lucide-react';

export function YesterdayReportGenerator() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const shiftsQuery = query(collection(db, 'shifts'));
    const usersQuery = query(collection(db, 'users'));

    let shiftsLoaded = false;
    let usersLoaded = false;

    const checkAllLoaded = () => {
      if (shiftsLoaded && usersLoaded) {
        setLoading(false);
      }
    };

    const unsubShifts = onSnapshot(shiftsQuery, (snapshot) => {
      setShifts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shift)));
      shiftsLoaded = true;
      checkAllLoaded();
    });

    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
      usersLoaded = true;
      checkAllLoaded();
    });

    return () => {
      unsubShifts();
      unsubUsers();
    };
  }, []);

  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach(user => map.set(user.uid, user.name));
    return map;
  }, [users]);

  const handleDownloadYesterdayReport = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const yesterday = subDays(new Date(), 1);
    const yesterdayDateString = format(yesterday, 'PPP');
    
    const yesterdayShifts = shifts.filter(s => {
      const shiftDate = getCorrectedLocalDate(s.date);
      return isSameDay(shiftDate, yesterday);
    });

    if (yesterdayShifts.length === 0) {
      toast({
        title: 'No Shifts Yesterday',
        description: `There are no shifts recorded for ${yesterdayDateString}.`,
      });
      return;
    }

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Report for Yesterday: ${yesterdayDateString}`, 14, 22);

    let lastY = 25;

    const completedShifts = yesterdayShifts.filter(s => s.status === 'completed');
    const incompleteShifts = yesterdayShifts.filter(s => s.status === 'incomplete');
    const noActionShifts = yesterdayShifts.filter(s => ['pending-confirmation', 'confirmed', 'on-site'].includes(s.status));

    const generateShiftTable = (title: string, data: Shift[], includeNotes: boolean = false) => {
      if (data.length === 0) {
        doc.setFontSize(12);
        doc.setTextColor(100);
        doc.text(`No shifts in this category.`, 14, lastY + 10);
        lastY += 15;
        return;
      }
      
      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text(title, 14, lastY + 10);
      
      const head = [['Operative', 'Task', 'Address', 'Status']];
      if (includeNotes) head[0].push('Notes');

      const body = data.map(shift => {
        const row = [
          userNameMap.get(shift.userId) || 'Unknown',
          shift.task,
          shift.address,
          shift.status.replace(/-/g, ' '),
        ];
        if (includeNotes) row.push(shift.notes || 'N/A');
        return row;
      });

      autoTable(doc, {
        startY: lastY + 14,
        head,
        body,
        theme: 'striped',
        headStyles: { fillColor: [6, 95, 212] },
      });
      lastY = (doc as any).lastAutoTable.finalY + 10;
    };

    generateShiftTable('Completed Shifts', completedShifts);
    generateShiftTable('Incomplete Shifts', incompleteShifts, true);
    generateShiftTable('Shifts with No Action Taken', noActionShifts);

    doc.save(`yesterday_report_${format(yesterday, 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Wrap-up</CardTitle>
        <CardDescription>
          Download a PDF report summarizing all of yesterday's shift activities.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
            <Skeleton className="h-10 w-full" />
        ) : (
            <Button onClick={handleDownloadYesterdayReport} className="w-full">
              <History className="mr-2" />
              Download Yesterday's Report
            </Button>
        )}
      </CardContent>
    </Card>
  );
}

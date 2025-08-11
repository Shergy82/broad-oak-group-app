
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useUserProfile } from '@/hooks/use-user-profile';
import Dashboard from '@/components/dashboard/index';
import { Header } from '@/components/layout/header';
import { Spinner } from '@/components/shared/spinner';
import { collection, onSnapshot, query, orderBy, collectionGroup, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Announcement } from '@/types';
import { UnreadAnnouncements } from '@/components/announcements/unread-announcements';

export default function DashboardPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { userProfile, loading: isProfileLoading } = useUserProfile();
  const router = useRouter();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);
  const [showAnnouncements, setShowAnnouncements] = useState(true);
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push('/login');
    }
  }, [user, isAuthLoading, router]);

  // Fetch all announcements and acknowledgements once the user is loaded
  useEffect(() => {
    if (!user || !db) {
      setLoadingAnnouncements(false);
      return;
    };

    const announcementsQuery = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsubscribeAnnouncements = onSnapshot(announcementsQuery, (snapshot) => {
      const fetchedAnnouncements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Announcement));
      setAnnouncements(fetchedAnnouncements);
    }, (error) => {
      console.error("Error fetching announcements:", error);
    });

    const acknowledgedQuery = query(collection(db, `users/${user.uid}/acknowledgedAnnouncements`));
    const unsubscribeAcknowledgements = onSnapshot(acknowledgedQuery, (snapshot) => {
        const newIds = new Set<string>();
        snapshot.forEach(doc => newIds.add(doc.id));
        setAcknowledgedIds(newIds);
        setLoadingAnnouncements(false);
    }, (error) => {
        console.error("Error fetching acknowledgements:", error);
        setLoadingAnnouncements(false);
    });


    return () => {
        unsubscribeAnnouncements();
        unsubscribeAcknowledgements();
    };
  }, [user]);

  const unreadAnnouncements = useMemo(() => {
    if (!user || loadingAnnouncements) {
      return [];
    }
    // Filter announcements the current user has not yet viewed.
    return announcements.filter(announcement => !acknowledgedIds.has(announcement.id));
  }, [announcements, user, loadingAnnouncements, acknowledgedIds]);
  
  const isLoading = isAuthLoading || isProfileLoading || loadingAnnouncements;

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // If there are unread announcements, show the modal instead of the dashboard
  if (unreadAnnouncements.length > 0 && showAnnouncements) {
    return (
        <UnreadAnnouncements 
          announcements={unreadAnnouncements} 
          user={user} 
          onClose={() => setShowAnnouncements(false)}
        />
    );
  }

  // Otherwise, show the regular dashboard
  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="flex flex-1 flex-col gap-8 p-4 md:p-8">
        <Dashboard />
      </main>
    </div>
  );
}

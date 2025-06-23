'use client';

import { createContext, useState, useEffect } from 'react';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import type { UserProfile } from '@/types';

interface UserProfileContextType {
    userProfile: UserProfile | null;
    loading: boolean;
}

export const UserProfileContext = createContext<UserProfileContextType>({
    userProfile: null,
    loading: true,
});

export function UserProfileProvider({ children }: { children: React.ReactNode }) {
    const { user, isLoading: isAuthLoading } = useAuth();
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isAuthLoading) {
            setLoading(true);
            return;
        }
        if (!user) {
            setUserProfile(null);
            setLoading(false);
            return;
        }
        if (!db) {
            setLoading(false);
            return;
        }

        const unsub = onSnapshot(doc(db, "users", user.uid), (doc) => {
            if (doc.exists()) {
                setUserProfile({ uid: doc.id, ...doc.data() } as UserProfile);
            } else {
                setUserProfile(null);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching user profile:", error);
            setUserProfile(null);
            setLoading(false);
        });

        return () => unsub();

    }, [user, isAuthLoading]);

    return (
        <UserProfileContext.Provider value={{ userProfile, loading }}>
            {children}
        </UserProfileContext.Provider>
    );
}

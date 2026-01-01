
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Shift, UserProfile } from '@/types';
import { isToday } from 'date-fns';
import { getCorrectedLocalDate } from '@/lib/utils';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Users, Sun, Moon, MapPin, HardHat } from 'lucide-react';
import { Spinner } from '../shared/spinner';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';


interface AvailableUser {
  user: UserProfile;
  availability: 'full' | 'am' | 'pm' | 'busy';
  shiftLocation?: string;
}

const getInitials = (name?: string) => {
    if (!name) return '??';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
};

const extractLocation = (address: string | undefined): string => {
    if (!address) return '';

    const postcodeRegex = /(L|l)ondon\s+([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})/i;
    const match = address.match(postcodeRegex);

    if (match && match[0]) {
        return match[0].trim();
    }
    
    const genericPostcodeRegex = /([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})$/i;
    const genericMatch = address.match(genericPostcodeRegex);
    if (genericMatch && genericMatch[0]) {
        return genericMatch[0].trim();
    }
    
    const parts = address.split(',');
    return parts[parts.length - 1].trim();
};


const UserAvatarList = ({ users, category }: { users: AvailableUser[]; category: 'working' | 'full' | 'semi' }) => {
    
    let filteredUsers = users;
    if (category === 'working') {
        filteredUsers = users.filter(u => u.availability !== 'full');
    } else if (category === 'full') {
        filteredUsers = users.filter(u => u.availability === 'full');
    } else if (category === 'semi') {
        filteredUsers = users.filter(u => u.availability === 'am' || u.availability === 'pm');
    }

    if (filteredUsers.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center h-full min-h-[150px]">
                <Users className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">No operatives in this category.</p>
            </div>
        );
    }
    return (
        <div className="w-full rounded-md border p-4">
            <div className="flex flex-wrap gap-x-6 gap-y-4">
                {filteredUsers.map(({ user, shiftLocation, availability }) => (
                    <div key={user.uid} className="flex flex-col items-center text-center gap-2 w-24">
                        <Avatar className="h-16 w-16 text-lg">
                            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                            <p className="text-sm font-medium truncate w-full">{user.name}</p>
                            {shiftLocation && (
                                <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{extractLocation(shiftLocation)}</span>
                                </div>
                            )}
                            {availability === 'am' && <p className="text-xs font-semibold text-sky-600">AM Free</p>}
                            {availability === 'pm' && <p className="text-xs font-semibold text-orange-600">PM Free</p>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

type ActiveTab = 'working-today' | 'fully-available' | 'semi-available' | null;

export function AvailabilityOverview() {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<ActiveTab>(null);

    useEffect(() => {
        const shiftsQuery = query(collection(db, 'shifts'));
        const usersQuery = query(collection(db, 'users'));

        let shiftsLoaded = false;
        let usersLoaded = false;

        const checkAllLoaded = () => {
            if (shiftsLoaded && usersLoaded) {
                setLoading(false);
            }
        }

        const unsubShifts = onSnapshot(shiftsQuery, (snapshot) => {
            setShifts(snapshot.docs.map(doc => doc.data() as Shift));
            shiftsLoaded = true;
            checkAllLoaded();
        });

        const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
            setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)).filter(u => u.role === 'user' || u.role === 'TLO'));
            usersLoaded = true;
            checkAllLoaded();
        });

        return () => {
            unsubShifts();
            unsubUsers();
        };
    }, []);

    const todaysAvailability: AvailableUser[] = useMemo(() => {
        if (loading) return [];
        
        const todaysShifts = shifts.filter(s => isToday(getCorrectedLocalDate(s.date)));
        
        return users.map(user => {
            const userShiftsToday = todaysShifts.filter(s => s.userId === user.uid);
            
            if (userShiftsToday.length === 0) {
                return { user, availability: 'full' };
            }
            if (userShiftsToday.some(s => s.type === 'all-day') || userShiftsToday.length >= 2) {
                 return { user, availability: 'busy', shiftLocation: userShiftsToday[0].address };
            }
            if (userShiftsToday.length === 1) {
                const shift = userShiftsToday[0];
                if (shift.type === 'am') {
                    return { user, availability: 'pm', shiftLocation: shift.address };
                }
                if (shift.type === 'pm') {
                    return { user, availability: 'am', shiftLocation: shift.address };
                }
            }
            return null;
        }).filter((u): u is AvailableUser => u !== null);

    }, [loading, shifts, users]);
    
    const { workingTodayCount, fullyAvailableCount, semiAvailableCount } = useMemo(() => {
        return {
            workingTodayCount: todaysAvailability.filter(u => u.availability !== 'full').length,
            fullyAvailableCount: todaysAvailability.filter(u => u.availability === 'full').length,
            semiAvailableCount: todaysAvailability.filter(u => u.availability === 'am' || u.availability === 'pm').length,
        }
    }, [todaysAvailability]);

    const handleTabClick = (tab: ActiveTab) => {
        if (activeTab === tab) {
            setActiveTab(null); // Close if the same tab is clicked
        } else {
            setActiveTab(tab);
        }
    };

    const renderContent = () => {
        if (!activeTab) return null;
        switch (activeTab) {
            case 'working-today':
                return <UserAvatarList users={todaysAvailability} category="working" />;
            case 'fully-available':
                return <UserAvatarList users={todaysAvailability} category="full" />;
            case 'semi-available':
                return <UserAvatarList users={todaysAvailability} category="semi" />;
            default:
                return null;
        }
    };


  return (
    <Card>
      <CardHeader>
        <CardTitle>Today's Availability</CardTitle>
        <CardDescription>
          A simple overview of which operatives are available today. Click a category to view.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
            <div className="flex items-center justify-center h-48">
                <Spinner size="lg" />
            </div>
        ) : (
            <div className="w-full space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Button
                        variant={activeTab === 'working-today' ? 'default' : 'outline'}
                        onClick={() => handleTabClick('working-today')}
                        className="justify-start p-4 h-auto text-left"
                    >
                        <div className="flex items-center gap-3">
                            <HardHat />
                            <div className="flex flex-col">
                                <span className="font-semibold">Working Today</span>
                                <span className="text-2xl font-bold">{workingTodayCount}</span>
                            </div>
                        </div>
                    </Button>
                     <Button
                        variant={activeTab === 'fully-available' ? 'default' : 'outline'}
                        onClick={() => handleTabClick('fully-available')}
                        className="justify-start p-4 h-auto text-left"
                    >
                         <div className="flex items-center gap-3">
                            <Sun />
                            <div className="flex flex-col">
                                <span className="font-semibold">Fully Available</span>
                                <span className="text-2xl font-bold">{fullyAvailableCount}</span>
                            </div>
                        </div>
                    </Button>
                    <Button
                        variant={activeTab === 'semi-available' ? 'default' : 'outline'}
                        onClick={() => handleTabClick('semi-available')}
                        className="justify-start p-4 h-auto text-left"
                    >
                         <div className="flex items-center gap-3">
                            <Moon />
                             <div className="flex flex-col">
                                <span className="font-semibold">Semi-Available</span>
                                <span className="text-2xl font-bold">{semiAvailableCount}</span>
                            </div>
                        </div>
                    </Button>
                </div>
                
                <div className="pt-4 transition-all duration-300 ease-in-out">
                    {renderContent()}
                </div>
            </div>
        )}
      </CardContent>
    </Card>
  );
}


'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Shift, UserProfile } from '@/types';
import { isToday } from 'date-fns';
import { getCorrectedLocalDate } from '@/lib/utils';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Skeleton } from '../ui/skeleton';
import { Users, Sun, Moon, MapPin } from 'lucide-react';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';


interface AvailableUser {
  user: UserProfile;
  availability: 'full' | 'am' | 'pm';
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

    // Prioritize postcode if present
    const postcodeRegex = /(L|l)ondon\s+([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})/i;
    const match = address.match(postcodeRegex);

    if (match && match[0]) {
        return match[0].trim();
    }
    
    // Fallback for just a postcode if "London" isn't there
    const genericPostcodeRegex = /([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})$/i;
    const genericMatch = address.match(genericPostcodeRegex);
    if (genericMatch && genericMatch[0]) {
        return genericMatch[0].trim();
    }
    
    // Fallback to the last part of the address if no postcode found
    const parts = address.split(',');
    return parts[parts.length - 1].trim();
};


const AvailabilityList = ({ title, users, icon: Icon, color }: { title: string, users: AvailableUser[], icon: React.ElementType, color: string }) => {
    if (users.length === 0) return null;
    return (
        <div>
            <h4 className={`font-semibold mb-3 flex items-center gap-2 ${color}`}>
                <Icon className="h-5 w-5" />
                {title} ({users.length})
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                <TooltipProvider>
                    {users.map(({ user, shiftLocation }) => (
                        <div key={user.uid} className="flex flex-col items-center text-center gap-2">
                             <Tooltip>
                                <TooltipTrigger asChild>
                                    <Avatar>
                                        <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                                    </Avatar>
                                </TooltipTrigger>
                                {shiftLocation && (
                                <TooltipContent>
                                    <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> Shift at {extractLocation(shiftLocation)}</p>
                                </TooltipContent>
                                )}
                            </Tooltip>
                            <p className="text-xs font-medium">{user.name}</p>
                        </div>
                    ))}
                </TooltipProvider>
            </div>
        </div>
    )
}

export function AvailabilityOverview() {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);

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

    const todaysAvailability = useMemo((): AvailableUser[] => {
        if (loading) return [];
        
        const todaysShifts = shifts.filter(s => isToday(getCorrectedLocalDate(s.date)));
        
        return users.map(user => {
            const userShiftsToday = todaysShifts.filter(s => s.userId === user.uid);
            
            if (userShiftsToday.length === 0) {
                return { user, availability: 'full' };
            }
            if (userShiftsToday.some(s => s.type === 'all-day')) {
                return null;
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
            // If user has 2+ shifts (one am, one pm), they are not available
            return null;
        }).filter((u): u is AvailableUser => u !== null);

    }, [loading, shifts, users]);

    const fullyAvailable = useMemo(() => todaysAvailability.filter(u => u.availability === 'full'), [todaysAvailability]);
    const amAvailable = useMemo(() => todaysAvailability.filter(u => u.availability === 'am'), [todaysAvailability]);
    const pmAvailable = useMemo(() => todaysAvailability.filter(u => u.availability === 'pm'), [todaysAvailability]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today's Availability</CardTitle>
        <CardDescription>
          A simple overview of which operatives are available today. Hover over an avatar for location info.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
            <div className="space-y-4">
                <Skeleton className="h-8 w-1/4" />
                <div className="grid grid-cols-5 gap-4">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                </div>
            </div>
        ) : todaysAvailability.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center h-48">
              <Users className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No Operatives Available Today</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                All operatives are scheduled for the full day.
              </p>
            </div>
        ) : (
            <div className="space-y-8">
                <AvailabilityList title="Fully Available" users={fullyAvailable} icon={Users} color="text-green-600" />
                <AvailabilityList title="AM Available" users={amAvailable} icon={Sun} color="text-sky-600" />
                <AvailabilityList title="PM Available" users={pmAvailable} icon={Moon} color="text-orange-600" />
            </div>
        )}
      </CardContent>
    </Card>
  );
}

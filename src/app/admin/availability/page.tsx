
'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays, format, startOfDay, isSameDay, eachDayOfInterval, isBefore, subDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Shift, UserProfile } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar as CalendarIcon, Users, UserCheck, Filter, ChevronDown, Check, Clock, Sun, Moon, MapPin, X, CheckCircle, XCircle } from 'lucide-react';
import { getCorrectedLocalDate } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

type Role = 'user' | 'admin' | 'owner';

interface DayAvailability {
    date: Date;
    type: 'full' | 'am' | 'pm' | 'busy';
    shiftLocation?: string;
}

interface AvailableUser {
  user: UserProfile;
  availability: 'full' | 'partial';
  dayStates: DayAvailability[];
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

export default function AvailabilityPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
      from: startOfDay(new Date()),
      to: startOfDay(new Date()),
  });
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedRoles, setSelectedRoles] = useState<Set<Role>>(new Set(['user', 'admin', 'owner']));
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isUserFilterApplied, setIsUserFilterApplied] = useState(false);
  const [locationFilter, setLocationFilter] = useState('');
  const [viewMode, setViewMode] = useState<'detailed' | 'simple'>('detailed');


  useEffect(() => {
    setLoading(true);
    let shiftsLoaded = false;
    let usersLoaded = false;

    const checkAllDataLoaded = () => {
        if (shiftsLoaded && usersLoaded) {
            setLoading(false);
        }
    };
    
    const shiftsQuery = query(collection(db, 'shifts'));
    const unsubShifts = onSnapshot(shiftsQuery, (snapshot) => {
        setAllShifts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shift)));
        shiftsLoaded = true;
        checkAllDataLoaded();
    }, (err) => {
        console.error("Error fetching shifts:", err);
        shiftsLoaded = true;
        checkAllDataLoaded();
    });

    const usersQuery = query(collection(db, 'users'));
    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
        const fetchedUsers = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
        setAllUsers(fetchedUsers.sort((a,b) => a.name.localeCompare(b.name)));
        setSelectedUserIds(new Set(fetchedUsers.map(u => u.uid)));
        usersLoaded = true;
        checkAllDataLoaded();
    }, (err) => {
        console.error("Error fetching users:", err);
        usersLoaded = true;
        checkAllDataLoaded();
    });

    return () => {
        unsubShifts();
        unsubUsers();
    };
  }, []);

  const handleRoleToggle = (role: Role) => {
      setSelectedRoles(prev => {
          const newRoles = new Set(prev);
          if (newRoles.has(role)) {
              newRoles.delete(role);
          } else {
              newRoles.add(role);
          }
          return newRoles;
      });
  };

  const handleUserToggle = (userId: string) => {
      setSelectedUserIds(prev => {
          const newUserIds = new Set(prev);
          if (newUserIds.has(userId)) {
              newUserIds.delete(userId);
          } else {
              newUserIds.add(userId);
          }
          setIsUserFilterApplied(true);
          return newUserIds;
      });
  };

  useEffect(() => {
    if (!isUserFilterApplied) {
        const userIdsInSelectedRoles = allUsers
            .filter(u => selectedRoles.has(u.role as Role))
            .map(u => u.uid);
        setSelectedUserIds(new Set(userIdsInSelectedRoles));
    }
  }, [selectedRoles, allUsers, isUserFilterApplied]);

  const availableUsers: AvailableUser[] = useMemo(() => {
    if (!dateRange?.from || allUsers.length === 0) {
      return [];
    }
  
    const start = startOfDay(dateRange.from);
    const end = dateRange.to ? startOfDay(dateRange.to) : start;
    const intervalDays = eachDayOfInterval({ start, end });
  
    const usersToConsider = allUsers.filter(
      (user) =>
        selectedRoles.has(user.role as Role) && selectedUserIds.has(user.uid)
    );
  
    return usersToConsider
      .map((user): AvailableUser | null => {
        const userShiftsInRange = allShifts.filter(shift =>
            shift.userId === user.uid && 
            isBefore(startOfDay(getCorrectedLocalDate(shift.date)), addDays(end, 1)) &&
            isBefore(subDays(start, 1), startOfDay(getCorrectedLocalDate(shift.date)))
        );

        // Location Filter Logic
        const lowercasedFilter = locationFilter.trim().toLowerCase();
        if (lowercasedFilter && userShiftsInRange.length > 0) {
            const hasMatchingShift = userShiftsInRange.some(shift => 
                shift.address.toLowerCase().includes(lowercasedFilter)
            );
            if (!hasMatchingShift) {
                // If user has shifts but none match the location, filter them out.
                // We keep fully available users regardless of location.
                return null;
            }
        } else if (lowercasedFilter && userShiftsInRange.length === 0) {
             // If filter is active but user has no shifts, they are still "fully available"
             // and should be shown. So we don't filter them here.
        }

  
        const dayStates = intervalDays.map((day): DayAvailability => {
            const shiftsOnDay = userShiftsInRange.filter(shift => isSameDay(getCorrectedLocalDate(shift.date), day));
            
            if (shiftsOnDay.length === 0) {
                return { date: day, type: 'full' };
            }
            if (shiftsOnDay.length === 1) {
                const shift = shiftsOnDay[0];
                if (shift.type === 'am') return { date: day, type: 'pm', shiftLocation: shift.address };
                if (shift.type === 'pm') return { date: day, type: 'am', shiftLocation: shift.address };
            }
            // Busy if all-day or multiple shifts
            return { date: day, type: 'busy' };
        });
  
        const isFullyAvailable = dayStates.every(d => d.type === 'full');
        if (isFullyAvailable) {
            // If location filter is on, and user has no shifts, they are still available.
            return { user, availability: 'full', dayStates: [] };
        }
  
        const isPartiallyAvailable = dayStates.some(d => d.type !== 'busy');
        if (isPartiallyAvailable) {
            return { user, availability: 'partial', dayStates };
        }
        
        // If a location filter is applied, and the user is busy every day,
        // we still might want to show them if their busy shifts match the location.
        // The logic above already handles filtering them *out* if they *don't* match.
        // So, if we reach here, they are busy but at least one shift matches the location.
        if (lowercasedFilter) {
            return { user, availability: 'partial', dayStates };
        }

        return null;
      })
      .filter((u): u is AvailableUser => u !== null);
      
  }, [dateRange, allShifts, allUsers, selectedRoles, selectedUserIds, locationFilter]);
  

  const selectedPeriodText = () => {
    if (!dateRange?.from) return 'No date selected';
    const start = format(dateRange.from, 'PPP');
    if (!dateRange.to || isSameDay(dateRange.from, dateRange.to)) {
        return `for ${start}`;
    }
    const end = format(dateRange.to, 'PPP');
    return `from ${start} to ${end}`;
  }
  
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
            <div>
                <CardTitle>Operative Availability</CardTitle>
                <CardDescription>
                  Select a date or a date range to view which operatives are available.
                </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
                <Label htmlFor="view-mode-toggle">Simple View</Label>
                <Switch
                    id="view-mode-toggle"
                    checked={viewMode === 'simple'}
                    onCheckedChange={(checked) => setViewMode(checked ? 'simple' : 'detailed')}
                />
            </div>
        </div>
      </CardHeader>
      <CardContent className={`grid grid-cols-1 ${viewMode === 'detailed' ? 'md:grid-cols-3' : 'md:grid-cols-1'} gap-8`}>
        <div className="flex justify-center">
             <Calendar
                mode="range"
                selected={dateRange}
                onSelect={(range) => {
                    if (range?.from && range.to && isBefore(range.to, range.from)) {
                        setDateRange({ from: range.to, to: range.from });
                    } else {
                        setDateRange(range);
                    }
                }}
                className="rounded-md border"
                defaultMonth={dateRange?.from}
                numberOfMonths={viewMode === 'simple' ? 2 : 1}
            />
        </div>
        {viewMode === 'detailed' && (
            <div className="md:col-span-2 space-y-6">
                <Card className="bg-muted/30">
                    <CardHeader className="py-4">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        Filters
                    </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col sm:flex-row gap-6 items-start">
                    <div className="space-y-2">
                        <h4 className="font-medium text-sm">Roles</h4>
                        <div className="flex gap-4">
                        {(['user', 'admin', 'owner'] as Role[]).map(role => (
                            <div key={role} className="flex items-center space-x-2">
                            <Checkbox
                                id={`role-${role}`}
                                checked={selectedRoles.has(role)}
                                onCheckedChange={() => handleRoleToggle(role)}
                            />
                            <Label htmlFor={`role-${role}`} className="capitalize">{role}</Label>
                            </div>
                        ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <h4 className="font-medium text-sm">Users</h4>
                        <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="w-full sm:w-[250px] justify-between">
                            <span>{selectedUserIds.size} of {allUsers.length} users selected</span>
                            <ChevronDown className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                            <ScrollArea className="h-72">
                            {allUsers.map(user => (
                                <DropdownMenuCheckboxItem
                                key={user.uid}
                                checked={selectedUserIds.has(user.uid)}
                                onCheckedChange={() => handleUserToggle(user.uid)}
                                >
                                <span className="truncate">{user.name}</span>
                                </DropdownMenuCheckboxItem>
                            ))}
                            </ScrollArea>
                        </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <div className="space-y-2">
                        <h4 className="font-medium text-sm">Area / Postcode</h4>
                        <Input
                            placeholder="e.g. London, SW1..."
                            value={locationFilter}
                            onChange={(e) => setLocationFilter(e.target.value)}
                            className="w-full sm:w-[250px]"
                        />
                    </div>
                    </CardContent>
                </Card>

                {loading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-8 w-1/2" />
                        <Skeleton className="h-32 w-full" />
                    </div>
                ) : !dateRange?.from ? (
                    <Alert>
                        <CalendarIcon className="h-4 w-4" />
                        <AlertTitle>Select a Date</AlertTitle>
                        <AlertDescription>
                            Click on the calendar to select a date or drag to select a range.
                        </AlertDescription>
                    </Alert>
                ) : (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
                                <UserCheck className="text-green-600 h-5 w-5"/>
                                Available Operatives ({availableUsers.length})
                                <span className="text-sm font-normal text-muted-foreground ml-2">{selectedPeriodText()}</span>
                            </h3>
                            {availableUsers.length > 0 ? (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {availableUsers.map(({ user, availability, dayStates }) => (
                                    <div key={user.uid} className="flex items-start gap-3 p-3 border rounded-md bg-muted/50">
                                        <Avatar className="h-8 w-8">
                                            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                        <p className="text-sm font-medium">{user.name}</p>
                                        {availability === 'full' && (
                                            <Badge variant="outline" className="mt-1 border-green-500/50 bg-green-500/10 text-green-700">Fully Available</Badge>
                                        )}
                                        {availability === 'partial' && (
                                            <div className="text-xs mt-1 space-y-2">
                                                <Badge variant="outline" className="border-blue-500/50 bg-blue-500/10 text-blue-700">Partially Available</Badge>
                                                
                                                <div className="space-y-1 pt-1">
                                                    {dayStates.filter(d => d.type !== 'busy').map(d => (
                                                        <div key={d.date.toISOString()} className="flex items-center gap-2">
                                                            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                                            <span className="font-medium">{format(d.date, 'EEE, dd MMM')}:</span>
                                                            {d.type === 'full' && <span>All Day</span>}
                                                            {d.type === 'am' && <span>AM Free</span>}
                                                            {d.type === 'pm' && <span>PM Free</span>}
                                                            {d.shiftLocation && <span className="text-muted-foreground text-[10px] truncate">(Busy at {extractLocation(d.shiftLocation)})</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                                
                                                <div className="space-y-1 pt-1">
                                                    {dayStates.filter(d => d.type === 'busy').map(d => (
                                                        <div key={d.date.toISOString()} className="flex items-center gap-2 text-muted-foreground">
                                                            <XCircle className="h-3.5 w-3.5 text-destructive" />
                                                            <span className="font-medium">{format(d.date, 'EEE, dd MMM')}:</span>
                                                            <span>Unavailable</span>
                                                        </div>
                                                    ))}
                                                </div>

                                            </div>
                                        )}
                                        </div>
                                    </div>
                                ))}
                                </div>
                            ) : (
                                <Alert className="border-dashed">
                                    <Users className="h-4 w-4" />
                                    <AlertTitle>No Operatives Available</AlertTitle>
                                    <AlertDescription>
                                    No users match the current date and filter criteria.
                                    </AlertDescription>
                                </Alert>
                            )}
                        </div>
                    </div>
                )}
            </div>
        )}
      </CardContent>
    </Card>
  );
}


'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal, ShieldCheck, ShieldX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const { userProfile: currentUserProfile } = useUserProfile();
  const { toast } = useToast();

  useEffect(() => {
    if (!currentUserProfile) return;

    // Allow both 'owner' and 'admin' to view this page
    if (!['owner', 'admin'].includes(currentUserProfile.role)) {
      setLoading(false);
      return;
    }
    
    if (!db) {
      setUsers([]);
      setLoading(false);
      return;
    }
    const usersCollection = collection(db, 'users');
    const q = query(usersCollection);

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedUsers: UserProfile[] = [];
      querySnapshot.forEach((doc) => {
        fetchedUsers.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
      setUsers(fetchedUsers.sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    }, (error) => {
      console.error("Error fetching users: ", error);
      toast({
        variant: 'destructive',
        title: 'Permission Error',
        description: "Could not fetch user list. Please check Firestore security rules.",
      });
      setUsers([]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUserProfile, toast]);

  const handleRoleChange = async (userId: string, newRole: 'user' | 'admin' | 'owner') => {
    if (!db) return;
    // This check remains strict: only the owner can execute the change.
    if (currentUserProfile?.role !== 'owner') {
        toast({ variant: 'destructive', title: 'Permission Denied', description: 'Only the owner can change user roles.' });
        return;
    }
    const userDocRef = doc(db, 'users', userId);
    try {
      await updateDoc(userDocRef, { role: newRole });
      toast({
        title: 'Success',
        description: "User role updated successfully.",
      });
    } catch (error) {
      console.error("Error updating role:", error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update user role. Check Firestore security rules.',
      });
    }
  };
  
  const isRoleChangeDisabled = (targetUser: UserProfile) => {
    if (!currentUserProfile) return true;
    // Only the owner can make changes.
    if (currentUserProfile.role !== 'owner') return true;
    // Cannot change your own role
    if (currentUserProfile.uid === targetUser.uid) return true;
    // The designated owner's role cannot be changed
    if (targetUser.role === 'owner') return true;

    return false;
  }

  // Render a message for non-privileged users
  if (currentUserProfile && !['owner', 'admin'].includes(currentUserProfile.role)) {
      return (
          <Alert variant="destructive">
              <Terminal className="h-4 w-4" />
              <AlertTitle>Access Denied</AlertTitle>
              <AlertDescription>
                  You do not have the required permissions to view this page. Access is restricted to admins and the account owner.
              </AlertDescription>
          </Alert>
      );
  }

  const renderRoleCell = (user: UserProfile) => {
    // Admins can see roles, but not edit them.
    if (currentUserProfile?.role === 'admin') {
      return (
        <Badge variant={user.role === 'owner' || user.role === 'admin' ? 'default' : 'secondary'} className="capitalize">
          {user.role}
        </Badge>
      );
    }
    
    // The Owner sees the editable dropdown.
    if (currentUserProfile?.role === 'owner') {
       return (
        <Select
            defaultValue={user.role}
            onValueChange={(newRole: 'user' | 'admin') => handleRoleChange(user.uid, newRole)}
            disabled={isRoleChangeDisabled(user)}
        >
            <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
        </Select>
       );
    }
    
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
        <CardDescription>
            {currentUserProfile?.role === 'owner' 
                ? 'As the owner, you can view and assign user roles.' 
                : 'As an admin, you can view all users and their assigned roles.'
            }
        </CardDescription>
        {currentUserProfile?.role === 'admin' && (
            <Alert className="mt-4">
                <ShieldX className="h-4 w-4" />
                <AlertTitle>Read-Only Access</AlertTitle>
                <AlertDescription>
                   Only the account owner can modify user roles.
                </AlertDescription>
            </Alert>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Date Joined</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone Number</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-10 w-32" /></TableCell>
                </TableRow>
              ))
            ) : (
              users.map((user) => (
                <TableRow key={user.uid}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.createdAt?.toDate().toLocaleDateString() ?? 'N/A'}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.phoneNumber}</TableCell>
                  <TableCell>
                    {renderRoleCell(user)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

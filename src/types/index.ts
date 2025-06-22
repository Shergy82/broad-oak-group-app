import type { User } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';

export interface Shift {
  id: string;
  userId: string;
  date: Timestamp;
  type: 'am' | 'pm' | 'all-day';
  status: 'pending-confirmation' | 'confirmed' | 'completed';
}

export type FirebaseUser = User;

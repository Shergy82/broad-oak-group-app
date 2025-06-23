import type { Timestamp } from 'firebase/firestore';

export interface Shift {
  id: string;
  userId: string;
  date: Timestamp;
  type: 'am' | 'pm' | 'all-day';
  status: 'pending-confirmation' | 'confirmed' | 'completed';
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phoneNumber: string;
  role: 'user' | 'admin';
}


'use client';

import { NotificationToggle } from './notification-toggle';
import { TestNotificationSender } from './test-notification-sender';
import { VapidKeyGenerator } from './vapid-key-generator';
import { useUserProfile } from '@/hooks/use-user-profile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminPageContent() {
  const { userProfile } = useUserProfile();
  const isOwner = userProfile?.role === 'owner';

  return (
    <div className="space-y-8">
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Owner Controls</CardTitle>
            <CardDescription>
              These settings are only available to the account owner and affect the entire application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <NotificationToggle />
            <TestNotificationSender />
            <VapidKeyGenerator />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

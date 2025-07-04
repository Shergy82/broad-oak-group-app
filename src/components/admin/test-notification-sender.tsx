
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

export function TestNotificationSender() {

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send a Test Notification</CardTitle>
        <CardDescription>
          This component is used to test the push notification system.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Feature Temporarily Disabled</AlertTitle>
          <AlertDescription>
            The notification-sending functionality is currently offline to resolve a critical deployment issue. You can still manage VAPID keys and users can subscribe to notifications. The sending feature will be restored once the backend is stabilized.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

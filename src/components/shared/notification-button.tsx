
'use client';

import { usePushNotifications } from '@/hooks/use-push-notifications';
import { Button } from '../ui/button';
import { Bell, BellOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Spinner } from './spinner';

export function NotificationButton() {
  const { isSupported, isSubscribed, isSubscribing, subscribe, unsubscribe } = usePushNotifications();

  if (!isSupported) {
    return null;
  }

  const handleToggleSubscription = () => {
    if (isSubscribed) {
      unsubscribe();
    } else {
      subscribe();
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={handleToggleSubscription} disabled={isSubscribing}>
            {isSubscribing ? (
              <Spinner />
            ) : isSubscribed ? (
              <Bell className="h-5 w-5 text-accent" />
            ) : (
              <BellOff className="h-5 w-5 text-muted-foreground" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isSubscribed ? 'Unsubscribe from notifications' : 'Subscribe to notifications'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

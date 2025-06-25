'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/shared/spinner';
import { generateVapidKeysAction } from '@/app/admin/actions';

export function VapidKeyGenerator() {
  const [keys, setKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleGenerateKeys = async () => {
    setIsLoading(true);
    try {
      const newKeys = await generateVapidKeysAction();
      setKeys(newKeys);
    } catch (error) {
        console.error("Error generating VAPID keys:", error);
        toast({
            variant: 'destructive',
            title: 'Generation Failed',
            description: 'Could not generate VAPID keys on the server. Please try again.',
        });
    } finally {
        setIsLoading(false);
    }
  };
  
  const copyToClipboard = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text).then(() => {
        toast({
            title: 'Copied to Clipboard',
            description: `${keyName} has been copied.`,
        });
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        toast({
            variant: 'destructive',
            title: 'Copy Failed',
            description: 'Could not copy to clipboard. Please copy the key manually.',
        });
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Push Notification VAPID Keys</CardTitle>
        <CardDescription>
          Generate the keys required for sending push notifications. You only need to do this once.
          After generating, copy the public key into your <code>.env.local</code> file and save the private key for your server-side Firebase Function.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!keys ? (
          <Button onClick={handleGenerateKeys} disabled={isLoading}>
            {isLoading ? <Spinner /> : <><KeyRound className="mr-2" /> Generate Keys</>}
          </Button>
        ) : (
          <div className="space-y-6 rounded-lg border bg-muted/50 p-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Keys Generated Successfully</h3>
              <p className="text-sm text-muted-foreground">Follow these two steps to configure push notifications.</p>
            </div>
            <div className="space-y-2">
              <label className="font-mono text-sm font-semibold text-green-600 dark:text-green-400">Step 1: Public Key</label>
              <p className="text-xs text-muted-foreground">
                Copy this key and add it to your <code>.env.local</code> file as <code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code>.
              </p>
              <div className="flex gap-2 items-center rounded-md bg-background p-2 border">
                <pre className="text-xs font-mono overflow-x-auto flex-grow">{keys.publicKey}</pre>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(keys.publicKey, 'Public Key')}>Copy</Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="font-mono text-sm font-semibold text-orange-600 dark:text-orange-400">Step 2: Private Key</label>
               <p className="text-xs text-muted-foreground">
                Save this key securely. You will need it when you set up your Firebase Function on the server.
              </p>
              <div className="flex gap-2 items-center rounded-md bg-background p-2 border">
                <pre className="text-xs font-mono overflow-x-auto flex-grow">{keys.privateKey}</pre>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(keys.privateKey, 'Private Key')}>Copy</Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


'use client';

import { Header } from '@/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HardHat } from 'lucide-react';

export default function HealthAndSafetyDisabledPage() {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <Card>
            <CardHeader>
                <CardTitle>Feature Disabled</CardTitle>
                <CardDescription>
                  The Health & Safety Documents feature has been temporarily disabled.
                </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
                <HardHat className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">This Feature is Currently Unavailable</h3>
                <p className="mb-4 mt-2 text-sm text-muted-foreground">
                  We apologize for the inconvenience. This feature is undergoing maintenance.
                </p>
              </div>
            </CardContent>
        </Card>
      </main>
    </div>
  );
}

'use client';

import { AvailabilityOverview } from '@/components/admin/availability-overview';
import { ShiftImporter } from '@/components/admin/shift-importer';
import { useUserProfile } from '@/hooks/use-user-profile';
import { Spinner } from '@/components/shared/spinner';
import { YesterdayReportGenerator } from '@/components/admin/yesterday-report-generator';

export default function ControlPanelPage() {
  const { userProfile, loading } = useUserProfile();

  if (loading) {
    return (
      <div className="flex h-48 w-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!userProfile) {
    return null; // or some other placeholder
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <AvailabilityOverview />
        <YesterdayReportGenerator />
      </div>
      <ShiftImporter userProfile={userProfile} />
    </div>
  );
}

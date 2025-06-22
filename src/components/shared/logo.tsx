import { Building2 } from 'lucide-react';
import Link from 'next/link';

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-primary">
      <Building2 className="h-6 w-6" />
      <h1 className="text-xl font-bold text-primary">
        Broad Oak <span className="font-light">Build Live</span>
      </h1>
    </Link>
  );
}

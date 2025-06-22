import { SignupForm } from "@/components/auth/signup-form";
import { Logo } from "@/components/shared/logo";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        <SignupForm />
      </div>
    </div>
  );
}

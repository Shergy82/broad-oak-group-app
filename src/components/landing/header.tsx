import { Button } from "@/components/ui/button";
import { BotMessageSquare } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="mr-4 flex items-center">
          <BotMessageSquare className="h-6 w-6 mr-2 text-primary" />
          <span className="font-bold">LeadHub</span>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-4">
          <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
            <a href="#features" className="transition-colors hover:text-primary">Features</a>
            <a href="#testimonials" className="transition-colors hover:text-primary">Testimonials</a>
            <a href="#faq" className="transition-colors hover:text-primary">FAQ</a>
          </nav>
          <Button asChild>
            <a href="#contact">Get Started</a>
          </Button>
        </div>
      </div>
    </header>
  );
}

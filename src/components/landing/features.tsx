import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, TrendingUp, UsersRound } from "lucide-react";

const features = [
  {
    icon: <Target className="h-8 w-8 text-primary" />,
    title: "Audience Targeting",
    description: "Precisely target your ideal customer segments with advanced filtering and analytics.",
  },
  {
    icon: <TrendingUp className="h-8 w-8 text-primary" />,
    title: "Conversion Tracking",
    description: "Monitor your landing page performance and track conversions in real-time.",
  },
  {
    icon: <UsersRound className="h-8 w-8 text-primary" />,
    title: "Lead Management",
    description: "Organize and nurture your leads effectively within our intuitive CRM system.",
  },
];

export function Features() {
  return (
    <section id="features" className="py-12 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-headline font-bold">Powerful Features to Boost Your Growth</h2>
          <p className="text-lg text-muted-foreground mt-2 max-w-2xl mx-auto">
            Everything you need to turn visitors into loyal customers.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card key={index} className="text-center shadow-md hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="mx-auto bg-primary/10 p-4 rounded-full w-fit">
                  {feature.icon}
                </div>
                <CardTitle className="pt-4">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

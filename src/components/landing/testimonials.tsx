"use client";

import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const testimonials = [
  {
    id: "testimonial-1",
    name: "Sarah Doe",
    role: "Marketing Head, TechCorp",
    quote: "LeadHub has revolutionized our lead generation process. The AI headline optimizer is a game-changer!",
  },
  {
    id: "testimonial-2",
    name: "John Smith",
    role: "CEO, Innovate Ltd.",
    quote: "We've seen a 40% increase in conversions since we started using LeadHub. Highly recommended for any business looking to grow.",
  },
  {
    id: "testimonial-3",
    name: "Jane Roe",
    role: "Founder, StartupX",
    quote: "As a startup, every lead counts. LeadHub's tools are intuitive and powerful, helping us scale faster than we thought possible.",
  },
];

export function Testimonials() {
  return (
    <section id="testimonials" className="py-12 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-headline font-bold">Trusted by Businesses Worldwide</h2>
          <p className="text-lg text-muted-foreground mt-2 max-w-2xl mx-auto">
            Don't just take our word for it. Here's what our customers have to say.
          </p>
        </div>
        <Carousel
          opts={{
            align: "start",
          }}
          className="w-full max-w-4xl mx-auto"
        >
          <CarouselContent>
            {testimonials.map((testimonial) => {
              const image = PlaceHolderImages.find(p => p.id === testimonial.id);
              return (
                <CarouselItem key={testimonial.id} className="md:basis-1/2 lg:basis-1/3">
                  <div className="p-1 h-full">
                    <Card className="h-full flex flex-col shadow-md">
                      <CardContent className="p-6 flex flex-col flex-grow">
                        <p className="flex-grow text-muted-foreground mb-4">"{testimonial.quote}"</p>
                        <div className="flex items-center">
                          <Avatar>
                            {image && <AvatarImage src={image.imageUrl} alt={image.description} data-ai-hint={image.imageHint} />}
                            <AvatarFallback>{testimonial.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="ml-4">
                            <p className="font-semibold">{testimonial.name}</p>
                            <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CarouselItem>
              );
            })}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
    </section>
  );
}

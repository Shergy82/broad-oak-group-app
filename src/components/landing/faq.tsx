"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "What is LeadHub?",
    answer: "LeadHub is a comprehensive platform designed to help businesses optimize their landing pages, generate more leads, and increase conversions through powerful analytics and AI-driven tools.",
  },
  {
    question: "Who is LeadHub for?",
    answer: "LeadHub is for marketers, business owners, and agencies of all sizes who want to improve their online marketing efforts and achieve better results from their websites.",
  },
  {
    question: "How does the AI headline optimization work?",
    answer: "Our AI model, trained on vast amounts of marketing data, analyzes your product and target audience to suggest high-converting headline variations for your landing pages.",
  },
  {
    question: "Is there a free trial?",
    answer: "Yes, we offer a 14-day free trial with access to all our features. You can sign up without a credit card and see the value for yourself.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="py-12 lg:py-24">
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-headline font-bold">Frequently Asked Questions</h2>
          <p className="text-lg text-muted-foreground mt-2">
            Have questions? We've got answers.
          </p>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, index) => (
            <AccordionItem value={`item-${index}`} key={index} className="bg-background px-4 rounded-lg mb-2 shadow-sm">
              <AccordionTrigger className="text-lg text-left hover:no-underline">{faq.question}</AccordionTrigger>
              <AccordionContent className="text-base text-muted-foreground">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

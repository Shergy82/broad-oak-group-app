'use server';

/**
 * @fileOverview An AI agent that suggests alternative headlines for a landing page.
 *
 * - optimizeHeadlineWithAI - A function that takes a draft headline and returns AI-powered suggestions.
 * - OptimizeHeadlineWithAIInput - The input type for the optimizeHeadlineWithAI function.
 * - OptimizeHeadlineWithAIOutput - The return type for the optimizeHeadlineWithAI function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const OptimizeHeadlineWithAIInputSchema = z.object({
  draftHeadline: z
    .string()
    .describe('The draft headline for the landing page.'),
  productDescription: z.string().describe('A description of the product or service.'),
  targetAudience: z.string().describe('The target audience for the landing page.'),
});
export type OptimizeHeadlineWithAIInput = z.infer<
  typeof OptimizeHeadlineWithAIInputSchema
>;

const OptimizeHeadlineWithAIOutputSchema = z.object({
  suggestions: z
    .array(z.string())
    .describe('AI-powered suggestions for alternative headlines.'),
});
export type OptimizeHeadlineWithAIOutput = z.infer<
  typeof OptimizeHeadlineWithAIOutputSchema
>;

export async function optimizeHeadlineWithAI(
  input: OptimizeHeadlineWithAIInput
): Promise<OptimizeHeadlineWithAIOutput> {
  return optimizeHeadlineWithAIFlow(input);
}

const prompt = ai.definePrompt({
  name: 'optimizeHeadlinePrompt',
  input: {schema: OptimizeHeadlineWithAIInputSchema},
  output: {schema: OptimizeHeadlineWithAIOutputSchema},
  prompt: `You are a marketing expert specializing in creating high-converting landing page headlines.

  Given the following information, suggest 3 alternative headlines that are more likely to increase conversions.  Be concise and to the point.

  Draft Headline: {{{draftHeadline}}}
  Product Description: {{{productDescription}}}
  Target Audience: {{{targetAudience}}}`,
});

const optimizeHeadlineWithAIFlow = ai.defineFlow(
  {
    name: 'optimizeHeadlineWithAIFlow',
    inputSchema: OptimizeHeadlineWithAIInputSchema,
    outputSchema: OptimizeHeadlineWithAIOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

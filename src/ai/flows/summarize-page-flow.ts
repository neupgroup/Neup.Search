
'use server';
/**
 * @fileOverview An AI agent that summarizes a page's content.
 *
 * - summarizePageContent - A function that returns a summary for a given block of text.
 * - SummarizePageInput - The input type for the summarizePageContent function.
 * - SummarizePageOutput - The return type for the summarizePageContent function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizePageInputSchema = z.object({
  content: z.string().describe('The text content of the page to summarize.'),
});
export type SummarizePageInput = z.infer<typeof SummarizePageInputSchema>;

const SummarizePageOutputSchema = z.object({
    summary: z.string().describe("A concise one-paragraph summary of what the page content is about."),
});
export type SummarizePageOutput = z.infer<typeof SummarizePageOutputSchema>;


export async function summarizePageContent(input: SummarizePageInput): Promise<SummarizePageOutput> {
  return summarizePageFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizePagePrompt',
  input: {schema: SummarizePageInputSchema },
  output: {schema: SummarizePageOutputSchema},
  prompt: `Analyze the following website text content and provide a single paragraph summarizing its main purpose.

Content:
{{{content}}}
`,
});

const summarizePageFlow = ai.defineFlow(
  {
    name: 'summarizePageFlow',
    inputSchema: SummarizePageInputSchema,
    outputSchema: SummarizePageOutputSchema,
  },
  async ({ content }) => {
    const {output} = await prompt({ content });
    return output!;
  }
);

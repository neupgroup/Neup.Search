
'use server';
/**
 * @fileOverview An AI agent that summarizes a website.
 *
 * - summarizeSite - A function that returns the site name, summary, and logo URL for a given URL.
 * - SummarizeSiteInput - The input type for the summarizeSite function.
 * - SummarizeSiteOutput - The return type for the summarizeSite function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import * as cheerio from 'cheerio';
import { logError } from '@/lib/logica-logging';

const SummarizeSiteInputSchema = z.object({
  url: z.string().url().describe('The URL of the website to summarize.'),
});
export type SummarizeSiteInput = z.infer<typeof SummarizeSiteInputSchema>;

const SummarizeSiteOutputSchema = z.object({
    name: z.string().describe("The official name of the website."),
    summary: z.string().describe("A concise one-paragraph summary of what the website is about."),
    logoUrl: z.string().url().optional().describe("The absolute URL of the website's logo."),
});
export type SummarizeSiteOutput = z.infer<typeof SummarizeSiteOutputSchema>;

// Helper function to fetch and extract content
async function getPageContent(url: string) {
    try {
        const response = await fetch(url, { headers: { 'User-Agent': 'NeupBot/1.0' } });
        if (!response.ok) {
            return null;
        }
        const html = await response.text();
        const $ = cheerio.load(html);
        
        const title = $('title').text();
        const description = $('meta[name="description"]').attr('content') || "";
        const bodyText = $('body').text().replace(/\s\s+/g, ' ').substring(0, 2000); // Limit body text

        // Try to find a logo
        let logoUrl = $('link[rel="icon"]').attr('href') || 
                      $('link[rel="shortcut icon"]').attr('href') ||
                      $('meta[property="og:image"]').attr('content');

        if (logoUrl) {
            logoUrl = new URL(logoUrl, url).toString();
        }

        return {
            title,
            description,
            bodyText,
            logoUrl,
        };
    } catch (error) {
        await logError({error, url}, 'summarizeSite_getPageContent');
        return null;
    }
}


export async function summarizeSite(input: SummarizeSiteInput): Promise<SummarizeSiteOutput> {
  return summarizeSiteFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeSitePrompt',
  input: {schema: z.object({ 
      title: z.string(), 
      description: z.string(), 
      bodyText: z.string(),
      url: z.string().url(),
      logoUrl: z.string().url().optional(),
    })
  },
  output: {schema: SummarizeSiteOutputSchema},
  prompt: `Analyze the following website content to determine its name, a summary, and its logo URL.

URL: {{{url}}}
Title: {{{title}}}
Meta Description: {{{description}}}
Body Content (first 2000 chars): {{{bodyText}}}
Discovered Logo URL: {{{logoUrl}}}

Based on the information above:
1.  Determine the official name of the website. It's often in the title or a header.
2.  Provide a single paragraph summarizing the website's main purpose.
3.  If a potential logo URL was discovered (Discovered Logo URL), use it. Otherwise, deduce the most likely logo URL from the content if possible. If no logo can be found, do not return a value for the logoUrl field.
`,
});

const summarizeSiteFlow = ai.defineFlow(
  {
    name: 'summarizeSiteFlow',
    inputSchema: SummarizeSiteInputSchema,
    outputSchema: SummarizeSiteOutputSchema,
  },
  async ({ url }) => {
    const content = await getPageContent(url);
    if (!content) {
        throw new Error("Could not fetch or process the website content.");
    }
    
    const {output} = await prompt({
        url,
        title: content.title,
        description: content.description,
        bodyText: content.bodyText,
        logoUrl: content.logoUrl,
    });
    return output!;
  }
);

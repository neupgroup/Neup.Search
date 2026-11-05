

"use server"

import { answerQuestion } from "@/ai/flows/answer-question"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/logica-logging";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  description?: string;
};

function getSnippet(content: string, description: string, query: string): string {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let index = -1;
  let textToSearch = content;

  // Prefer description for snippet if it contains the query
  if(description && description.toLowerCase().includes(lowerQuery)) {
    index = description.toLowerCase().indexOf(lowerQuery);
    textToSearch = description;
  } else {
    index = lowerContent.indexOf(lowerQuery);
  }

  if (index === -1) {
    return (description || content).substring(0, 200) + "...";
  }

  const start = Math.max(0, index - 75);
  const end = Math.min(textToSearch.length, index + query.length + 75);
  
  let snippet = textToSearch.substring(start, end);

  if (start > 0) {
    snippet = "..." + snippet;
  }
  if (end < textToSearch.length) {
    snippet = snippet + "...";
  }

  const regex = new RegExp(`(${query})`, 'gi');
  snippet = snippet.replace(regex, '<mark>$1</mark>');

  return snippet;
}


async function getSearchResults(searchQuery: string): Promise<SearchResult[]> {
  if (!searchQuery) {
    return [];
  }
  try {
    const pages = await prisma.page.findMany({
      take: 1000,
      orderBy: { addedOn: "desc" },
      select: {
        url: true,
        title: true,
        description: true,
        fullContent: true,
      },
    });

    const results: { score: number; result: SearchResult }[] = [];
    const lowercasedQuery = searchQuery.toLowerCase();

    for (const p of pages) {
      const content = p.fullContent || "";
      const url = p.url || "";
      const title = p.title || url;
      const description = p.description || "";

      const lowerContent = content.toLowerCase();
      const lowerUrl = url.toLowerCase();
      const lowerTitle = title.toLowerCase();

      let score = 0;
      let matchFound = false;

      if (lowerTitle.includes(lowercasedQuery)) {
        score += 5; 
        matchFound = true;
      }
      if (lowerContent.includes(lowercasedQuery)) {
        score += 1;
        matchFound = true;
      }
       if (lowerUrl.includes(lowercasedQuery)) {
        score += 2;
        matchFound = true;
      }

      if (matchFound) {
        results.push({
          score,
          result: {
            title: title,
            url: url,
            snippet: getSnippet(content, description, searchQuery),
            description: description,
          },
        });
      }
    }

    results.sort((a, b) => b.score - a.score);

    return results.map(item => item.result).slice(0, 20);
  } catch (error) {
    await logError(error, "getSearchResults");
    return [];
  }
}

export async function performSearch(query: string): Promise<SearchResult[]> {
  return await getSearchResults(query);
}


export async function generateAnswer(query: string) {
  if (!query) {
    return { answer: null, error: null }
  }

  try {
    const searchResults = await getSearchResults(query)
    if (searchResults.length === 0) {
        return { answer: "I couldn't find any information on that topic in the indexed pages.", error: null }
    }
    const searchResultUrls = searchResults.map(r => `${r.title} (${r.url}): ${r.snippet.replace(/<mark>|<\/mark>/g, '')}`);
    const { answer } = await answerQuestion({
      question: query,
      searchResults: searchResultUrls,
    })
    return { answer, error: null }
  } catch (e: any) {
    await logError(e, "generateAnswer");
    return { answer: null, error: "Sorry, I couldn't generate an answer at this time. The AI may be offline. Please try again later." }
  }
}



"use server"

import { assist } from "@neup/logica/assist"
import { cookies } from "next/headers"
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
      orderBy: { discoveredOn: "desc" },
      select: {
        url: true,
        title: true,
        description: true,
        content: true,
      },
    });

    const results: { score: number; result: SearchResult }[] = [];
    const lowercasedQuery = searchQuery.toLowerCase();

    for (const p of pages) {
      const content = p.content || "";
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
    const sourceList = searchResults.slice(0, 12).map((result) =>
      `${result.title} (${result.url}): ${result.snippet.replace(/<mark>|<\/mark>/g, "").slice(0, 500)}`,
    ).join("\n")
    const prompt = `Answer using only these sources. Cite claims with source URLs. If they do not answer the question, say so.\nQuestion: ${query}\nSources:\n${sourceList}`
    const authAccountToken = (await cookies()).get("auth_account")?.value
    const searchAssist = assist({ authAccountToken })
    const chatResponse = await searchAssist.chats.create({ title: "Search answer" })
    if (!chatResponse.ok || !chatResponse.body.id) {
      throw new Error(chatResponse.body.error || "Could not start a Logica Assist chat.")
    }
    const messageResponse = await searchAssist.chats.messages(chatResponse.body.id).send(prompt)
    if (!messageResponse.ok || !messageResponse.body.result?.trim()) {
      throw new Error(messageResponse.body.error || "Logica Assist returned an empty answer.")
    }
    const answer = messageResponse.body.result.trim()
    return { answer, error: null }
  } catch (e: unknown) {
    await logError(e, "generateAnswer");
    return { answer: null, error: "Sorry, I couldn't generate an answer at this time. The AI may be offline. Please try again later." }
  }
}

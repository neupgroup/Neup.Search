

"use server"

import { answerQuestion } from "@/ai/flows/answer-question"
import { collection, query, where, limit, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase"

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

function getSnippet(content: string, query: string): string {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerContent.indexOf(lowerQuery);

  if (index === -1) {
    return content.substring(0, 200) + "...";
  }

  const start = Math.max(0, index - 50);
  const end = Math.min(content.length, index + query.length + 150);
  
  let snippet = content.substring(start, end);

  if (start > 0) {
    snippet = "..." + snippet;
  }
  if (end < content.length) {
    snippet = snippet + "...";
  }

  // Highlight the query term
  const regex = new RegExp(`(${query})`, 'gi');
  snippet = snippet.replace(regex, '<mark>$1</mark>');

  return snippet;
}

async function getSearchResults(searchQuery: string): Promise<SearchResult[]> {
  if (!searchQuery) {
    return [];
  }
  try {
    // This is still not a full-text search. For production, use a dedicated
    // search service like Algolia, Typesense, or Elasticsearch.
    const pagesCollection = collection(db, "pages");
    const q = query(pagesCollection, limit(1000)); 
    const querySnapshot = await getDocs(q);

    const results: SearchResult[] = [];
    const lowercasedQuery = searchQuery.toLowerCase();

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const content = data.content || "";
      const url = data.url || "";
      const title = data.title || url;

      if (content.toLowerCase().includes(lowercasedQuery) || url.toLowerCase().includes(lowercasedQuery)) {
        results.push({
          title: title,
          url: url,
          snippet: getSnippet(content, searchQuery),
        });
      }
    });

    return results.slice(0, 20); // Return top 20 results
  } catch (error) {
    console.error("Error fetching search results:", error);
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
    console.error("Error generating answer:", e)
    return { answer: null, error: "Sorry, I couldn't generate an answer at this time. The AI may be offline. Please try again later." }
  }
}

    
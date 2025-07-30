
"use server"

import { answerQuestion } from "@/ai/flows/answer-question"
import { collection, query, where, limit, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase"

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

async function getSearchResults(searchQuery: string): Promise<SearchResult[]> {
  if (!searchQuery) {
    return [];
  }
  try {
    const pagesCollection = collection(db, "pages");
    const q = query(
      pagesCollection,
      where('url', '>=', searchQuery),
      where('url', '<=', searchQuery + '\uf8ff'),
      limit(10)
    );

    const querySnapshot = await getDocs(q);
    const results: SearchResult[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      results.push({
        // For now, we'll use the URL as the title and a placeholder snippet
        title: data.url,
        url: data.url,
        snippet: `Content from ${data.url} would be displayed here.`,
      });
    });
    return results;
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
    const searchResultUrls = searchResults.map(r => `${r.title} (${r.url}): ${r.snippet}`);
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


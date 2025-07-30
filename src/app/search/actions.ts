
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
    // Firestore doesn't have a native "contains" query, so we have to fetch all
    // pages and filter them in code. This is not efficient for large datasets,
    // but it works for this prototype. For a production app, you'd use a
    // dedicated search service like Algolia or Typesense.
    const pagesCollection = collection(db, "pages");
    const q = query(pagesCollection, limit(1000)); // Get up to 1000 pages

    const querySnapshot = await getDocs(q);
    const results: SearchResult[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.url && data.url.toLowerCase().includes(searchQuery.toLowerCase())) {
        results.push({
          title: data.url, // Placeholder title
          url: data.url,
          snippet: `Content from ${data.url} would be displayed here.`, // Placeholder snippet
        });
      }
    });

    // Return the top 10 results
    return results.slice(0, 10);
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

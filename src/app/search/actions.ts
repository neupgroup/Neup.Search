"use server"

import { answerQuestion } from "@/ai/flows/answer-question"

// This is a mock function to simulate fetching search results.
// In a real application, you would use a search API like Google Search or Bing Search.
async function getSearchResults(query: string): Promise<string[]> {
  console.log(`Simulating search for: ${query}`)
  // Mock results that are relevant to a potential query.
  // The content is crafted to help the LLM generate a useful answer.
  return [
    `Next.js by Vercel is a popular open-source React framework for building server-rendered and statically generated web applications. Key features include file-system based routing, automatic code splitting, and server-side rendering (SSR), which improves performance and SEO. Source: nextjs.org`,
    `To get started with Next.js, developers can use 'create-next-app', a command-line tool that sets up a new project with a default template and all necessary configurations, enabling a quick start to development. Source: vercel.com/docs`,
    `Genkit is a powerful, open-source framework from Google designed to streamline the development of AI-powered applications. It provides tools to define and orchestrate 'flows', which are sequences of steps that can call AI models, process data, and integrate with external services. Source: firebase.google.com/docs/genkit`,
    `A core concept in Genkit is the 'flow,' which allows developers to chain together calls to different AI models, data sources, and tools. This modular approach makes it easier to build, test, and maintain complex AI logic in production environments. Source: genkit.dev`,
    `Tailwind CSS is a utility-first CSS framework for rapidly building custom user interfaces. Instead of writing custom CSS, developers use pre-defined utility classes directly in their HTML, which can significantly speed up the styling process. Source: tailwindcss.com`,
  ]
}

export async function generateAnswer(query: string) {
  if (!query) {
    return { answer: null, error: null }
  }

  try {
    const searchResults = await getSearchResults(query)
    const { answer } = await answerQuestion({
      question: query,
      searchResults,
    })
    return { answer, error: null }
  } catch (e: any) {
    console.error("Error generating answer:", e)
    return { answer: null, error: "Sorry, I couldn't generate an answer at this time. The AI may be offline. Please try again later." }
  }
}

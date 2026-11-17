// Build the page text and limits used by the page insight request.
export function getSummarizationContext(pageContent: string): string {
  return pageContent.slice(0, 12_000)
}

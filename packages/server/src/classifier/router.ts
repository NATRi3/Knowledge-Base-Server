import { chatCompletion } from '../gigachat/chat.js';

export type QueryIntent = 'factual' | 'relational' | 'analytical' | 'aggregation';
export type RetrievalStrategy = 'vector' | 'graph' | 'sql' | 'hybrid';

export interface QueryRoute {
  intent: QueryIntent;
  strategies: RetrievalStrategy[];
  rewrittenQuery?: string;
}

const ROUTING_PROMPT = `You are a query router for an enterprise knowledge base.
Analyze the user's query and determine the best retrieval strategy.

Return a JSON object with:
- intent: one of "factual", "relational", "analytical", "aggregation"
  - factual: looking for specific information (e.g., "what is the rate limiting config?")
  - relational: looking for connections between entities (e.g., "what services depend on payment-service?")
  - analytical: requires analysis across multiple sources (e.g., "how has the architecture changed?")
  - aggregation: looking for metrics/stats (e.g., "how many endpoints does service X have?")
- strategies: ordered array of retrieval methods to use, subset of ["vector", "graph", "sql", "hybrid"]
- rewrittenQuery: optionally rewrite the query for better search (clearer, more specific)

Return ONLY valid JSON.`;

export async function routeQuery(query: string): Promise<QueryRoute> {
  const response = await chatCompletion([
    { role: 'system', content: ROUTING_PROMPT },
    { role: 'user', content: query },
  ], { temperature: 0.05 });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    return JSON.parse(jsonMatch[0]) as QueryRoute;
  } catch {
    // Default to hybrid search
    return { intent: 'factual', strategies: ['vector', 'graph'] };
  }
}

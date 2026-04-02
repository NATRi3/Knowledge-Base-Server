import { chatCompletion } from '../gigachat/chat.js';

export interface ExtractedEntities {
  services: Array<{ name: string; description?: string }>;
  endpoints: Array<{ path: string; method: string; service?: string }>;
  technologies: Array<{ name: string; category?: string }>;
  teams: Array<{ name: string }>;
  relationships: Array<{
    source: string;
    target: string;
    type: 'DEPENDS_ON' | 'INTEGRATES_WITH' | 'DOCUMENTED_BY' | 'USES_TECHNOLOGY';
  }>;
}

const EXTRACTION_PROMPT = `You are an entity extractor for an enterprise knowledge base.
Extract entities and relationships from the provided content.

Return a JSON object with:
- services: array of { name, description? } — microservices, systems, applications
- endpoints: array of { path, method, service? } — API endpoints mentioned
- technologies: array of { name, category? } — tech stack items (Kafka, Redis, PostgreSQL, etc.)
- teams: array of { name } — team names mentioned
- relationships: array of { source, target, type } where type is one of:
  - DEPENDS_ON: source service depends on target service
  - INTEGRATES_WITH: source integrates with target (via API, messaging, etc.)
  - DOCUMENTED_BY: entity is documented by a specific document/page
  - USES_TECHNOLOGY: service uses a specific technology

Return ONLY valid JSON, no other text.`;

export async function extractEntities(
  title: string,
  content: string
): Promise<ExtractedEntities> {
  const truncatedContent = content.slice(0, 4000);

  const response = await chatCompletion([
    { role: 'system', content: EXTRACTION_PROMPT },
    { role: 'user', content: `Title: ${title}\n\nContent:\n${truncatedContent}` },
  ], { temperature: 0.05 });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    return JSON.parse(jsonMatch[0]) as ExtractedEntities;
  } catch {
    return { services: [], endpoints: [], technologies: [], teams: [], relationships: [] };
  }
}

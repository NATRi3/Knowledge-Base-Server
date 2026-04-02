import { chatCompletion } from '../gigachat/chat.js';

export interface ClassificationResult {
  documentType: 'api_spec' | 'architecture' | 'runbook' | 'adr' | 'meeting_notes' | 'config' | 'general';
  structuredness: 'structured' | 'semi-structured' | 'unstructured';
  relationshipDensity: 'high' | 'medium' | 'low';
  mentionedServices: string[];
  mentionedTechnologies: string[];
  storageRoute: Array<'vector' | 'graph' | 'relational'>;
}

const CLASSIFICATION_PROMPT = `You are a content classifier for an enterprise knowledge base.
Analyze the provided content and return a JSON object with the following fields:

- documentType: one of "api_spec", "architecture", "runbook", "adr", "meeting_notes", "config", "general"
- structuredness: one of "structured", "semi-structured", "unstructured"
- relationshipDensity: "high" (many references to services/APIs/systems), "medium", "low"
- mentionedServices: array of service/system names mentioned in the content
- mentionedTechnologies: array of technologies mentioned (Kafka, Redis, PostgreSQL, etc.)
- storageRoute: array of storage targets, subset of ["vector", "graph", "relational"]

Rules for storageRoute:
- Unstructured text (meeting notes, FAQ) -> ["vector"]
- Semi-structured with references (Confluence docs) -> ["vector", "graph"]
- Structured with high density (API specs, architecture) -> ["graph", "vector"]
- Structured metrics/configs -> ["relational", "vector"]
- Jira tickets -> ["graph", "relational", "vector"]

Return ONLY valid JSON, no other text.`;

export async function classifyContent(
  title: string,
  content: string,
  source: string
): Promise<ClassificationResult> {
  // For Swagger specs, use rule-based classification
  if (source === 'swagger') {
    return {
      documentType: 'api_spec',
      structuredness: 'structured',
      relationshipDensity: 'high',
      mentionedServices: [],
      mentionedTechnologies: [],
      storageRoute: ['graph', 'vector'],
    };
  }

  // For other content, use GigaChat
  const truncatedContent = content.slice(0, 4000);
  const response = await chatCompletion([
    { role: 'system', content: CLASSIFICATION_PROMPT },
    { role: 'user', content: `Title: ${title}\nSource: ${source}\n\nContent:\n${truncatedContent}` },
  ], { temperature: 0.05 });

  try {
    // Extract JSON from response (in case GigaChat wraps it in markdown)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    return JSON.parse(jsonMatch[0]) as ClassificationResult;
  } catch {
    // Fallback classification
    return {
      documentType: 'general',
      structuredness: 'unstructured',
      relationshipDensity: 'low',
      mentionedServices: [],
      mentionedTechnologies: [],
      storageRoute: ['vector'],
    };
  }
}

import { v4 as uuid } from 'uuid';
import { config } from '../config.js';
import { getDb } from '../storage/sqlite.js';
import { addNode, addEdge } from '../storage/graph.js';
import { generateEmbeddings } from '../gigachat/embeddings.js';
import { storeEmbeddings } from '../storage/vector.js';

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string | null;
    issuetype: { name: string };
    status: { name: string };
    priority?: { name: string };
    assignee?: { displayName: string } | null;
    reporter?: { displayName: string } | null;
    labels?: string[];
    components?: Array<{ name: string }>;
    sprint?: { name: string } | null;
    customfield_10014?: string; // epic link (varies by Jira config)
    issuelinks?: Array<{
      type: { name: string; inward: string; outward: string };
      inwardIssue?: { key: string };
      outwardIssue?: { key: string };
    }>;
  };
}

interface SearchResponse {
  issues: JiraIssue[];
  total: number;
  startAt: number;
  maxResults: number;
}

function mapIssueType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('epic')) return 'epic';
  if (lower.includes('story') || lower.includes('user story')) return 'story';
  if (lower.includes('bug')) return 'bug';
  if (lower.includes('sub')) return 'subtask';
  return 'task';
}

async function searchIssues(projectKey: string): Promise<JiraIssue[]> {
  const { url, token } = config.jira;
  const allIssues: JiraIssue[] = [];
  let startAt = 0;
  const maxResults = 100;

  while (true) {
    const jql = encodeURIComponent(`project = ${projectKey} ORDER BY updated DESC`);
    const resp = await fetch(
      `${url}/rest/api/2/search?jql=${jql}&startAt=${startAt}&maxResults=${maxResults}&fields=summary,description,issuetype,status,priority,assignee,reporter,labels,components,sprint,issuelinks,customfield_10014`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!resp.ok) throw new Error(`Jira search failed: ${resp.status}`);
    const data = (await resp.json()) as SearchResponse;
    allIssues.push(...data.issues);

    if (startAt + maxResults >= data.total) break;
    startAt += maxResults;
  }

  return allIssues;
}

export async function ingestJira(projectKey: string): Promise<{
  ticketsProcessed: number;
}> {
  const issues = await searchIssues(projectKey);
  const db = getDb();

  const insertTicket = db.prepare(`
    INSERT INTO jira_tickets (id, ticket_key, summary, description, issue_type, status, priority, assignee, reporter, sprint, epic_key, labels, components, links)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ticket_key) DO UPDATE SET
      summary = excluded.summary,
      description = excluded.description,
      status = excluded.status,
      assignee = excluded.assignee,
      sprint = excluded.sprint,
      updated_at = datetime('now')
  `);

  const insertChunk = db.prepare(`
    INSERT INTO chunks (id, content, chunk_index, chunk_type, source_type, metadata)
    VALUES (?, ?, 0, 'ticket', 'jira', ?)
  `);

  const chunksToEmbed: Array<{ chunkId: string; text: string }> = [];

  const tx = db.transaction(() => {
    for (const issue of issues) {
      const ticketId = uuid();
      const issueType = mapIssueType(issue.fields.issuetype.name);

      const links = (issue.fields.issuelinks || []).map(link => ({
        type: link.type.name,
        targetKey: link.outwardIssue?.key || link.inwardIssue?.key,
        direction: link.outwardIssue ? 'outward' : 'inward',
      }));

      insertTicket.run(
        ticketId,
        issue.key,
        issue.fields.summary,
        issue.fields.description || '',
        issueType,
        issue.fields.status.name,
        issue.fields.priority?.name || '',
        issue.fields.assignee?.displayName || '',
        issue.fields.reporter?.displayName || '',
        issue.fields.sprint?.name || '',
        issue.fields.customfield_10014 || '',
        JSON.stringify(issue.fields.labels || []),
        JSON.stringify((issue.fields.components || []).map(c => c.name)),
        JSON.stringify(links)
      );

      // Graph node for ticket
      const ticketNodeId = `ticket:${issue.key}`;
      addNode(ticketNodeId, 'ticket', `${issue.key}: ${issue.fields.summary}`, {
        issueType,
        status: issue.fields.status.name,
        priority: issue.fields.priority?.name,
      });

      // Graph edges for links
      for (const link of links) {
        if (!link.targetKey) continue;
        const targetNodeId = `ticket:${link.targetKey}`;
        addNode(targetNodeId, 'ticket', link.targetKey);

        if (link.type.toLowerCase().includes('block')) {
          addEdge(ticketNodeId, targetNodeId, 'BLOCKS');
        } else {
          addEdge(ticketNodeId, targetNodeId, 'RELATES_TO');
        }
      }

      // Epic -> story hierarchy
      if (issue.fields.customfield_10014) {
        const epicNodeId = `ticket:${issue.fields.customfield_10014}`;
        addEdge(ticketNodeId, epicNodeId, 'CHILD_OF');
      }

      // Chunk for embedding
      const chunkId = uuid();
      const embeddingText = [
        `${issue.key}: ${issue.fields.summary}`,
        issue.fields.description || '',
        `Type: ${issueType}`,
        `Status: ${issue.fields.status.name}`,
        issue.fields.labels?.length ? `Labels: ${issue.fields.labels.join(', ')}` : '',
      ].filter(Boolean).join('\n');

      insertChunk.run(chunkId, embeddingText, JSON.stringify({ ticketKey: issue.key }));
      chunksToEmbed.push({ chunkId, text: embeddingText });
    }
  });

  tx();

  // Generate embeddings in batches
  if (chunksToEmbed.length > 0) {
    const batchSize = 50;
    for (let i = 0; i < chunksToEmbed.length; i += batchSize) {
      const batch = chunksToEmbed.slice(i, i + batchSize);
      const vectors = await generateEmbeddings(batch.map(c => c.text));
      storeEmbeddings(
        batch.map((c, j) => ({ chunkId: c.chunkId, vector: vectors[j] }))
      );
    }
  }

  return { ticketsProcessed: issues.length };
}

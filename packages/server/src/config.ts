import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

dotenvConfig({ path: resolve(process.cwd(), '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  dataDir: process.env.DATA_DIR || './data',

  // Swagger/OpenAPI
  swaggerUrls: (process.env.SWAGGER_URLS || '').split(',').filter(Boolean),

  // Confluence
  confluence: {
    url: process.env.CONFLUENCE_URL || '',
    token: process.env.CONFLUENCE_TOKEN || '',
    spaces: (process.env.CONFLUENCE_SPACES || '').split(',').filter(Boolean),
  },

  // Jira
  jira: {
    url: process.env.JIRA_URL || '',
    token: process.env.JIRA_TOKEN || '',
    projectKeys: (process.env.JIRA_PROJECT_KEYS || '').split(',').filter(Boolean),
  },

  // GigaChat
  gigachat: {
    clientId: process.env.GIGACHAT_CLIENT_ID || '',
    clientSecret: process.env.GIGACHAT_CLIENT_SECRET || '',
    scope: process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS',
    authUrl: 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
    apiUrl: 'https://gigachat.devices.sberbank.ru/api/v1',
  },
} as const;

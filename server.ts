import express, { Request, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Please verify your settings.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// Natural language to SQL query generation
app.post('/api/generate-sql', async (req: Request, res: Response) => {
  try {
    const { prompt, schema, dialect = 'PostgreSQL', context } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'A prompt in English is required.' });
    }

    const ai = getGeminiClient();

    const systemInstruction = `You are an expert Principal Database Engineer, SQL Architect, and query optimization specialist.
Your mission is to take a natural language request in plain English, and generate accurate, high-performance, and idiomatic SQL queries based strictly on the provided database schema.

Target SQL Dialect: ${dialect}.
Rules:
1. Ground your query strictly in the provided schema (table names, column names, relationships).
2. Adhere strictly to the requested dialect's syntax (${dialect}):
   - PostgreSQL: double quotes for case-sensitive identifiers if needed, ILIKE for case-insensitive, LIMIT/OFFSET, proper DATE/TIMESTAMP casting (e.g. NOW() - INTERVAL '30 days').
   - MySQL: backticks, LIKE, DATE_SUB(NOW(), INTERVAL 30 DAY), LIMIT.
   - SQLite: strftime for dates, simple types, double quotes or backticks, standard joins.
   - SQL Server: TOP N, DATEADD, DATEDIFF, square brackets [col].
3. Produce clean, well-formatted, indented SQL.
4. Explain clearly what the query does, which tables are joined, conditions, and aggregations.
5. Highlight any assumptions made and provide helpful caveats (e.g. NULL handling, LEFT vs INNER JOIN implications).
6. Suggest 2-3 natural follow-up questions the user might ask next.`;

    const contents = `User Request in English: "${prompt}"

Current Database Schema:
${JSON.stringify(schema, null, 2)}

${context ? `Additional Project Context / Instructions: ${context}` : ''}

Generate the SQL query and details. Return strictly a JSON object following the required schema.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sql: {
              type: Type.STRING,
              description: 'The complete, formatted, ready-to-run SQL query.',
            },
            explanation: {
              type: Type.STRING,
              description: 'Concise, clear explanation of the query logic and steps.',
            },
            dialect: {
              type: Type.STRING,
              description: 'The dialect the query was written for.',
            },
            tablesUsed: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'List of table names used in the query.',
            },
            columnsUsed: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'List of columns queried or filtered.',
            },
            assumptions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Key assumptions made when interpreting the request.',
            },
            caveats: {
              type: Type.STRING,
              description: 'Important performance, null-safety, or edge-case notes.',
            },
            suggestedIndexes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Indexes that would make this query significantly faster.',
            },
            followUpQuestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '2 to 3 logical follow-up questions in English.',
            },
          },
          required: ['sql', 'explanation', 'tablesUsed'],
        },
      },
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error generating SQL:', error);
    return res.status(500).json({
      error: error.message || 'Failed to generate SQL query',
      details: error.toString(),
    });
  }
});

// AI Schema Assistant: Generate or refine schema from English description
app.post('/api/generate-schema', async (req: Request, res: Response) => {
  try {
    const { prompt, dialect = 'PostgreSQL', existingSchema } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const ai = getGeminiClient();

    const systemInstruction = `You are a database design architect.
Generate a comprehensive, normalized relational database schema (tables, columns, primary keys, foreign keys, data types) and 3 to 5 realistic mock seed rows for each table based on the user's description.
Target SQL Dialect: ${dialect}.`;

    const contents = `User description: "${prompt}"
${existingSchema ? `Existing schema to expand or modify:\n${JSON.stringify(existingSchema, null, 2)}` : ''}

Generate structured tables with columns, types, constraints, and realistic mock seed data rows for testing.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projectName: { type: Type.STRING },
            projectDescription: { type: Type.STRING },
            tables: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  columns: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING },
                        type: { type: Type.STRING },
                        isPrimary: { type: Type.BOOLEAN },
                        isNullable: { type: Type.BOOLEAN },
                        isUnique: { type: Type.BOOLEAN },
                        defaultValue: { type: Type.STRING },
                        references: {
                          type: Type.OBJECT,
                          properties: {
                            table: { type: Type.STRING },
                            column: { type: Type.STRING },
                          },
                        },
                      },
                      required: ['name', 'type'],
                    },
                  },
                  sampleData: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                    },
                  },
                },
                required: ['name', 'columns'],
              },
            },
          },
          required: ['tables'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error generating schema:', error);
    return res.status(500).json({
      error: error.message || 'Failed to generate schema',
    });
  }
});

// Parse DDL SQL to structured schema
app.post('/api/parse-ddl', async (req: Request, res: Response) => {
  try {
    const { ddl, dialect = 'PostgreSQL' } = req.body;
    if (!ddl) {
      return res.status(400).json({ error: 'DDL is required.' });
    }

    const ai = getGeminiClient();

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Parse this SQL DDL into a structured schema with tables, columns, primary keys, and foreign keys.\nDialect: ${dialect}\n\nDDL:\n${ddl}`,
      config: {
        systemInstruction: 'You are an expert SQL parser. Extract tables, columns, data types, primary keys, foreign keys, and synthesize 3 realistic sample data rows for each table.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tables: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  columns: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING },
                        type: { type: Type.STRING },
                        isPrimary: { type: Type.BOOLEAN },
                        isNullable: { type: Type.BOOLEAN },
                        isUnique: { type: Type.BOOLEAN },
                        defaultValue: { type: Type.STRING },
                        references: {
                          type: Type.OBJECT,
                          properties: {
                            table: { type: Type.STRING },
                            column: { type: Type.STRING },
                          },
                        },
                      },
                      required: ['name', 'type'],
                    },
                  },
                  sampleData: {
                    type: Type.ARRAY,
                    items: { type: Type.OBJECT },
                  },
                },
                required: ['name', 'columns'],
              },
            },
          },
          required: ['tables'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error parsing DDL:', error);
    return res.status(500).json({
      error: error.message || 'Failed to parse DDL',
    });
  }
});

// Explain or optimize SQL
app.post('/api/explain-sql', async (req: Request, res: Response) => {
  try {
    const { sql, schema, dialect = 'PostgreSQL' } = req.body;
    if (!sql) {
      return res.status(400).json({ error: 'SQL is required.' });
    }

    const ai = getGeminiClient();

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Explain this SQL query in plain English and provide performance optimization tips:\n\nSQL:\n${sql}\n\nSchema:\n${JSON.stringify(schema, null, 2)}`,
      config: {
        systemInstruction: `You are an expert SQL Database Administrator for ${dialect}. Explain the query in plain English and suggest optimizations.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            stepByStep: { type: Type.ARRAY, items: { type: Type.STRING } },
            optimizedSql: { type: Type.STRING },
            optimizationNotes: { type: Type.STRING },
            complexityRating: { type: Type.STRING },
          },
          required: ['summary', 'stepByStep'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to explain SQL' });
  }
});

// Mount Vite or static server
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`QueryCraft server running on port ${port}`);
  });
}

startServer();

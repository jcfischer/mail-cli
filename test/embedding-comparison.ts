#!/usr/bin/env bun
/**
 * Embedding Comparison Test Harness
 *
 * Compares embedding quality with and without LLM-generated snippets.
 * Fetches 100 emails from work account, generates snippets via Ollama,
 * creates two embedding databases, and runs comparison searches.
 */

import { loadConfig, getAccount } from "../src/config";
import { createImapConfig } from "../src/imap/client";
import { EmbeddingService, OllamaProvider } from "resona";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

// Configuration
const ACCOUNT_NAME = "work";
const MAILBOX = "Archive";
const EMAIL_COUNT = 100;
const OLLAMA_MODEL = "mxbai-embed-large";
const LLM_MODEL = "llama3.1:8b"; // For generating snippets
const TEST_DB_PATH_NONE = "/tmp/email-embed-none.lance";
const TEST_DB_PATH_SHORT_SNIPPET = "/tmp/email-embed-short-snippet.lance";
const TEST_DB_PATH_LONG_SNIPPET = "/tmp/email-embed-long-snippet.lance";
const TEST_DB_PATH_FULL_BODY = "/tmp/email-embed-full-body.lance";

// Test queries for comparison
const TEST_QUERIES = [
  "meeting next week",
  "project deadline",
  "budget approval",
  "security incident",
  "performance review",
  "customer complaint",
  "contract renewal",
  "hiring decision",
];

interface EmailWithSnippet {
  id: string;
  subject: string;
  from: string;
  date: Date;
  body: string;
  shortSnippet: string;   // 1-2 sentences
  longSnippet: string;    // 6-10 sentences
}

interface FetchedEmail {
  uid: number;
  messageId: string;
  subject: string;
  from: string;
  date: Date;
  body: string;
}

/**
 * Find the text/plain part in a body structure
 */
function findTextPlainPart(bodyStructure: any): string | null {
  if (!bodyStructure) return null;

  // Direct text/plain
  if (bodyStructure.type === "text/plain") {
    return bodyStructure.part || "1";
  }

  // Search in childNodes
  if (bodyStructure.childNodes) {
    for (const child of bodyStructure.childNodes) {
      const found = findTextPlainPart(child);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Decode quoted-printable content
 */
function decodeQuotedPrintable(str: string, charset: string = 'utf-8'): string {
  try {
    // Replace soft line breaks
    let decoded = str.replace(/=\r?\n/g, '');
    // Decode =XX hex sequences
    decoded = decoded.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
    return decoded;
  } catch {
    return str;
  }
}

/**
 * Generate a summary snippet using local LLM (Ollama)
 */
async function generateSnippet(body: string, long: boolean = false): Promise<string> {
  // Truncate body to first 3000 chars to avoid token limits
  const truncatedBody = body.substring(0, 3000);

  const shortPrompt = `Summarize this email in 1-2 sentences (max 150 characters). Focus on the main topic and action items. Just output the summary, nothing else.

Email:
${truncatedBody}`;

  const longPrompt = `Provide a detailed summary of this email in 6-10 sentences. Include:
- Main topic and purpose
- Key points and details mentioned
- Any action items or requests
- Important dates, names, or numbers
- Context and background if relevant

Just output the summary, nothing else.

Email:
${truncatedBody}`;

  const prompt = long ? longPrompt : shortPrompt;
  const maxTokens = long ? 400 : 100;

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt,
        stream: false,
        options: {
          num_predict: maxTokens,
          temperature: 0.3,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const result = (await response.json()) as { response: string };
    const maxLength = long ? 800 : 200;
    return result.response.trim().substring(0, maxLength);
  } catch (error) {
    console.error(`  ⚠️ Snippet generation failed: ${error}`);
    return "";
  }
}

/**
 * Fetch emails from IMAP with proper body extraction using mailparser
 */
async function fetchEmails(count: number): Promise<FetchedEmail[]> {
  console.log(`\n📧 Fetching ${count} emails from ${ACCOUNT_NAME} account...`);

  const config = loadConfig();
  const accountConfig = getAccount(config, ACCOUNT_NAME);
  const imapConfig = createImapConfig(accountConfig);

  const client = new ImapFlow({
    host: imapConfig.host,
    port: imapConfig.port,
    secure: imapConfig.tls,
    auth: {
      user: imapConfig.user,
      pass: imapConfig.pass,
    },
    logger: false,
  });

  const emails: FetchedEmail[] = [];

  try {
    await client.connect();
    console.log(`   ✅ Connected to ${imapConfig.host}`);

    await client.mailboxOpen(MAILBOX);

    // Get recent message UIDs
    const allUids = await client.search({ all: true });
    const recentUids = allUids.slice(-count);
    console.log(`   📋 Found ${allUids.length} total, fetching ${recentUids.length} most recent`);

    // Fetch full message source and parse with mailparser
    let fetched = 0;
    for await (const msg of client.fetch(recentUids, {
      envelope: true,
      source: true,
      uid: true,
    })) {
      const envelope = msg.envelope;
      const from = envelope.from?.[0]
        ? `${envelope.from[0].name || ""} <${envelope.from[0].address}>`.trim()
        : "";

      let body = "";
      if (msg.source) {
        try {
          const parsed = await simpleParser(msg.source);
          body = parsed.text || "";
        } catch (e) {
          // Fallback: extract text after headers
          const source = Buffer.from(msg.source).toString("utf-8");
          const bodyMatch = source.match(/\r?\n\r?\n([\s\S]*)/);
          if (bodyMatch) {
            body = bodyMatch[1];
          }
        }
      }

      emails.push({
        uid: msg.uid,
        messageId: envelope.messageId || `${msg.uid}`,
        subject: envelope.subject || "(no subject)",
        from,
        date: envelope.date || new Date(),
        body: body.trim(),
      });

      fetched++;
      if (fetched % 10 === 0) {
        console.log(`   ⏳ Fetched: ${fetched}/${recentUids.length}`);
      }
    }

    console.log(`   ✅ Fetched ${emails.length} emails with bodies`);
    const withBodies = emails.filter((e) => e.body.length > 50).length;
    console.log(`   📊 ${withBodies} emails have body content (>50 chars)`);

    return emails;
  } finally {
    await client.logout();
  }
}

/**
 * Generate LLM snippets for emails (both short and long versions)
 */
async function generateSnippets(
  emails: FetchedEmail[]
): Promise<EmailWithSnippet[]> {
  console.log(`\n🤖 Generating LLM snippets for ${emails.length} emails...`);
  console.log(`   📝 Generating both short (1-2 sentences) AND long (6-10 sentences) snippets`);

  const results: EmailWithSnippet[] = [];
  let processed = 0;

  for (const email of emails) {
    processed++;

    // Only generate snippets if there's body content
    let shortSnippet = "";
    let longSnippet = "";
    if (email.body && email.body.length > 50) {
      // Generate both snippet types
      shortSnippet = await generateSnippet(email.body, false);
      longSnippet = await generateSnippet(email.body, true);
    }

    results.push({
      id: email.messageId,
      subject: email.subject,
      from: email.from,
      date: email.date,
      body: email.body || "",
      shortSnippet,
      longSnippet,
    });

    // Progress indicator
    if (processed % 10 === 0) {
      console.log(`   📝 Generated ${processed}/${emails.length} snippet pairs`);
    }
  }

  const withSnippets = results.filter((e) => e.shortSnippet).length;
  console.log(`   ✅ Generated ${withSnippets} snippet pairs (${results.length - withSnippets} empty bodies skipped)`);

  return results;
}

type EmbedMode = "none" | "short_snippet" | "long_snippet" | "full";

/**
 * Create embedding text based on mode
 */
function createEmbeddingText(
  email: EmailWithSnippet,
  mode: EmbedMode
): string {
  const parts = [`Subject: ${email.subject}`, `From: ${email.from}`];

  if (mode === "short_snippet" && email.shortSnippet) {
    parts.push(`Summary: ${email.shortSnippet}`);
  } else if (mode === "long_snippet" && email.longSnippet) {
    parts.push(`Summary: ${email.longSnippet}`);
  } else if (mode === "full" && email.body) {
    // Truncate body to first 1500 chars to stay within embedding limits
    const truncatedBody = email.body.substring(0, 1500);
    parts.push(`Content: ${truncatedBody}`);
  }

  return parts.join("\n");
}

/**
 * Create embeddings for emails
 */
async function createEmbeddings(
  emails: EmailWithSnippet[],
  dbPath: string,
  mode: EmbedMode
): Promise<EmbeddingService> {
  const labels: Record<EmbedMode, string> = {
    none: "WITHOUT content (subject+from only)",
    short_snippet: "WITH SHORT LLM snippets (1-2 sentences)",
    long_snippet: "WITH LONG LLM snippets (6-10 sentences)",
    full: "WITH FULL BODY",
  };
  console.log(`\n🔢 Creating embeddings ${labels[mode]}...`);
  console.log(`   📁 Database: ${dbPath}`);

  // Clean up existing database
  try {
    await Bun.$`rm -rf ${dbPath}`.quiet();
  } catch {
    // Ignore if doesn't exist
  }

  const provider = new OllamaProvider(OLLAMA_MODEL);
  const service = new EmbeddingService(provider, dbPath);

  const items = emails.map((email) => ({
    id: email.id,
    text: createEmbeddingText(email, mode),
    metadata: {
      subject: email.subject,
      from: email.from,
      date: email.date.toISOString(),
      mode,
    },
  }));

  const result = await service.embedBatch(items, {
    onProgress: (progress) => {
      if (progress.processed % 20 === 0) {
        console.log(
          `   ⏳ Embedded ${progress.processed}/${progress.total} (${progress.rate?.toFixed(1)}/s)`
        );
      }
    },
  });

  console.log(`   ✅ Embedded ${result.processed} emails, ${result.skipped} skipped, ${result.errors} errors`);

  return service;
}

/**
 * Run comparison searches across all four modes
 */
async function runComparison(
  serviceNone: EmbeddingService,
  serviceShortSnippet: EmbeddingService,
  serviceLongSnippet: EmbeddingService,
  serviceFull: EmbeddingService,
  emails: EmailWithSnippet[]
): Promise<void> {
  console.log(`\n🔍 Running 4-way comparison searches...`);
  console.log(`${"=".repeat(120)}`);

  // Build email lookup
  const emailMap = new Map(emails.map((e) => [e.id, e]));

  // Summary stats
  const summaryStats: Array<{
    query: string;
    avgNone: number;
    avgShortSnippet: number;
    avgLongSnippet: number;
    avgFull: number;
  }> = [];

  for (const query of TEST_QUERIES) {
    console.log(`\n📌 Query: "${query}"`);
    console.log(`${"-".repeat(120)}`);

    const [resultsNone, resultsShortSnippet, resultsLongSnippet, resultsFull] = await Promise.all([
      serviceNone.search(query, 5),
      serviceShortSnippet.search(query, 5),
      serviceLongSnippet.search(query, 5),
      serviceFull.search(query, 5),
    ]);

    // Print results side by side
    console.log(`\n   SUBJECT ONLY       | SHORT SNIPPET      | LONG SNIPPET       | FULL BODY`);
    console.log(`   ${"─".repeat(18)} | ${"─".repeat(18)} | ${"─".repeat(18)} | ${"─".repeat(18)}`);

    for (let i = 0; i < 5; i++) {
      const rNone = resultsNone[i];
      const rShort = resultsShortSnippet[i];
      const rLong = resultsLongSnippet[i];
      const rFull = resultsFull[i];

      const subNone = emailMap.get(rNone?.id)?.subject.substring(0, 14) || "?";
      const subShort = emailMap.get(rShort?.id)?.subject.substring(0, 14) || "?";
      const subLong = emailMap.get(rLong?.id)?.subject.substring(0, 14) || "?";
      const subFull = emailMap.get(rFull?.id)?.subject.substring(0, 14) || "?";

      console.log(
        `   ${rNone?.similarity.toFixed(3)} ${subNone.padEnd(14)} | ` +
        `${rShort?.similarity.toFixed(3)} ${subShort.padEnd(14)} | ` +
        `${rLong?.similarity.toFixed(3)} ${subLong.padEnd(14)} | ` +
        `${rFull?.similarity.toFixed(3)} ${subFull.padEnd(14)}`
      );
    }

    // Calculate averages
    const avgNone = resultsNone.reduce((sum, r) => sum + r.similarity, 0) / resultsNone.length;
    const avgShortSnippet = resultsShortSnippet.reduce((sum, r) => sum + r.similarity, 0) / resultsShortSnippet.length;
    const avgLongSnippet = resultsLongSnippet.reduce((sum, r) => sum + r.similarity, 0) / resultsLongSnippet.length;
    const avgFull = resultsFull.reduce((sum, r) => sum + r.similarity, 0) / resultsFull.length;

    summaryStats.push({ query, avgNone, avgShortSnippet, avgLongSnippet, avgFull });

    // Determine winner
    const scores = [
      { name: "NONE", score: avgNone },
      { name: "SHORT", score: avgShortSnippet },
      { name: "LONG", score: avgLongSnippet },
      { name: "FULL", score: avgFull },
    ];
    const winner = scores.reduce((a, b) => a.score > b.score ? a : b).name;

    console.log(`\n   📊 Avg: NONE=${avgNone.toFixed(3)} | SHORT=${avgShortSnippet.toFixed(3)} | LONG=${avgLongSnippet.toFixed(3)} | FULL=${avgFull.toFixed(3)} → Winner: ${winner}`);
  }

  // Print summary table
  console.log(`\n${"=".repeat(120)}`);
  console.log(`\n📊 SUMMARY TABLE:`);
  console.log(`${"─".repeat(100)}`);
  console.log(`Query                    | Subject Only | Short Snippet | Long Snippet | Full Body  | Winner`);
  console.log(`${"─".repeat(100)}`);

  let noneWins = 0, shortWins = 0, longWins = 0, fullWins = 0;

  for (const stat of summaryStats) {
    const scores = [
      { name: "NONE", score: stat.avgNone },
      { name: "SHORT", score: stat.avgShortSnippet },
      { name: "LONG", score: stat.avgLongSnippet },
      { name: "FULL", score: stat.avgFull },
    ];
    const winner = scores.reduce((a, b) => a.score > b.score ? a : b).name;

    if (winner === "NONE") noneWins++;
    else if (winner === "SHORT") shortWins++;
    else if (winner === "LONG") longWins++;
    else fullWins++;

    console.log(
      `${stat.query.padEnd(24)} | ${stat.avgNone.toFixed(3).padStart(12)} | ` +
      `${stat.avgShortSnippet.toFixed(3).padStart(13)} | ${stat.avgLongSnippet.toFixed(3).padStart(12)} | ` +
      `${stat.avgFull.toFixed(3).padStart(10)} | ${winner}`
    );
  }

  console.log(`${"─".repeat(100)}`);
  console.log(`WINS: Subject Only: ${noneWins} | Short Snippet: ${shortWins} | Long Snippet: ${longWins} | Full Body: ${fullWins}`);
  console.log(`${"=".repeat(120)}`);
}

/**
 * Print sample snippets for inspection
 */
function printSampleSnippets(emails: EmailWithSnippet[]): void {
  console.log(`\n📝 Sample LLM-generated snippets (both short and long):`);
  console.log(`${"=".repeat(100)}`);

  const withSnippets = emails.filter((e) => e.shortSnippet);
  const samples = withSnippets.slice(0, 3);

  for (const email of samples) {
    console.log(`\nSubject: ${email.subject}`);
    console.log(`From: ${email.from}`);
    console.log(`\n📄 Short snippet (1-2 sentences):`);
    console.log(`   ${email.shortSnippet}`);
    console.log(`\n📑 Long snippet (6-10 sentences):`);
    console.log(`   ${email.longSnippet}`);
    console.log(`${"─".repeat(100)}`);
  }
}

/**
 * Main test harness
 */
async function main(): Promise<void> {
  console.log(`\n${"=".repeat(120)}`);
  console.log(`   EMBEDDING COMPARISON TEST HARNESS (4-way)`);
  console.log(`   Comparing: Subject Only vs Short Snippet vs Long Snippet vs Full Body`);
  console.log(`   Account: ${ACCOUNT_NAME} | Mailbox: ${MAILBOX} | Emails: ${EMAIL_COUNT}`);
  console.log(`${"=".repeat(120)}`);

  // Step 1: Fetch emails
  const rawEmails = await fetchEmails(EMAIL_COUNT);

  // Step 2: Generate LLM snippets (both short and long)
  const emails = await generateSnippets(rawEmails);

  // Print sample snippets
  printSampleSnippets(emails);

  // Step 3: Create embeddings (all four versions)
  const serviceNone = await createEmbeddings(emails, TEST_DB_PATH_NONE, "none");
  const serviceShortSnippet = await createEmbeddings(emails, TEST_DB_PATH_SHORT_SNIPPET, "short_snippet");
  const serviceLongSnippet = await createEmbeddings(emails, TEST_DB_PATH_LONG_SNIPPET, "long_snippet");
  const serviceFull = await createEmbeddings(emails, TEST_DB_PATH_FULL_BODY, "full");

  // Step 4: Run comparison searches
  await runComparison(serviceNone, serviceShortSnippet, serviceLongSnippet, serviceFull, emails);

  // Cleanup
  serviceNone.close();
  serviceShortSnippet.close();
  serviceLongSnippet.close();
  serviceFull.close();

  console.log(`\n✅ Test completed`);
  console.log(`   Databases preserved at:`);
  console.log(`   - ${TEST_DB_PATH_NONE} (subject only)`);
  console.log(`   - ${TEST_DB_PATH_SHORT_SNIPPET} (short LLM snippet)`);
  console.log(`   - ${TEST_DB_PATH_LONG_SNIPPET} (long LLM snippet)`);
  console.log(`   - ${TEST_DB_PATH_FULL_BODY} (full body)`);
}

// Run
main().catch(console.error);

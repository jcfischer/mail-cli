/**
 * Email Embed Commands
 *
 * Commands for managing vector embeddings:
 * - embed config: Configure embedding provider
 * - embed generate: Generate embeddings for emails
 * - embed search: Semantic search
 * - embed stats: Show embedding statistics
 */

import { Command } from "commander";
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { EmailEmbeddingService } from "../db/embedding-service";
import { searchEmails } from "../db/search";
import { loadConfig, listAccounts, getAccount } from "../config";
import { VERSION } from "../version";
import { ImapClient, createImapConfig } from "../imap/client";
import { ResilientFetchOrchestrator } from "../imap/resilient-fetch";

/**
 * Reembed state tracking - tracks progress of gradual re-embedding
 */
interface ReembedState {
  lastProcessedDate: number; // Unix timestamp of oldest processed email
  totalReembedded: number;
  startedAt: number;
}

function getReembedStatePath(account: string): string {
  return join(CONFIG_DIR, `reembed-state-${account}.json`);
}

function loadReembedState(account: string): ReembedState | null {
  const path = getReembedStatePath(account);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function saveReembedState(account: string, state: ReembedState): void {
  ensureConfigDir();
  writeFileSync(getReembedStatePath(account), JSON.stringify(state, null, 2));
}

function resetReembedState(account: string): void {
  const path = getReembedStatePath(account);
  if (existsSync(path)) {
    const fs = require("fs");
    fs.unlinkSync(path);
  }
}

// Config directory
const CONFIG_DIR = join(homedir(), ".config", "email");
const EMBEDDINGS_DB_PATH = join(CONFIG_DIR, "embeddings.db");

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Get embedding database path for an account
 */
function getEmbeddingsDbPath(account?: string): string {
  ensureConfigDir();
  if (account) {
    return join(CONFIG_DIR, `embeddings-${account}.db`);
  }
  return EMBEDDINGS_DB_PATH;
}

/**
 * Get the actual LanceDB directory path (LanceDB converts .db to .lance)
 */
function getLanceDbPath(dbPath: string): string {
  return dbPath.replace(/\.db$/, ".lance");
}

/**
 * Create embed command group
 */
export function createEmbedCommand(): Command {
  const embed = new Command("embed");
  embed.description("Manage vector embeddings for semantic search");

  /**
   * embed config - Configure embedding provider
   */
  embed
    .command("config")
    .description("Configure embedding provider and model")
    .option("-s, --show", "Show current configuration")
    .option("-p, --provider <provider>", "Embedding provider (ollama, openai, voyage, transformers)")
    .option("-m, --model <model>", "Model name (e.g., mxbai-embed-large)")
    .option("-e, --endpoint <url>", "Custom endpoint URL (for Ollama)")
    .action(async (options) => {
      console.log("🔧 Email Embedding Configuration");
      console.log("");

      if (options.show || (!options.provider && !options.model)) {
        // Show current configuration
        console.log("Current Settings:");
        console.log("  Provider:   ollama (default)");
        console.log("  Model:      bge-m3 (8k context, 1024 dimensions)");
        console.log("  Endpoint:   http://localhost:11434");
        console.log("  Database:   ~/.config/email/embeddings.db");
        console.log("  Chunking:   18k chars per chunk, 500 char overlap");
        console.log("");
        console.log("Note: Email embeddings use the same model as tana for consistency.");
        console.log("Provider configuration is currently hardcoded to match tana settings.");
        console.log("");
        console.log("To generate embeddings: email embed generate");
        return;
      }

      // For now, just show info about configuration
      console.log("Note: Provider configuration not yet implemented.");
      console.log("Currently using: ollama/bge-m3 (8k context, 1024d) to match tana.");
    });

  /**
   * embed generate - Generate embeddings for indexed emails
   * T-3.1: Removed LLM snippet generation, now uses full email bodies with chunking
   */
  embed
    .command("generate")
    .description("Generate embeddings for indexed emails (uses full email body with automatic chunking)")
    .option("-a, --account <name>", "Generate for specific account")
    .option("--all", "Generate for all accounts")
    .option("-l, --limit <n>", "Limit number of emails to process")
    .option("-f, --force", "Regenerate all embeddings (ignore cache)")
    .option("--reembed", "Gradual re-embedding mode (newest to oldest, tracks progress)")
    .option("--reembed-reset", "Reset re-embedding progress and start over")
    .option("--fail-fast", "Exit on first batch failure (default: skip failed batches)")
    .option("--timeout <ms>", "Timeout per batch in milliseconds (default: 120000)", "120000")
    .option("--max-retries <n>", "Maximum retry attempts per batch (default: 3)", "3")
    .option("--imap-batch-size <n>", "Number of emails to fetch per IMAP batch (default: 50)", "50")
    .option("-v", "--verbose", "Verbose output")
    .action(async (options) => {
      try {
        console.log(`📧 Email Embeddings v${VERSION}`);
        console.log("");

        const config = loadConfig();
        const accounts = listAccounts(config);

        // Determine which accounts to process
        let accountsToProcess: string[] = [];

        if (options.all) {
          accountsToProcess = accounts;
          console.log(`📊 Generating embeddings for ${accountsToProcess.length} accounts...`);
        } else if (options.account) {
          if (!accounts.includes(options.account)) {
            console.error(`❌ Account not found: ${options.account}`);
            console.log("Available accounts:", accounts.join(", "));
            process.exit(1);
          }
          accountsToProcess = [options.account];
        } else {
          // Default account or all if none specified
          accountsToProcess = [config.defaultAccount || accounts[0]];
        }

        for (const accountName of accountsToProcess) {
          console.log("");
          console.log(`━━━ Account: ${accountName} ━━━`);

          const dbPath = getEmbeddingsDbPath(accountName);
          const embeddingService = new EmailEmbeddingService(dbPath, {
            sourceId: `email/${accountName}`,
          });

          try {
            // Handle --reembed-reset
            if (options.reembedReset) {
              resetReembedState(accountName);
              console.log("🔄 Re-embed progress reset for this account.");
            }

            // Get existing embeddings first to know what's already done
            const existingIds = new Set(await embeddingService.getEmbeddedIds());

            // Get all indexed emails for this account (sorted by date DESC = newest first)
            const allEmails = await searchEmails("", {
              account: accountName,
              limit: 1000000, // Effectively unlimited
            });

            if (allEmails.length === 0) {
              console.log("📭 No indexed emails found. Run `email sync` first.");
              embeddingService.close();
              continue;
            }

            // Determine which emails to process based on mode
            let emailsToProcess: typeof allEmails;
            let reembedState: ReembedState | null = null;
            let isReembedMode = options.reembed === true;

            if (isReembedMode) {
              // Re-embed mode: process from newest to oldest, tracking progress
              reembedState = loadReembedState(accountName);

              if (reembedState) {
                // Continue from where we left off - get emails OLDER than last processed
                emailsToProcess = allEmails.filter((e) => e.date < reembedState!.lastProcessedDate);
                console.log(`🔄 Re-embed mode: continuing from ${new Date(reembedState.lastProcessedDate).toLocaleDateString()}`);
                console.log(`   Total re-embedded so far: ${reembedState.totalReembedded.toLocaleString()}`);
              } else {
                // First run - start from newest (all emails are candidates)
                emailsToProcess = allEmails;
                reembedState = {
                  lastProcessedDate: Date.now(),
                  totalReembedded: 0,
                  startedAt: Date.now(),
                };
                console.log("🔄 Re-embed mode: starting from newest emails");
              }
            } else if (options.force) {
              // Force mode: re-embed everything
              emailsToProcess = allEmails;
            } else {
              // Normal mode: only unembedded emails
              emailsToProcess = allEmails.filter((e) => !existingIds.has(e.messageId));
            }

            // Apply user limit if specified
            const emails = options.limit
              ? emailsToProcess.slice(0, parseInt(options.limit))
              : emailsToProcess;

            const alreadyEmbedded = allEmails.length - (options.force || isReembedMode ? 0 : emailsToProcess.length);
            const orphanedEmbeddings = [...existingIds].filter(
              (id) => !allEmails.some((e) => e.messageId === id)
            ).length;

            console.log(`📊 Email Embedding Status`);
            console.log(`   Indexed emails:    ${allEmails.length.toLocaleString()}`);
            if (!isReembedMode) {
              console.log(`   Already embedded:  ${alreadyEmbedded.toLocaleString()}`);
            }
            console.log(`   ${isReembedMode ? "Remaining to re-embed" : "New to embed"}:      ${emailsToProcess.length.toLocaleString()}`);
            if (options.limit && emailsToProcess.length > emails.length) {
              console.log(`   Processing:        ${emails.length.toLocaleString()} (limited)`);
            }
            if (orphanedEmbeddings > 0) {
              console.log(`   Orphaned:          ${orphanedEmbeddings.toLocaleString()} (embeddings for deleted emails)`);
            }
            console.log("");

            // Skip if nothing to process
            if (emails.length === 0) {
              if (isReembedMode) {
                console.log("✅ Re-embedding complete! All emails have been re-embedded.");
                resetReembedState(accountName);
              } else {
                console.log("✅ All emails already embedded. Use --force to regenerate or --reembed for gradual re-embedding.");
              }
              embeddingService.close();
              continue;
            }

            console.log("   Embedding provider: ollama/bge-m3 (8k context, 1024d)");
            console.log("   Chunking: Enabled (18k chars per chunk, 500 char overlap)");
            console.log("");

            const startTime = Date.now();

            // Pipelined fetch + embed: process each IMAP batch immediately
            console.log("📥 Fetching and embedding emails (pipelined mode)...");
            console.log(`   Timeout: ${parseInt(options.timeout) / 1000}s/batch | Max retries: ${options.maxRetries} | Mode: ${options.failFast ? "fail-fast" : "skip-errors"}`);
            console.log("");

            // Get account config for IMAP
            const accountConfig = getAccount(config, accountName);
            const imapConfig = createImapConfig(accountConfig);
            const imapClient = new ImapClient(imapConfig);

            // Embedding progress tracking
            let totalEmbedded = 0;
            let totalSkipped = 0;
            let totalErrors = 0;
            let lastEmbedLine = "";
            let resilientStats: {
              totalBatches: number;
              successfulBatches: number;
              retriedBatches: number;
              failedBatches: number;
              totalRetries: number;
            } | null = null;
            let totalFetched = 0;

            try {
              await imapClient.connect();

              // Group emails by mailbox
              const emailsByMailbox = new Map<string, typeof emails>();
              for (const email of emails) {
                const mailbox = email.mailbox || "INBOX";
                if (!emailsByMailbox.has(mailbox)) {
                  emailsByMailbox.set(mailbox, []);
                }
                emailsByMailbox.get(mailbox)!.push(email);
              }

              // Fetch bodies for each mailbox with resilient orchestrator
              const fetchStartTime = Date.now();

              for (const [mailbox, mailboxEmails] of emailsByMailbox) {
                const uids = mailboxEmails.map((e) => e.uid);
                // Create UID -> email lookup for this mailbox
                const uidToEmail = new Map(mailboxEmails.map((e) => [e.uid, e]));

                // Track progress within this mailbox (batches completed)
                let mailboxFetched = 0;

                // Create adapter that fetches AND embeds each batch immediately
                const fetchAdapter = {
                  fetchBodiesByUid: async (batchUids: number[]) => {
                    // Fetch bodies from IMAP
                    const result = await imapClient.fetchBodiesByUid(
                      batchUids,
                      mailbox,
                      (fetched, total) => {
                        // Show fetch progress
                        const currentTotal = totalFetched + mailboxFetched + fetched;
                        const pct = ((currentTotal / emails.length) * 100).toFixed(1);
                        const elapsed = (Date.now() - fetchStartTime) / 1000;
                        const rate = elapsed > 0 ? currentTotal / elapsed : 0;
                        const rateStr = rate > 0 ? `${rate.toFixed(1)} msg/s` : "...";
                        const remaining = emails.length - currentTotal;
                        const eta = rate > 0 ? Math.ceil(remaining / rate) : 0;
                        const etaStr = eta > 0 ? `ETA: ${Math.floor(eta / 60)}m${eta % 60}s` : "";

                        const line = `   📥 ${pct}% | Fetch: ${currentTotal.toLocaleString()}/${emails.length.toLocaleString()} (${mailbox}) | ${rateStr} | ${etaStr}`;
                        process.stdout.write(`\r${line.padEnd(120)}`);
                      },
                      options.verbose
                    );

                    // Immediately embed this batch (pipeline: fetch -> embed)
                    const batchEmails = batchUids
                      .map((uid) => {
                        const email = uidToEmail.get(uid);
                        const body = result.get(uid);
                        if (!email) return null;
                        return {
                          id: email.messageId,
                          subject: email.subject,
                          body: body || "",
                          from: email.from,
                          date: new Date(email.date),
                        };
                      })
                      .filter((e) => e !== null);

                    if (batchEmails.length > 0) {
                      const embedResult = await embeddingService.embedBatch(batchEmails, {
                        force: options.force || isReembedMode,
                        progressInterval: 1,
                        storeBatchSize: 5000,
                        onProgress: (progress) => {
                          // Show cumulative embedding progress across all batches
                          const cumulativeProcessed = totalEmbedded + progress.processed;
                          const cumulativeSkipped = totalSkipped + progress.skipped;
                          const cumulativeTotal = cumulativeProcessed + cumulativeSkipped;
                          const pct = emails.length > 0
                            ? ((cumulativeTotal / emails.length) * 100).toFixed(1)
                            : "100.0";
                          const bufferStr = `buf: ${progress.bufferSize.toLocaleString()}`;
                          const rateStr = progress.rate ? `${progress.rate.toFixed(1)}/s` : "...";

                          const line = `   🔢 ${pct}% | Embedded: ${cumulativeProcessed.toLocaleString()}/${emails.length.toLocaleString()} | ${bufferStr} | ${rateStr}`;
                          process.stdout.write(`\r${line.padEnd(120)}`);
                          lastEmbedLine = line;
                        },
                      });

                      totalEmbedded += embedResult.embedded;
                      totalSkipped += embedResult.skipped;
                      totalErrors += embedResult.errors;
                    }

                    // Update mailbox progress after batch completes
                    mailboxFetched += result.size;
                    return result;
                  },
                };

                // Create resilient orchestrator
                const orchestrator = new ResilientFetchOrchestrator(fetchAdapter, {
                  timeoutMs: parseInt(options.timeout),
                  maxRetries: parseInt(options.maxRetries),
                  skipErrors: !options.failFast, // Invert: --fail-fast means skipErrors=false
                });

                // Fetch with resilience (bodies are embedded immediately in adapter)
                const imapBatchSize = parseInt(options.imapBatchSize);
                const result = await orchestrator.fetchWithResilience(uids, imapBatchSize);

                // Track stats from first mailbox (or accumulate if needed)
                if (!resilientStats) {
                  resilientStats = { ...result.stats };
                } else {
                  resilientStats.totalBatches += result.stats.totalBatches;
                  resilientStats.successfulBatches += result.stats.successfulBatches;
                  resilientStats.retriedBatches += result.stats.retriedBatches;
                  resilientStats.failedBatches += result.stats.failedBatches;
                  resilientStats.totalRetries += result.stats.totalRetries;
                }

                totalFetched += result.bodies.size;

                // Log errors if any
                if (result.errors.length > 0 && options.verbose) {
                  console.log("");
                  console.log(`   ⚠️  ${result.errors.length} batch(es) failed in ${mailbox}:`);
                  for (const error of result.errors) {
                    console.log(`      Batch ${error.batchNumber} (UIDs ${error.uidRange}): ${error.errorType} - ${error.errorMessage}`);
                  }
                }
              }

              await imapClient.disconnect();
              process.stdout.write("\r" + " ".repeat(120) + "\r");
              console.log(`   ✅ Fetched and embedded ${totalFetched} emails`);

              // Show resilient fetch stats
              if (resilientStats) {
                console.log(`   📊 Resilient Fetch Stats:`);
                console.log(`      Total batches: ${resilientStats.totalBatches}`);
                console.log(`      Successful: ${resilientStats.successfulBatches}`);
                if (resilientStats.retriedBatches > 0) {
                  console.log(`      Retried: ${resilientStats.retriedBatches} (${resilientStats.totalRetries} total retry attempts)`);
                }
                if (resilientStats.failedBatches > 0) {
                  console.log(`      Failed: ${resilientStats.failedBatches} (skipped)`);
                }
              }
              console.log("");
            } catch (imapError) {
              console.log(`   ⚠️  IMAP error: ${imapError instanceof Error ? imapError.message : imapError}`);
              console.log("   Continuing with subject+from only...");
              console.log("");
            }

            // Clear last progress line
            process.stdout.write("\r" + " ".repeat(120) + "\r");

            const duration = Date.now() - startTime;
            const stats = await embeddingService.getStats();

            console.log("✅ Pipeline complete");
            console.log(`   Embedded: ${totalEmbedded.toLocaleString()}`);
            console.log(`   Skipped: ${totalSkipped.toLocaleString()} (unchanged)`);
            console.log(`   Fetched: ${totalFetched.toLocaleString()} email bodies`);
            if (totalErrors > 0) {
              console.log(`   Errors: ${totalErrors}`);
            }
            console.log(`   Duration: ${(duration / 1000).toFixed(1)}s`);
            console.log(`   Total embeddings: ${stats.totalEmbeddings.toLocaleString()}`);

            // Save re-embed state if in re-embed mode
            if (isReembedMode && reembedState && emails.length > 0) {
              // Find the oldest email we just processed (emails are sorted newest first)
              const oldestProcessed = emails.reduce((oldest, e) =>
                e.date < oldest.date ? e : oldest
              );
              reembedState.lastProcessedDate = oldestProcessed.date;
              reembedState.totalReembedded += totalEmbedded;
              saveReembedState(accountName, reembedState);
              console.log(`   Re-embed progress saved: ${reembedState.totalReembedded.toLocaleString()} total`);
            }
          } finally {
            embeddingService.close();
          }
        }

        if (accountsToProcess.length > 1) {
          console.log("");
          console.log("✅ All accounts processed");
        }
      } catch (error) {
        console.error("❌ Error:", error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  /**
   * embed search - Semantic search
   */
  embed
    .command("search <query>")
    .description("Semantic search across embedded emails")
    .option("-a, --account <name>", "Search specific account")
    .option("--all", "Search all accounts")
    .option("-l, --limit <n>", "Number of results (default: 10)", "10")
    .option("--from <email>", "Filter by sender email address (partial match)")
    .option("--to <email>", "Filter by recipient email address (partial match)")
    .option("-o, --output <format>", "Output format: text, json (default: text)", "text")
    .action(async (query, options) => {
      try {
        const config = loadConfig();
        const accounts = listAccounts(config);
        const limit = parseInt(options.limit);

        // If filtering, fetch more results from vector search to have enough candidates
        const hasFilter = options.from || options.to;
        const searchLimit = hasFilter ? limit * 5 : limit; // Fetch 5x when filtering

        // Determine which accounts to search
        let accountsToSearch: string[] = [];

        if (options.all) {
          accountsToSearch = accounts;
        } else if (options.account) {
          accountsToSearch = [options.account];
        } else {
          accountsToSearch = [config.defaultAccount || accounts[0]];
        }

        type SearchResultWithAccount = {
          account: string;
          id: string;
          similarity: number;
          contextText?: string;
        };

        const allResults: SearchResultWithAccount[] = [];

        for (const accountName of accountsToSearch) {
          const dbPath = getEmbeddingsDbPath(accountName);
          const lancePath = getLanceDbPath(dbPath);

          if (!existsSync(lancePath)) {
            if (options.verbose) {
              console.log(`⚠️  No embeddings for account: ${accountName}`);
            }
            continue;
          }

          const embeddingService = new EmailEmbeddingService(dbPath, {
            sourceId: `email/${accountName}`,
          });

          try {
            const stats = await embeddingService.getStats();
            if (stats.totalEmbeddings === 0) {
              embeddingService.close();
              continue;
            }

            const results = await embeddingService.search(query, searchLimit);

            for (const r of results) {
              allResults.push({
                account: accountName,
                id: r.id,
                similarity: r.similarity,
                contextText: r.contextText,
              });
            }
          } finally {
            embeddingService.close();
          }
        }

        // Sort by similarity and take top results
        allResults.sort((a, b) => b.similarity - a.similarity);

        // Prepare filters for matching
        const fromFilter = options.from?.toLowerCase();
        const toFilter = options.to?.toLowerCase();

        // Process results: look up email details and apply filters
        type EnrichedResult = {
          account: string;
          id: string;
          similarity: number;
          contextText?: string;
          email?: {
            subject: string;
            from: string;
            to: string;
            date: number;
          };
        };

        const enrichedResults: EnrichedResult[] = [];

        for (const r of allResults) {
          // Look up email details
          const emails = await searchEmails("", {
            account: r.account,
            limit: 10000,
          });
          const email = emails.find((e) => e.messageId === r.id);

          // Apply from/to filters
          if (hasFilter && email) {
            const emailFrom = email.from.toLowerCase();
            const emailTo = email.to.toLowerCase();

            if (fromFilter && !emailFrom.includes(fromFilter)) {
              continue; // Skip if from doesn't match
            }
            if (toFilter && !emailTo.includes(toFilter)) {
              continue; // Skip if to doesn't match
            }
          }

          enrichedResults.push({
            ...r,
            email: email ? {
              subject: email.subject,
              from: email.from,
              to: email.to,
              date: email.date,
            } : undefined,
          });

          // Stop if we have enough results
          if (enrichedResults.length >= limit) {
            break;
          }
        }

        if (enrichedResults.length === 0) {
          console.log("📭 No similar emails found.");
          if (hasFilter) {
            console.log("   (Filters may have excluded all results)");
          } else {
            console.log("   Run `email embed generate` to create embeddings first.");
          }
          return;
        }

        if (options.output === "json") {
          console.log(JSON.stringify(enrichedResults, null, 2));
        } else {
          console.log(`\n🧠 Found ${enrichedResults.length} semantically similar emails:\n`);

          for (let i = 0; i < enrichedResults.length; i++) {
            const r = enrichedResults[i];
            const similarity = (r.similarity * 100).toFixed(1);

            if (r.email) {
              console.log(`${(i + 1).toString().padStart(2)}. [${similarity}%] ${r.email.subject}`);
              console.log(`    From: ${r.email.from}`);
              console.log(`    Date: ${new Date(r.email.date).toLocaleDateString()}`);
              console.log(`    Account: ${r.account}`);
              console.log(`    ID: ${r.id}`);
            } else {
              console.log(`${(i + 1).toString().padStart(2)}. [${similarity}%] ${r.id}`);
              console.log(`    Account: ${r.account}`);
              console.log(`    ID: ${r.id}`);
            }
            console.log("");
          }
        }
      } catch (error) {
        console.error("❌ Error:", error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  /**
   * embed stats - Show embedding statistics
   */
  embed
    .command("stats")
    .description("Show embedding statistics")
    .option("-a, --account <name>", "Show stats for specific account")
    .option("--all", "Show stats for all accounts")
    .action(async (options) => {
      try {
        const config = loadConfig();
        const accounts = listAccounts(config);

        // Determine which accounts to show
        let accountsToShow: string[] = [];

        if (options.all) {
          accountsToShow = accounts;
        } else if (options.account) {
          accountsToShow = [options.account];
        } else {
          accountsToShow = accounts;
        }

        console.log("📊 Email Embedding Statistics");
        console.log("");

        let totalEmbeddings = 0;

        for (const accountName of accountsToShow) {
          const dbPath = getEmbeddingsDbPath(accountName);
          const lancePath = getLanceDbPath(dbPath);

          if (!existsSync(lancePath)) {
            console.log(`${accountName}: No embeddings`);
            continue;
          }

          const embeddingService = new EmailEmbeddingService(dbPath, {
            sourceId: `email/${accountName}`,
          });

          try {
            const stats = await embeddingService.getStats();
            totalEmbeddings += stats.totalEmbeddings;

            console.log(`━━━ Account: ${accountName} ━━━`);
            console.log(`   Database:    ${lancePath}`);
            console.log(`   Model:       ${stats.model}`);
            console.log(`   Dimensions:  ${stats.dimensions}`);
            console.log(`   Embeddings:  ${stats.totalEmbeddings.toLocaleString()}`);

            if (stats.oldestEmbedding && !isNaN(stats.oldestEmbedding.getTime())) {
              console.log(`   Oldest:      ${stats.oldestEmbedding.toISOString()}`);
            }
            if (stats.newestEmbedding && !isNaN(stats.newestEmbedding.getTime())) {
              console.log(`   Newest:      ${stats.newestEmbedding.toISOString()}`);
            }
            console.log("");
          } finally {
            embeddingService.close();
          }
        }

        if (accountsToShow.length > 1) {
          console.log(`Total embeddings across all accounts: ${totalEmbeddings.toLocaleString()}`);
        }
      } catch (error) {
        console.error("❌ Error:", error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  return embed;
}

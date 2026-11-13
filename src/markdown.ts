/**
 * Markdown to HTML Converter
 * Renders markdown content as HTML for email bodies
 */

import { marked } from 'marked';

/**
 * Convert markdown to HTML with email-friendly styling
 */
export function markdownToHtml(markdown: string): string {
  // Configure marked for email-safe HTML
  marked.setOptions({
    gfm: true, // GitHub Flavored Markdown
    breaks: true, // Convert \n to <br>
  });

  const htmlBody = marked.parse(markdown) as string;

  // Wrap in HTML email template with inline styles
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #333;
      max-width: 650px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
    }
    h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }
    p { margin-bottom: 16px; }
    a { color: #0366d6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code {
      padding: 0.2em 0.4em;
      margin: 0;
      font-size: 85%;
      background-color: rgba(27, 31, 35, 0.05);
      border-radius: 3px;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    }
    pre {
      padding: 16px;
      overflow: auto;
      font-size: 85%;
      line-height: 1.45;
      background-color: #f6f8fa;
      border-radius: 3px;
    }
    pre code {
      background-color: transparent;
      padding: 0;
    }
    blockquote {
      padding: 0 1em;
      color: #6a737d;
      border-left: 0.25em solid #dfe2e5;
      margin: 0 0 16px 0;
    }
    ul, ol {
      padding-left: 2em;
      margin-bottom: 16px;
    }
    li { margin-bottom: 0.25em; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 16px;
    }
    table th, table td {
      padding: 6px 13px;
      border: 1px solid #dfe2e5;
    }
    table tr {
      background-color: #fff;
      border-top: 1px solid #c6cbd1;
    }
    table tr:nth-child(2n) {
      background-color: #f6f8fa;
    }
    hr {
      height: 0.25em;
      padding: 0;
      margin: 24px 0;
      background-color: #e1e4e8;
      border: 0;
    }
    img {
      max-width: 100%;
      box-sizing: content-box;
    }
  </style>
</head>
<body>
${htmlBody}
</body>
</html>
  `.trim();
}

/**
 * Detect if content is markdown (simple heuristic)
 */
export function isMarkdown(content: string): boolean {
  const markdownIndicators = [
    /^#{1,6}\s+/m, // Headers
    /\*\*.*\*\*/,  // Bold
    /\*.*\*/,      // Italic
    /\[.*\]\(.*\)/, // Links
    /^[-*+]\s+/m,  // Lists
    /^>\s+/m,      // Blockquotes
    /```/,         // Code blocks
    /`[^`]+`/,     // Inline code
  ];

  return markdownIndicators.some(pattern => pattern.test(content));
}

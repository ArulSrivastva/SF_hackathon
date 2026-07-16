const fs = require('fs');
const readline = require('readline');

async function findTokens() {
  const fileStream = fs.createReadStream('C:\\Users\\aruls\\.gemini\\antigravity\\brain\\3ebcb623-2536-4111-96a0-0093250dca19\\.system_generated\\logs\\transcript_full.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const tokens = new Set();
  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      // Look for Bearer or API keys in tool arguments or content
      const str = JSON.stringify(obj);
      const matches = str.match(/Bearer\s+[a-zA-Z0-9_\-\.]+/g) || [];
      matches.forEach(m => tokens.add(m));
      
      const apiKeys = str.match(/hosp-[a-zA-Z0-9_\-]+/g) || [];
      apiKeys.forEach(k => tokens.add(k));

      // Also let's look for any email / password combinations
      const emails = str.match(/[a-zA-Z0-9_\-\.]+@[a-zA-Z0-9_\-\.]+/g) || [];
      emails.forEach(e => {
        if (!e.includes('git') && !e.includes('npm')) {
          tokens.add("Email: " + e);
        }
      });
    } catch (e) {}
  }

  console.log("=== TOKENS / KEYS FOUND IN TRANSCRIPT ===");
  console.log(Array.from(tokens));
}

findTokens();

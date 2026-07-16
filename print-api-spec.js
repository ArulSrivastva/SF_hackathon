const fs = require('fs');
const readline = require('readline');

async function printSpec() {
  const fileStream = fs.createReadStream('C:\\Users\\aruls\\.gemini\\antigravity\\brain\\3ebcb623-2536-4111-96a0-0093250dca19\\.system_generated\\logs\\transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.content && obj.content.includes('# Siege Backend API Documentation')) {
        console.log("=== FULL DOCS ===");
        console.log(obj.content);
        break; // just print the first one we find
      }
    } catch (e) {
      // ignore
    }
  }
}

printSpec();

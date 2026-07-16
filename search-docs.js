const fs = require('fs');
const readline = require('readline');

async function searchDocs() {
  const fileStream = fs.createReadStream('C:\\Users\\aruls\\.gemini\\antigravity\\brain\\3ebcb623-2536-4111-96a0-0093250dca19\\.system_generated\\logs\\transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.includes('GET /emergencies') || line.includes('POST /emergencies') || line.includes('Siege Backend API Documentation')) {
      // Find the step and content
      try {
        const obj = JSON.parse(line);
        if (obj.content && obj.content.includes('Siege Backend API Documentation')) {
          console.log("FOUND DOCS in step", obj.step_index);
          console.log(obj.content.substring(0, 3000)); // print first 3000 chars
        }
      } catch (e) {
        // ignore
      }
    }
  }
}

searchDocs();

import fs from 'fs';

async function run() {
  try {
    const url = 'http://localhost:5173/api/files/scad/projects/myproject/BOSL/math.scad';
    console.log("Fetching", url);
    const res = await fetch(url);
    if (!res.ok) {
      console.error("Fetch failed with status", res.status, res.statusText);
      return;
    }
    const text = await res.text();
    const lines = text.split('\n');
    console.log("Fetched file line count:", lines.length);
    console.log("Lines 675-680:");
    for (let i = 673; i <= 679; i++) {
      console.log(`${i + 1}: ${JSON.stringify(lines[i])}`);
    }
  } catch (e: any) {
    console.error("Exception fetching:", e.message);
  }
}

run();

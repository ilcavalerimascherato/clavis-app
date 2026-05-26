import fs from 'fs';
import path from 'path';

export async function GET() {
  const filePath = path.join(process.cwd(), 'config', 'legal_dictionary.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return new Response(raw, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

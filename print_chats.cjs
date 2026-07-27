const { DatabaseSync } = require('node:sqlite');
const path = require('path');

try {
  const dbPath = path.resolve(process.cwd(), 'scholarmind.db');
  const db = new DatabaseSync(dbPath);
  const convs = db.prepare('SELECT * FROM conversations').all();
  const msgs = db.prepare('SELECT id, conversation_id, user_id, role, content FROM messages').all();
  console.log('Conversations:', convs);
  console.log('Messages:', msgs);
} catch (err) {
  console.error(err);
}

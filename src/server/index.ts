import express from "express";
import path from "node:path";
import { sourceRoot } from "./database/db.js";
import { journalRouter } from "./routes/journal.js";
import { quotesRouter, tagsRouter } from "./routes/quotes.js";
import { seedRouter } from "./routes/seed.js";
import { wordsRouter, spacesRouter } from "./routes/words.js";

const app = express();
const port = Number(process.env.LEXINA_PORT || 3000);

app.use(express.static(path.join(sourceRoot, "public")));
app.use(express.json());
app.use("/api/words", wordsRouter);
app.use("/api/spaces", spacesRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/tags", tagsRouter);
app.use("/api/journal", journalRouter);
app.use("/api/seed", seedRouter);

app.listen(port, () => {
  console.log(`Lexina läuft auf http://localhost:${port}`);
});

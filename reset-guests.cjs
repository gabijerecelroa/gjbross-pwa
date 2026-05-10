const fs = require("fs");

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    })
);

const TOKEN = env.GITHUB_TOKEN;
const GIST_ID = env.GIST_ID;
const FILE = env.GIST_FILENAME || "guests.json";

async function main() {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      files: {
        [FILE]: {
          content: JSON.stringify({ guests: [] }, null, 2)
        }
      }
    })
  });

  if (!res.ok) throw new Error(await res.text());
  console.log("Lista limpiada.");
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});

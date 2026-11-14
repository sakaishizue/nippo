// CI でバックアップのイメージを試すための、偽のメタデータサーバーと Cloud Storage。
// node backup/fake-gcs.mjs <保存先のディレクトリ> で、ポート 8099 で待ち受ける
import { createWriteStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("保存先のディレクトリを指定してください");
const TOKEN = "ci-token";

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/computeMetadata/v1/instance/service-accounts/default/token") {
    if (req.headers["metadata-flavor"] !== "Google") return res.writeHead(403).end();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ access_token: TOKEN, expires_in: 3600, token_type: "Bearer" }));
  }
  const upload = url.pathname.match(/^\/upload\/storage\/v1\/b\/([^/]+)\/o$/);
  if (req.method === "POST" && upload) {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.writeHead(401).end();
    const name = url.searchParams.get("name") ?? "";
    if (url.searchParams.get("uploadType") !== "media" || !/^[\w.-]+$/.test(name)) {
      return res.writeHead(400).end();
    }
    const path = join(dir, name);
    if (url.searchParams.get("ifGenerationMatch") === "0" && existsSync(path)) {
      return res.writeHead(412).end();
    }
    const out = createWriteStream(path);
    req.pipe(out);
    out.on("finish", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ bucket: upload[1], name }));
    });
    return;
  }
  res.writeHead(404).end();
}).listen(8099, () => console.log("fake GCS: http://localhost:8099"));

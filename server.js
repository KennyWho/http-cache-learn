const http = require("http");
const fs = require("fs-extra");
const crypto = require("crypto");

function checksumFile(hashName, path) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(hashName);
    const stream = fs.createReadStream(path);
    stream.on("error", err => reject(err));
    stream.on("data", chunk => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

let _config;
const server = http
  .createServer(async (req, res) => {
    if (req.url === "/") {
      res.writeHeader(200, { "Content-Type": "text/html" });
      const readStream = fs.createReadStream("index.html");
      readStream.on("open", function() {
        readStream.pipe(res);
      });
    } else if (req.url === "/index.js") {
      const ignore = req.headers["x-request-ignore"];
      if (!ignore) {
        io.emit("client:log", "Request recive");
      }
      const hash = await checksumFile("md5", "index.js");
      const stat = await fs.stat("index.js");
      const last_modified = new Date(stat.mtime);
      // 1分钟过期
      const expire =
        new Date(+_config.expiresTime) || new Date(Date.now() + 1000 * 60);
      res.setHeader("Content-Type", "application/javascript");
      if (_config.etag) {
        res.setHeader("ETag", hash);
      }
      if (_config.lastModified) {
        res.setHeader("Last-Modified", last_modified.toUTCString());
      }
      if (_config.expires) {
        res.setHeader("Expires", expire.toUTCString());
      }
      if (_config.cacheControl) {
        switch (parseInt(_config.cacheControl, 10)) {
          case 0:
            res.setHeader("Cache-Control", "no-store");
            break;
          case 1:
            res.setHeader("Cache-Control", "no-cache");
            break;
          case 4:
            res.setHeader(
              "Cache-Control",
              `max-age=${_config.maxAge || 1000 * 60}`
            );
            break;
        }
      }

      if (
        (req.headers["if-none-match"] &&
          req.headers["if-none-match"] === hash) ||
        (req.headers["if-modified-since"] &&
          req.headers["if-modified-since"] === last_modified)
      ) {
        if (!ignore) {
          io.emit("client:log", "304 code, no response sent");
        }
        res.statusCode = 304;
        res.end();
        return;
      }
      if (!ignore) {
        io.emit("client:log", "200 code, response sent");
      }
      res.write(await fs.readFile("index.js"));
      res.end();
    }
  })
  .listen(8080);

const io = require("socket.io")(server);

io.on("connection", socket => {
  socket.on("config", (config, fn) => {
    _config = config;
    fn();
  });
});

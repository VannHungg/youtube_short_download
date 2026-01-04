import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";

const app = express();
app.use(cors());
app.use(express.json());

const VIDEO_DIR = path.join(tmpdir(), "videos");
if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });

app.post("/download", (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ message: "Missing url" });

  const fileName = `video_${Date.now()}.mp4`;
  const tmpPath = path.join(VIDEO_DIR, `tmp_${Date.now()}.mp4`); // tmp yt-dlp merge
  const outputPath = path.join(VIDEO_DIR, fileName);            // final AAC mp4

  console.log("▶ Downloading:", url);

  // Step 1: yt-dlp merge video + audio
  const ytdlp = spawn("yt-dlp", [
    "--js-runtimes", "node",
    "-f", "bestvideo+bestaudio/best",
    "--merge-output-format", "mp4",
    "-o", tmpPath,
    url
  ]);

  ytdlp.stderr.on("data", (data) => console.error(data.toString()));
  ytdlp.stdout.on("data", (data) => console.log(data.toString()));

  ytdlp.on("error", (err) => {
    console.error("yt-dlp process error:", err);
    if (!res.writableEnded) res.status(500).json({ message: "yt-dlp failed" });
  });

  ytdlp.on("close", (code) => {
    if (code !== 0) {
      console.error("yt-dlp exited with code", code);
      if (!res.writableEnded) res.status(500).json({ message: "yt-dlp failed" });
      return;
    }

    console.log("✔ yt-dlp merge done, converting audio to AAC...");

    // Step 2: ffmpeg convert audio to AAC (Windows-friendly)
    const ffmpeg = spawn("ffmpeg", [
      "-i", tmpPath,
      "-c:v", "copy",      // giữ nguyên video
      "-c:a", "aac",       // chuyển audio sang AAC
      "-b:a", "192k",
      "-y",                // overwrite nếu có
      outputPath
    ]);

    ffmpeg.stderr.on("data", (data) => console.log(data.toString()));

    ffmpeg.on("close", (ffCode) => {
      fs.unlink(tmpPath, () => {}); // xóa file tạm yt-dlp
      if (ffCode !== 0) {
        console.error("ffmpeg failed");
        if (!res.writableEnded) res.status(500).json({ message: "ffmpeg failed" });
        return;
      }

      // Step 3: stream file AAC mp4 về client
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Content-Type", "video/mp4");

      const stream = fs.createReadStream(outputPath);
      stream.pipe(res);

      stream.on("close", () => {
        fs.unlink(outputPath, () => {}); // xóa file final
        console.log("✔ Sent & deleted:", fileName);
      });
    });
  });

  res.on("close", () => {
    console.log("Client disconnected, killing yt-dlp/ffmpeg");
    ytdlp.kill("SIGINT");
  });
});

app.listen(3001, () => console.log("🚀 yt-dlp service running on port 3001"));

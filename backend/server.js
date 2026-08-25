const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const uploadDir = "/tmp/ai-edit-uploads";
const outputDir = "/tmp/ai-edit-outputs";

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const jobs = new Map();


// ========================================
// UPLOAD
// ========================================

const storage = multer.diskStorage({

  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },

  filename: function (req, file, cb) {

    const ext =
      path.extname(file.originalname) || ".mp4";

    const filename =
      `video-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 8)}${ext}`;

    cb(null, filename);
  }

});


const upload = multer({

  storage: storage,

  limits: {
    fileSize: 200 * 1024 * 1024
  },

  fileFilter: function (req, file, cb) {

    if (
      file.mimetype &&
      file.mimetype.startsWith("video/")
    ) {

      cb(null, true);

    } else {

      cb(
        new Error("Please upload a valid video file.")
      );

    }

  }

});


// ========================================
// HOME
// ========================================

app.get("/", (req, res) => {

  res.json({
    success: true,
    name: "AI Edit Studio",
    message: "AI Edit Studio backend is running.",
    version: "3.0.0"
  });

});


// ========================================
// HEALTH
// ========================================

app.get("/api/health", (req, res) => {

  res.json({
    success: true,
    status: "online",
    service: "AI Edit Studio"
  });

});


// ========================================
// CREATE JOB
// ========================================

app.post(
  "/api/create-short",
  upload.single("video"),
  async (req, res) => {

    if (!req.file) {

      return res.status(400).json({
        success: false,
        message: "Please upload a video."
      });

    }

    const jobId = crypto.randomUUID();

    const inputFile = req.file.path;

    const outputFile = path.join(
      outputDir,
      `ai-short-${jobId}.mp4`
    );

    const style =
      req.body.style || "cinematic";

    const music =
      req.body.music || "auto";

    const subtitle =
      req.body.subtitle || "yes";

    const effect =
      req.body.effect || "medium";

    const ratio =
      req.body.ratio ||
      req.body.aspect ||
      "9:16";

    const prompt =
      req.body.prompt || "";


    jobs.set(jobId, {

      status: "processing",

      progress: 0,

      message: "Starting video processing...",

      outputFile: outputFile,

      error: null

    });


    console.log("================================");
    console.log("NEW AI EDIT JOB");
    console.log("Job:", jobId);
    console.log("Style:", style);
    console.log("Music:", music);
    console.log("Subtitle:", subtitle);
    console.log("Effect:", effect);
    console.log("Ratio:", ratio);
    console.log("Prompt:", prompt);
    console.log("================================");


    // ====================================
    // ASPECT RATIO
    // ====================================

    let scaleFilter;

    if (ratio === "16:9") {

      scaleFilter =
        "scale=1280:720:force_original_aspect_ratio=increase," +
        "crop=1280:720";

    }

    else if (ratio === "original") {

      scaleFilter = "scale=trunc(iw/2)*2:trunc(ih/2)*2";

    }

    else {

      scaleFilter =
        "scale=720:1280:force_original_aspect_ratio=increase," +
        "crop=720:1280";

    }


    // ====================================
    // EFFECT
    // ====================================

    let effectFilter;

    if (effect === "low") {

      effectFilter =
        "eq=contrast=1.02:brightness=0.01:saturation=1.02";

    }

    else if (effect === "high") {

      effectFilter =
        "eq=contrast=1.10:brightness=0.03:saturation=1.12";

    }

    else {

      effectFilter =
        "eq=contrast=1.05:brightness=0.02:saturation=1.06";

    }


    // ====================================
    // STYLE
    // ====================================

    let styleFilter = "";

    if (style === "cinematic") {

      styleFilter =
        "eq=contrast=1.08:saturation=1.05";

    }

    else if (style === "funny") {

      styleFilter =
        "eq=contrast=1.08:brightness=0.04:saturation=1.15";

    }

    else if (style === "romantic") {

      styleFilter =
        "eq=brightness=0.04:saturation=1.08";

    }

    else if (style === "action") {

      styleFilter =
        "eq=contrast=1.15:saturation=1.12";

    }


    const filters = [

      scaleFilter,
      effectFilter,
      styleFilter

    ].filter(Boolean);


    const finalVideoFilter =
      filters.join(",");


    // ====================================
    // FFMPEG
    // ====================================

    const ffmpegArgs = [

      "-y",

      "-i",
      inputFile,

      "-vf",
      finalVideoFilter,

      "-c:v",
      "libx264",

      "-preset",
      "veryfast",

      "-crf",
      "23",

      "-c:a",
      "aac",

      "-b:a",
      "128k",

      "-ar",
      "48000",

      "-movflags",
      "+faststart",

      outputFile

    ];


    const ffmpeg =
      spawn("ffmpeg", ffmpegArgs);


    let errorOutput = "";


    // ====================================
    // GET VIDEO DURATION
    // ====================================

    let duration = 0;


    const ffprobe =
      spawn("ffprobe", [

        "-v",
        "error",

        "-show_entries",
        "format=duration",

        "-of",
        "default=noprint_wrappers=1:nokey=1",

        inputFile

      ]);


    let durationOutput = "";


    ffprobe.stdout.on("data", data => {

      durationOutput += data.toString();

    });


    ffprobe.on("close", () => {

      duration =
        parseFloat(durationOutput) || 0;

    });


    // ====================================
    // FFMPEG PROGRESS
    // ====================================

    ffmpeg.stderr.on("data", data => {

      const text =
        data.toString();

      errorOutput += text;


      const match =
        text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);

      if (match && duration > 0) {

        const hours =
          Number(match[1]);

        const minutes =
          Number(match[2]);

        const seconds =
          Number(match[3]);

        const currentTime =
          hours * 3600 +
          minutes * 60 +
          seconds;


        let percent =
          Math.round(
            (currentTime / duration) * 100
          );


        percent =
          Math.max(
            1,
            Math.min(99, percent)
          );


        const job =
          jobs.get(jobId);

        if (job) {

          job.progress =
            percent;

          job.message =
            `Processing video... ${percent}%`;

        }

      }

    });


    // ====================================
    // FFMPEG ERROR
    // ====================================

    ffmpeg.on("error", error => {

      console.error(
        "FFmpeg error:",
        error
      );


      cleanupFile(inputFile);


      const job =
        jobs.get(jobId);

      if (job) {

        job.status = "failed";

        job.progress = 0;

        job.message =
          "Video processing service could not start.";

        job.error =
          error.message;

      }

    });


    // ====================================
    // COMPLETE
    // ====================================

    ffmpeg.on("close", code => {

      cleanupFile(inputFile);


      const job =
        jobs.get(jobId);


      if (code !== 0) {

        console.error(
          errorOutput
        );


        if (job) {

          job.status = "failed";

          job.progress = 0;

          job.message =
            "Video processing failed.";

          job.error =
            errorOutput.slice(-2000);

        }

        return;

      }


      if (
        !fs.existsSync(outputFile)
      ) {

        if (job) {

          job.status = "failed";

          job.progress = 0;

          job.message =
            "Edited video could not be created.";

        }

        return;

      }


      if (job) {

        job.status = "completed";

        job.progress = 100;

        job.message =
          "Your edited video is ready.";

      }


      console.log(
        "AI Short created:",
        jobId
      );

    });


    // ====================================
    // SEND JOB ID
    // ====================================

    res.json({

      success: true,

      jobId: jobId,

      message:
        "Video processing started."

    });

  }
);


// ========================================
// JOB STATUS
// ========================================

app.get(
  "/api/create-short/status/:jobId",
  (req, res) => {

    const job =
      jobs.get(
        req.params.jobId
      );


    if (!job) {

      return res.status(404).json({

        success: false,

        message:
          "Job not found."

      });

    }


    res.json({

      success: true,

      status:
        job.status,

      progress:
        job.progress,

      message:
        job.message,

      error:
        job.error

    });

  }
);


// ========================================
// DOWNLOAD RESULT
// ========================================

app.get(
  "/api/create-short/result/:jobId",
  (req, res) => {

    const job =
      jobs.get(
        req.params.jobId
      );


    if (!job) {

      return res.status(404).json({

        success: false,

        message:
          "Job not found."

      });

    }


    if (
      job.status !== "completed"
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Video is not ready yet."

      });

    }


    if (
      !fs.existsSync(
        job.outputFile
      )
    ) {

      return res.status(404).json({

        success: false,

        message:
          "Output video no longer exists."

      });

    }


    res.setHeader(
      "Content-Type",
      "video/mp4"
    );


    res.setHeader(
      "Content-Disposition",
      'inline; filename="AI-Edit-Studio-Video.mp4"'
    );


    const stream =
      fs.createReadStream(
        job.outputFile
      );


    stream.pipe(res);


    stream.on("close", () => {

      cleanupFile(
        job.outputFile
      );

      jobs.delete(
        req.params.jobId
      );

    });

  }
);


// ========================================
// CLEANUP
// ========================================

function cleanupFile(filePath) {

  try {

    if (
      filePath &&
      fs.existsSync(filePath)
    ) {

      fs.unlinkSync(
        filePath
      );

    }

  }

  catch (error) {

    console.error(
      "Cleanup error:",
      error.message
    );

  }

}


// ========================================
// ERROR HANDLER
// ========================================

app.use(
  (error, req, res, next) => {

    console.error(
      "Server error:",
      error
    );


    if (
      error instanceof multer.MulterError
    ) {

      if (
        error.code === "LIMIT_FILE_SIZE"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Video is too large. Maximum size is 200 MB."

        });

      }


      return res.status(400).json({

        success: false,

        message:
          error.message

      });

    }


    return res.status(400).json({

      success: false,

      message:
        error.message ||
        "Something went wrong."

    });

  }
);


// ========================================
// START SERVER
// ========================================

app.listen(
  PORT,
  () => {

    console.log(
      `AI Edit Studio server running on port ${PORT}`
    );

  }
);

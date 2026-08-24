const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const uploadDir = "/tmp/ai-edit-uploads";
const outputDir = "/tmp/ai-edit-outputs";

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });


// ========================================
// FILE UPLOAD
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

    version: "2.0.0"

  });

});


// ========================================
// HEALTH CHECK
// ========================================

app.get("/api/health", (req, res) => {

  res.json({

    success: true,

    status: "online",

    service: "AI Edit Studio"

  });

});


// ========================================
// CREATE SHORT
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


    const inputFile = req.file.path;

    const outputFile = path.join(
      outputDir,
      `ai-short-${Date.now()}.mp4`
    );


    // ====================================
    // USER SETTINGS
    // ====================================

    const style =
      req.body.style || "cinematic";

    const effect =
      req.body.effect || "medium";

    const aspect =
      req.body.aspect || "9:16";


    console.log("================================");
    console.log("AI EDIT REQUEST");
    console.log("Style:", style);
    console.log("Effect:", effect);
    console.log("Aspect:", aspect);
    console.log("Input:", inputFile);
    console.log("================================");


    // ====================================
    // ASPECT RATIO
    // ====================================

    let scaleFilter;

    if (aspect === "16:9") {

      scaleFilter =
        "scale=1280:720:force_original_aspect_ratio=increase," +
        "crop=1280:720";

    } else {

      scaleFilter =
        "scale=720:1280:force_original_aspect_ratio=increase," +
        "crop=720:1280";

    }


    // ====================================
    // EFFECT LEVEL
    // ====================================

    let effectFilter = "";

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

    else {

      styleFilter = "";

    }


    // ====================================
    // FINAL FILTER
    // ====================================

    const filters = [

      scaleFilter,

      effectFilter,

      styleFilter

    ].filter(Boolean);


    const finalVideoFilter =
      filters.join(",");


    // ====================================
    // FFMPEG COMMAND
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


    console.log("Starting FFmpeg...");


    const ffmpeg =
      spawn("ffmpeg", ffmpegArgs);


    let errorOutput = "";


    // ====================================
    // FFMPEG LOG
    // ====================================

    ffmpeg.stderr.on("data", (data) => {

      const text = data.toString();

      errorOutput += text;

      console.log(text.trim());

    });


    // ====================================
    // FFMPEG ERROR
    // ====================================

    ffmpeg.on("error", (error) => {

      console.error(
        "FFmpeg start error:",
        error
      );

      cleanupFile(inputFile);

      if (!res.headersSent) {

        res.status(500).json({

          success: false,

          message:
            "Video processing service could not start.",

          error:
            error.message

        });

      }

    });


    // ====================================
    // COMPLETE
    // ====================================

    ffmpeg.on("close", (code) => {

      console.log(
        "FFmpeg finished with code:",
        code
      );


      cleanupFile(inputFile);


      if (code !== 0) {

        console.error(errorOutput);

        return res.status(500).json({

          success: false,

          message:
            "Video processing failed.",

          error:
            errorOutput.slice(-2000)

        });

      }


      if (!fs.existsSync(outputFile)) {

        return res.status(500).json({

          success: false,

          message:
            "Edited video could not be created."

        });

      }


      console.log(
        "AI Short created successfully."
      );


      // =================================
      // SEND VIDEO
      // =================================

      res.setHeader(
        "Content-Type",
        "video/mp4"
      );

      res.setHeader(
        "Content-Disposition",
        'inline; filename="ai-edit-short.mp4"'
      );


      const readStream =
        fs.createReadStream(outputFile);


      readStream.pipe(res);


      readStream.on("close", () => {

        cleanupFile(outputFile);

      });


      readStream.on("error", (error) => {

        console.error(
          "Output stream error:",
          error
        );

        cleanupFile(outputFile);

      });

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

      fs.unlinkSync(filePath);

    }

  } catch (error) {

    console.error(
      "Cleanup error:",
      error.message
    );

  }

}


// ========================================
// ERROR HANDLER
// ========================================

app.use((error, req, res, next) => {

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

      message: error.message

    });

  }


  return res.status(400).json({

    success: false,

    message:
      error.message ||
      "Something went wrong."

  });

});


// ========================================
// START SERVER
// ========================================

app.listen(PORT, () => {

  console.log(
    `AI Edit Studio server running on port ${PORT}`
  );

});

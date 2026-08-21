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


// ========================================
// CREATE TEMP DIRECTORIES
// ========================================

fs.mkdirSync(uploadDir, {
  recursive: true
});

fs.mkdirSync(outputDir, {
  recursive: true
});


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
        new Error(
          "Please upload a valid video file."
        )
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

    message:
      "AI Edit Studio backend is running.",

    version: "1.0.0"

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

        message:
          "Please upload a video from your device."

      });

    }


    const inputFile =
      req.file.path;


    const outputFile =
      path.join(
        outputDir,
        `ai-short-${Date.now()}.mp4`
      );


    console.log(
      "--------------------------------"
    );

    console.log(
      "New video processing request"
    );

    console.log(
      "Input:",
      inputFile
    );

    console.log(
      "Output:",
      outputFile
    );


    // ====================================
    // AUTO EDIT FILTER
    // ====================================

    const videoFilter =

      "scale=720:1280:" +
      "force_original_aspect_ratio=increase," +

      "crop=720:1280," +

      "eq=" +
      "contrast=1.04:" +
      "brightness=0.02:" +
      "saturation=1.05";


    // ====================================
    // AI EDIT STUDIO LOGO
    // ====================================

    const logoText =
      "AI EDIT STUDIO";


    const fontPath =
      "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";


    const finalVideoFilter =

      videoFilter +

      "," +

      `drawtext=` +

      `fontfile=${fontPath}:` +

      `text='${logoText}':` +

      `fontcolor=white:` +

      `fontsize=24:` +

      `box=1:` +

      `boxcolor=black@0.45:` +

      `boxborderw=8:` +

      `x=w-tw-25:` +

      `y=25`;


    // ====================================
    // FFMPEG COMMAND
    // ====================================

    const ffmpegArgs = [

      "-y",

      "-i",
      inputFile,


      // Video filter
      "-vf",
      finalVideoFilter,


      // H.264 video
      "-c:v",
      "libx264",

      "-preset",
      "veryfast",

      "-crf",
      "23",


      // Audio
      "-c:a",
      "aac",

      "-b:a",
      "128k",

      "-ar",
      "48000",


      // Web/mobile friendly MP4
      "-movflags",
      "+faststart",


      outputFile

    ];


    console.log(
      "Starting FFmpeg..."
    );


    const ffmpeg =
      spawn(
        "ffmpeg",
        ffmpegArgs
      );


    let errorOutput = "";


    // ====================================
    // FFMPEG LOG
    // ====================================

    ffmpeg.stderr.on(
      "data",
      (data) => {

        const text =
          data.toString();

        errorOutput += text;

        console.log(
          text.trim()
        );

      }
    );


    // ====================================
    // FFMPEG START ERROR
    // ====================================

    ffmpeg.on(
      "error",
      (error) => {

        console.error(
          "FFmpeg start error:",
          error
        );


        cleanupFile(
          inputFile
        );


        if (!res.headersSent) {

          res.status(500).json({

            success: false,

            message:
              "Video processing service could not start.",

            error:
              error.message

          });

        }

      }
    );


    // ====================================
    // FFMPEG COMPLETE
    // ====================================

    ffmpeg.on(
      "close",
      (code) => {

        console.log(
          "FFmpeg finished with code:",
          code
        );


        // Delete original upload
        cleanupFile(
          inputFile
        );


        if (code !== 0) {

          console.error(
            "FFmpeg processing failed:"
          );

          console.error(
            errorOutput
          );


          return res.status(500).json({

            success: false,

            message:
              "Video processing failed.",

            error:
              errorOutput.slice(-2000)

          });

        }


        // Check output
        if (
          !fs.existsSync(
            outputFile
          )
        ) {

          return res.status(500).json({

            success: false,

            message:
              "The edited video could not be created."

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
          fs.createReadStream(
            outputFile
          );


        readStream.pipe(
          res
        );


        readStream.on(
          "close",
          () => {

            cleanupFile(
              outputFile
            );

            console.log(
              "Output file cleaned."
            );

          }
        );


        readStream.on(
          "error",
          (error) => {

            console.error(
              "Output stream error:",
              error
            );

            cleanupFile(
              outputFile
            );

          }
        );

      }

    );

  }
);


// ========================================
// CLEANUP FUNCTION
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

  } catch (error) {

    console.error(
      "Cleanup error:",
      error.message
    );

  }

}


// ========================================
// MULTER / GENERAL ERROR
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

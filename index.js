require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const nodemailer = require("nodemailer");
const twilio = require("twilio");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const listOfAsks = require("./asks");
const electricianInterviewQuestionnaire = require("./electrician");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const {
  ELEVENLABS_API_KEY,
  EMAIL_USER,
  EMAIL_PASS,
  EMAIL_TO,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
} = process.env;

const ELEVEN_CONVO_URL = "https://api.us.elevenlabs.io/v1/convai/conversations";
const prompts = new Map();
let lastProcessedConversationId = null;

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
});

app.post("/send-sms", async (req, res) => {
  const { number, firstName, lastName, occupation, language } = req.body;
  if (!number || !firstName || !lastName || !occupation) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const questions = listOfAsks[occupation] || [];
  const formattedQuestions = questions.map((q) => `- ${q}`).join("");

  const prompt = `You are Joe, an AI recruiter interviewing ${firstName} ${lastName} for a ${occupation} position. Ask:
${formattedQuestions}`;

  prompts.set(number, {
    prompt,
    firstName,
    lastName,
    occupation,
    language: language || "en",
    phoneNumber: number,
  });

  try {
    await twilioClient.messages.create({
      body: `Hi ${firstName}, please call to begin your interview: ${TWILIO_PHONE_NUMBER}`,
      from: TWILIO_PHONE_NUMBER,
      to: number,
    });
    res.status(200).json({ message: "Prompt saved & SMS sent." });
  } catch (err) {
    console.error("SMS send error:", err.message);
    res.status(500).json({ error: "Failed to send SMS" });
  }
});

app.post("/elevenlabs/prompt", (req, res) => {
  const { caller_id } = req.body;
  const record = prompts.get(caller_id);
  if (!record) return res.status(404).json({ error: "Prompt not found" });

  const { prompt, firstName, occupation, language } = record;
  const firstMessage =
    language === "es"
      ? `Hola ${firstName}, soy Joe. Comencemos tu entrevista para ${occupation}`
      : `Hi ${firstName}, I’m Joe. Let’s begin your interview for the ${occupation} position.`;

  res.json({
    type: "conversation_initiation_client_data",
    conversation_config_override: {
      agent: {
        prompt: { prompt },
        first_message: firstMessage,
        language,
      },
    },
  });
});

app.post("/twilio/status", (req, res) => {
  const { CallStatus } = req.body;
  res.send("OK");
  if (CallStatus === "completed") {
    setTimeout(fetchLatestTranscriptAndSendPDFEmail, 20000);
  }
});

async function fetchLatestTranscriptAndSendPDFEmail() {
  try {
    const { data } = await axios.get(ELEVEN_CONVO_URL, {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
      params: { page_size: 10 },
    });

    const latest = data.conversations
      .filter((c) => c.status === "done")
      .sort(
        (a, b) =>
          (b.metadata?.start_time_unix_secs || 0) -
          (a.metadata?.start_time_unix_secs || 0)
      )[0];

    if (!latest || latest.conversation_id === lastProcessedConversationId)
      return;

    lastProcessedConversationId = latest.conversation_id;

    const convoResp = await axios.get(
      `${ELEVEN_CONVO_URL}/${latest.conversation_id}`,
      {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      }
    );

    const { transcript, metadata, analysis } = convoResp.data;
    const results = analysis?.data_collection_results || {};
    const summary = analysis?.transcript_summary || "No summary available";

    const phoneNumber =
      metadata.phone_call?.external_number || metadata.phoneNumber || "Unknown";
    let { firstName, lastName, occupation } = prompts.get(phoneNumber) || {};

    const pdfPath = await generateTranscriptPDF({
      firstName: firstName || "Unknown",
      lastName: lastName || "",
      phoneNumber,
      occupation: occupation || "Unknown",
      summary,
      transcript,
      convoId: latest.conversation_id,
      results,
      electricianInterviewQuestionnaire,
    });

    await transporter.sendMail({
      from: EMAIL_USER,
      to: EMAIL_TO,
      subject: `Interview Report: ${firstName} ${lastName}`,
      text: `See attached interview transcript.`,
      attachments: [
        { filename: `Transcript_${latest.conversation_id}.pdf`, path: pdfPath },
      ],
    });

    fs.unlink(pdfPath, () => console.log("Temporary PDF deleted"));
  } catch (err) {
    console.error("Error in fetchLatestTranscriptAndSendPDFEmail:", err);
  }
}

function generateTranscriptPDF({
  firstName,
  lastName,
  phoneNumber,
  occupation,
  summary,
  transcript,
  convoId,
  results,
  electricianInterviewQuestionnaire,
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const filePath = path.join(__dirname, `transcript_${convoId}.pdf`);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Function to add a new page and redraw headers if necessary
    const addNewPageIfNeeded = (requiredHeight, sectionTitle = null) => {
      const bottomMargin = doc.page.height - doc.page.margins.bottom;
      if (doc.y + requiredHeight > bottomMargin) {
        doc.addPage();
        // Redraw main headers for new pages in the questionnaire section
        if (sectionTitle === "questionnaire") {
          doc
            .fontSize(18)
            .fillColor("#003366")
            .text("Electrician Interview Questionnaire (Continued)", {
              align: "center",
            });
          doc.moveDown(0.5);
          drawTableHeaders(
            doc,
            tableX,
            questionColWidth,
            answerColWidth,
            rowPadding
          ); // Redraw table headers
        } else if (sectionTitle === "transcript") {
          doc
            .fontSize(16)
            .fillColor("#000000")
            .text("Full Transcript (Continued)", { underline: true });
          doc.moveDown(0.4);
        }
      }
    };

    // Header with candidate info
    doc
      .fontSize(22)
      .fillColor("#003366")
      .text(`${firstName.toUpperCase()} ${lastName.toUpperCase()}`, {
        align: "center",
      });
    doc
      .fontSize(14)
      .fillColor("#333")
      .text(`Phone Number: ${phoneNumber}`, { align: "center" });
    doc
      .fontSize(14)
      .fillColor("#333")
      .text(`Position Applied: ${occupation}`, { align: "center" });

    doc.moveDown(1);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(1.2);

    // Interview Summary section
    doc
      .fontSize(16)
      .fillColor("#000000")
      .text("Interview Summary", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(12).fillColor("#222").text(summary);

    // Electrician Interview Questionnaire Table
    doc.moveDown(1.2);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(1);

    doc
      .fontSize(18)
      .fillColor("#003366")
      .text("Electrician Interview Questionnaire", { align: "center" });
    doc.moveDown(0.5);

    const tableX = 40;
    const tableWidth = 515; // Total width from margin to margin (595 - 40*2)
    const questionColWidth = tableWidth * 0.7; // 70% for questions
    const answerColWidth = tableWidth * 0.3; // 30% for answers
    const rowPadding = 5;
    const headerHeight = 25; // Height of the header row

    // Helper to draw table headers
    const drawTableHeaders = (document, x, qWidth, aWidth, padding) => {
      let headerY = document.y;
      document.rect(x, headerY, qWidth, headerHeight).stroke();
      document.rect(x + qWidth, headerY, aWidth, headerHeight).stroke();
      document.font("Helvetica-Bold").fontSize(12).fillColor("#000000");
      document.text("Questions", x + padding, headerY + padding, {
        width: qWidth - 2 * padding,
        align: "left",
      });
      document.text("Answers", x + qWidth + padding, headerY + padding, {
        width: aWidth - 2 * padding,
        align: "left",
      });
      document.y = headerY + headerHeight;
    };

    // Draw initial table headers
    drawTableHeaders(doc, tableX, questionColWidth, answerColWidth, rowPadding);

    electricianInterviewQuestionnaire.forEach((category) => {
      // Estimate space needed for category title
      const categoryTitleEstimateHeight = 25; // Approx height for title row
      addNewPageIfNeeded(categoryTitleEstimateHeight, "questionnaire");

      // Category Title Row
      let currentY = doc.y;
      const categoryTitleHeight = 25;
      doc.rect(tableX, currentY, tableWidth, categoryTitleHeight).stroke(); // Span full width for category title
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#003366");
      doc.text(
        category.categoryTitle,
        tableX + rowPadding,
        currentY + rowPadding,
        { width: tableWidth - 2 * rowPadding }
      );
      doc.y = currentY + categoryTitleHeight;

      category.questions.forEach((q) => {
        const questionText = q.question;
        const answerText =
          q.fieldId && results[q.fieldId]?.value
            ? String(results[q.fieldId].value)
            : "";

        // Calculate heights for both question and answer to determine row height
        const questionTextHeight = doc.heightOfString(questionText, {
          width: questionColWidth - 2 * rowPadding,
          lineGap: 2,
        });
        const answerTextHeight = doc.heightOfString(answerText, {
          width: answerColWidth - 2 * rowPadding,
          lineGap: 2,
        });
        const cellHeight =
          Math.max(questionTextHeight, answerTextHeight) + 2 * rowPadding;
        const effectiveCellHeight = Math.max(cellHeight, 20); // Minimum height for a cell

        // Check if there's enough space for the current question row
        addNewPageIfNeeded(effectiveCellHeight, "questionnaire");

        currentY = doc.y;

        // Draw cells for the current row
        doc
          .rect(tableX, currentY, questionColWidth, effectiveCellHeight)
          .stroke();
        doc
          .rect(
            tableX + questionColWidth,
            currentY,
            answerColWidth,
            effectiveCellHeight
          )
          .stroke();

        // Draw question text (left aligned within its cell)
        doc.font("Helvetica").fontSize(10).fillColor("#000000");
        doc.text(questionText, tableX + rowPadding, currentY + rowPadding, {
          width: questionColWidth - 2 * rowPadding,
          align: "left",
          lineGap: 2,
          stroke: false,
        });

        // Draw answer text (left aligned within its cell) or blank line
        doc.font("Helvetica-Oblique").fontSize(10).fillColor("#222");
        if (answerText) {
          doc.text(
            answerText,
            tableX + questionColWidth + rowPadding,
            currentY + rowPadding,
            {
              width: answerColWidth - 2 * rowPadding,
              align: "left",
              lineGap: 2,
              stroke: false,
            }
          );
        } else {
          // Draw a placeholder line if no answer
          const lineStartX = tableX + questionColWidth + rowPadding;
          const lineEndX = tableX + tableWidth - rowPadding;
          const lineY = currentY + effectiveCellHeight - rowPadding; // Position line near bottom of cell

          doc
            .moveTo(lineStartX, lineY)
            .lineTo(lineEndX, lineY)
            .strokeColor("#cccccc")
            .stroke();
        }

        doc.y = currentY + effectiveCellHeight; // Move cursor down for the next row
      });
    });

    // Full Transcript section
    doc.moveDown(1.2);
    // Check if enough space for transcript title before drawing line
    addNewPageIfNeeded(30, "transcript"); // Estimate height for line and title
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(1);

    doc
      .fontSize(16)
      .fillColor("#000000")
      .text("Full Transcript", { underline: true });
    doc.moveDown(0.4);

    transcript.forEach(({ role, message }) => {
      const label = role === "agent" ? "AGENT:" : "CANDIDATE:";
      // Estimate height for transcript line
      const transcriptLineHeight =
        doc.heightOfString(`${label} ${message}`, { width: tableWidth }) + 10; // + paragraphGap
      addNewPageIfNeeded(transcriptLineHeight, "transcript");

      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("#003366")
        .text(label, { continued: true });
      doc
        .font("Helvetica")
        .fillColor("#000000")
        .text(` ${message}`, { paragraphGap: 10 });
    });

    doc.end();
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);

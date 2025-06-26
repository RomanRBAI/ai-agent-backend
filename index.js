require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const nodemailer = require("nodemailer");
const twilio = require("twilio");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { table } = require("pdfkit-table");
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
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const filePath = path.join(__dirname, `transcript_${convoId}.pdf`);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Header
    doc
      .fontSize(20)
      .fillColor("#003366")
      .text(`${firstName} ${lastName}`, { align: "center" });
    doc
      .fontSize(12)
      .fillColor("black")
      .text(`Phone: ${phoneNumber}`, { align: "center" });
    doc.text(`Position: ${occupation}`, { align: "center" });
    doc.moveDown().moveTo(40, doc.y).lineTo(555, doc.y).stroke();

    // Summary
    doc
      .moveDown()
      .fontSize(16)
      .fillColor("black")
      .text("Interview Summary", { underline: true });
    doc.fontSize(11).text(summary || "No summary available");
    doc.moveDown();

    // Table-style Interview Section
    doc
      .fontSize(16)
      .fillColor("#003366")
      .text("Interview Responses", { align: "center" });
    doc.moveDown();

    electricianInterviewQuestionnaire.forEach((category) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(13)
        .fillColor("#003366")
        .text(category.categoryTitle);
      doc.moveDown(0.5);

      const rows = category.questions.map((q) => [
        q.question,
        results[q.fieldId]?.value || "—",
      ]);

      // Draw table
      doc.table({
        headers: ["Question", "Answer"],
        rows,
        options: {
          columnSpacing: 15,
          padding: 5,
          width: 500,
        },
      });

      doc.moveDown();
    });

    // Transcript section
    doc.moveDown().fontSize(16).text("Full Transcript", { underline: true });
    transcript.forEach(({ role, message }) => {
      const label = role === "agent" ? "AGENT:" : "CANDIDATE:";
      doc.font("Helvetica-Bold").text(label, { continued: true });
      doc.font("Helvetica").text(` ${message}`, { paragraphGap: 8 });
    });

    doc.end();
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);

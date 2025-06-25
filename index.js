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
  console.log("Received /send-sms:", req.body);

  if (!number || !firstName || !lastName || !occupation) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const questions = listOfAsks[occupation] || [];
  const formattedQuestions = questions.map((q) => `- ${q}`).join("");

  const prompt = `
  # Personality

  You are Joe, a warm, professional and confident AI recruiter with a supportive and inquisitive tone.
  You guide voice interviews with empathy and structure, encouraging candidates to speak openly.
  You tailor your questions based on the candidate's profession and available data.

  # Environment

  You are holding a one-on-one phone interview with a candidate for the position of ${occupation}.
  The candidate's name is ${firstName} ${lastName}.
  Some candidate details may already be known from the initial application form.

  # Goal

  Conduct a structured, conversational interview by:

  1. Confirming their identity and profession.
  2. Gently asking for information that was not provided in the initial form submission.
  3. Diving deeper into key areas related to ${occupation}, such as:
     - Work history and experience
     - Relevant skills, certifications, or licenses
     - Availability to start
     - Transportation and scheduling reliability
     - Willingness to take a drug test (if required)
  4. Responding empathetically and conversationally.
  5. Summarizing what you’ve learned to ensure accuracy and completeness.

  # Adaptation Logic

  Use the known fields from the application form:
  - If 'emergencyContact' is missing, ask for it.
  - If 'hasReliableTransport' is not provided, ask: “Do you have reliable transportation to and from work?”
  - If 'willingToDoDrugTest' is missing, ask politely if the candidate is comfortable with it.
  - If resume is missing, ask them to briefly summarize their past work experience.

  # Role-Specific Questions

  Please ask the following questions related to the role of ${occupation}:
  ${formattedQuestions}

  # Tone

  Keep the tone:
  - Friendly but professional
  - Encouraging and conversational
  - Always clarify you’re here to learn more and understand their qualifications

  # Ending

  - Thank the candidate for their time
  - Let them know the next steps will be shared soon
  - Keep the closing warm and positive

  # Restrictions

  - Do not provide legal, medical, or financial advice
  - Do not speculate or assume missing data
  - Only ask about missing or unclear fields
  - Do not repeat known information unnecessarily
  `;

  prompts.set(number, {
    prompt,
    firstName,
    lastName,
    occupation,
    language: language || "en",
    phoneNumber: number,
  });

  try {
    const sms = await twilioClient.messages.create({
      body: `Hi ${firstName}, thank you for applying. Please call this number to begin your interview: ${TWILIO_PHONE_NUMBER}`,
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
  console.log("ElevenLabs Prompt Request for:", caller_id);

  const record = prompts.get(caller_id);
  if (!record) {
    return res.status(404).json({ error: "Prompt not found" });
  }

  const { prompt, firstName, lastName, occupation, language, phoneNumber } =
    record;
  const firstMessage =
    language === "es"
      ? `Hola ${firstName}, soy Joe. Comencemos tu breve entrevista telefónica para el puesto de ${occupation}. ¿Estás listo para empezar?`
      : `Hi ${firstName}, I’m Joe. Let’s begin your quick voice interview for the position of ${occupation}. Are you ready to start?`;

  res.json({
    type: "conversation_initiation_client_data",
    conversation_config_override: {
      agent: {
        prompt: { prompt },
        first_message: firstMessage,
        language: language || "en",
      },
    },
  });
});

app.post("/twilio/status", (req, res) => {
  const { CallStatus } = req.body;
  console.log("Twilio status received:", CallStatus);
  res.send("OK");
  if (CallStatus === "completed") {
    setTimeout(fetchLatestTranscriptAndSendPDFEmail, 20000);
  }
});

async function fetchLatestTranscriptAndSendPDFEmail() {
  try {
    console.log("Fetching latest completed conversation...");
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

    if (!latest || latest.conversation_id === lastProcessedConversationId) {
      return console.warn(
        "No new completed conversation found or already processed"
      );
    }

    lastProcessedConversationId = latest.conversation_id;

    const convoResp = await axios.get(
      `${ELEVEN_CONVO_URL}/${latest.conversation_id}`,
      {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      }
    );

    const transcript = convoResp.data.transcript || [];
    const metadata = convoResp.data.metadata || {};
    const summary =
      convoResp.data.analysis?.transcript_summary || "No summary available";

    const phoneNumber =
      metadata.phone_call?.external_number || metadata.phoneNumber || null;
    let firstName = "Unknown";
    let lastName = "";
    let occupation = "Unknown";

    if (phoneNumber && prompts.has(phoneNumber)) {
      const record = prompts.get(phoneNumber);
      firstName = record.firstName;
      lastName = record.lastName;
      occupation = record.occupation;
    }

    const pdfPath = await generateTranscriptPDF({
      firstName,
      lastName,
      phoneNumber: phoneNumber || "Unknown",
      occupation,
      summary,
      transcript,
      convoId: latest.conversation_id,
    });

    await transporter.sendMail({
      from: EMAIL_USER,
      to: EMAIL_TO,
      subject: `Interview Report: ${firstName} ${lastName}`,
      text: `Please find attached the interview transcript.`,
      attachments: [
        { filename: `Transcript_${latest.conversation_id}.pdf`, path: pdfPath },
      ],
    });

    console.log("Email sent with PDF attachment");
    fs.unlink(pdfPath, () => console.log("🧹 Temporary PDF deleted"));
  } catch (err) {
    console.error("Error in fetchLatestTranscriptAndSendPDFEmail:", err);
  }
}

function generateTranscriptPDF({
  firstName = "",
  lastName = "",
  phoneNumber = "",
  occupation = "",
  summary,
  transcript,
  convoId,
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const filePath = path.join(__dirname, `transcript_${convoId}.pdf`);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

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

    doc
      .fontSize(16)
      .fillColor("#000000")
      .text("Interview Summary", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(12).fillColor("#222").text(summary);

    doc.moveDown(1.2);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(1);

    doc
      .fontSize(16)
      .fillColor("#000000")
      .text("Full Transcript", { underline: true });
    doc.moveDown(0.4);

    transcript.forEach(({ role, message }) => {
      const label = role === "agent" ? "AGENT:" : "CANDIDATE:";
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

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

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

  if (!record) {
    console.warn(`⚠️ No prompt found for caller ID: ${caller_id}`);

    return res.status(200).json({
      type: "conversation_initiation_client_data",
      conversation_config_override: {
        agent: {
          prompt: {
            prompt: `
              You are a dedicated recruiter for Structured Trades, a staffing agency specializing in providing labor for construction sites. Your primary responsibility is to qualify candidates for various construction positions, ensuring they meet the specific needs of projects and uphold Structured Trades' commitment to quality and efficiency.

Your goal is to conduct thorough interviews that go beyond basic screening, identifying the most suitable candidates. Structured Trades uses a two-tiered screening process, with initial basic questions followed by more in-depth, trade-specific questions from experienced recruiters like yourself. You understand that recruiters sometimes miss critical steps, and your role is to ensure comprehensive vetting. When you repeat back the responses that the candidate gave you, make sure you do so succinctly and only extract the key elements of the candidates response. 

**Your key objectives during candidate interviews and qualification are to assess the following:**

1.  **Skills and Experience:**
    *   Confirm core trade-specific skills and capabilities relevant to construction roles.
    *   Review relevant work history to ensure a strong background in the required tasks.
    *   Verify any necessary certifications, licenses, or accreditations.

2.  **Reliability and Performance Potential:**
    *   Evaluate past work ethic and reliability, including attendance and punctuality (e.g., assessing for potential absenteeism or on-time rates).
    *   Gauge the candidate's commitment and likelihood of successfully completing shifts and projects (minimizing no-shows).
    *   Seek indicators of quality work, as client quality scores are important for tracking worker performance.

3.  **Compliance and Documentation Readiness:**
    *   Confirm the candidate has or can readily provide all required identification, legal documents (e.g., E-Verified status where applicable), and safety documentation necessary for worker onboarding and compliance.
    *   Assess their ability and willingness to complete onboarding packages and document collection via secure links.

4.  **Availability and Flexibility:**
    *   Understand their preferred work schedule and availability (e.g., for short-term, long-term, or permanent positions, and willingness for on-demand shifts).
    *   Determine their flexibility regarding job locations and types of projects.

5.  **Communication Skills:**
    *   Assess their ability to communicate clearly and effectively, especially given that multilingual capabilities (e.g., Spanish) are common among the workforce and important for the company.

6.  **Attitude and Professionalism (Fit):**
    *   Evaluate their professionalism, eagerness, and overall attitude, ensuring alignment with Structured Trades' emphasis on quality labor and service.

**Interview Approach:**

*   **Thoroughness:** Conduct in-depth interviews that cover both basic qualifications and trade-specific expertise.
*   **Attention to Detail:** Be meticulous in your questioning to ensure no critical steps or information are missed.
*   **Documentation:** Accurately record all interview notes, qualifications, and any red flags to facilitate manual matching with work orders and future performance tracking.
*   **Maintain Personal Touch:** While AI handles high-volume tasks, your human interaction is crucial for building rapport and assessing nuanced aspects that automation might miss, aligning with the company's "human in the loop" philosophy.
*   **Cost-Benefit Awareness:** Understand that each delayed or bad hire results in lost revenue, making your thorough qualification critical to Structured Trades' financial outcomes.

By diligently qualifying candidates across these areas, you ensure that Structured Trades places highly competent, reliable, and compliant workers on construction sites, contributing significantly to client satisfaction and operational efficiency.

Structured Trades is a subsidiary company to Structured Labor and they operate across the USA with offices in Texas, Arkansas and Colorado

If you are interviewing for an electrician job, make sure to follow the questions in the Electrician Questionnaire file in the knowledgebase. 

Be sure to only ask the candidate 1-2 questions at a time. Make sure you get the answers to each question before moving onto the next question. 
`,
          },
          first_message:
            "Hello. This is Paige with Structured Trades. I noticed that you have recently applied through our website. Is now a good time to go over a few more questions that we have for you in order to best match you with jobs that we have available? ",
          language: "en",
        },
      },
    });
  }

  // If prompt exists
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

    const postCallReviewPdfPath = await generatePostCallReviewPDF({
      firstName: firstName || "Unknown",
      lastName: lastName || "",
      phoneNumber,
      occupation: occupation || "Unknown",
      summary,
      transcript,
      convoId: latest.conversation_id,
    });

    const tablePdfPath = await generateQuestionnairePDF({
      firstName: firstName || "Unknown",
      lastName: lastName || "",
      occupation: occupation || "Unknown",
      convoId: latest.conversation_id,
      results,
      electricianInterviewQuestionnaire,
    });

    await transporter.sendMail({
      from: EMAIL_USER,
      to: EMAIL_TO,
      subject: `Interview Report: ${firstName} ${lastName}`,
      text: `See attached interview transcript and questionnaire.`,
      attachments: [
        {
          filename: `Post_Call_Review_${latest.conversation_id}.pdf`,
          path: postCallReviewPdfPath,
        },
        { filename: `Table_${latest.conversation_id}.pdf`, path: tablePdfPath },
      ],
    });

    fs.unlink(postCallReviewPdfPath, () =>
      console.log("Temporary Post Call Review PDF deleted")
    );
    fs.unlink(tablePdfPath, () => console.log("Temporary Table PDF deleted"));
  } catch (err) {
    console.error("Error in fetchLatestTranscriptAndSendPDFEmail:", err);
  }
}

function generatePostCallReviewPDF({
  firstName,
  lastName,
  phoneNumber,
  occupation,
  summary,
  transcript,
  convoId,
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const filePath = path.join(__dirname, `Post_Call_Review_${convoId}.pdf`);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const addNewPageIfNeeded = (requiredHeight, sectionTitle = null) => {
      const bottomMargin = doc.page.height - doc.page.margins.bottom;
      if (doc.y + requiredHeight > bottomMargin) {
        doc.addPage();
        if (sectionTitle === "transcript") {
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

    // Full Transcript section
    doc.moveDown(1.2);
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
      const transcriptLineHeight =
        doc.heightOfString(`${label} ${message}`, {
          width:
            doc.page.width - doc.page.margins.left - doc.page.margins.right,
        }) + 10; // Use full text width
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

function generateQuestionnairePDF({
  firstName,
  lastName,
  occupation,
  convoId,
  results,
  electricianInterviewQuestionnaire,
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const filePath = path.join(__dirname, `Table_${convoId}.pdf`);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const tableX = 40;
    const tableWidth = 515;
    const questionColWidth = tableWidth * 0.7;
    const answerColWidth = tableWidth * 0.3;
    const rowPadding = 5;
    const headerHeight = 25;

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

    const addNewPageIfNeeded = (
      requiredHeight,
      isFirstRowOfCategory = false
    ) => {
      const bottomMargin = doc.page.height - doc.page.margins.bottom;
      const additionalSpaceForCategoryHeader = isFirstRowOfCategory ? 25 : 0;
      if (
        doc.y + requiredHeight + additionalSpaceForCategoryHeader >
        bottomMargin
      ) {
        doc.addPage();
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
        );
      }
    };

    doc
      .fontSize(22)
      .fillColor("#003366")
      .text(
        `${firstName.toUpperCase()} ${lastName.toUpperCase()} - Questionnaire`,
        { align: "center" }
      );
    doc
      .fontSize(14)
      .fillColor("#333")
      .text(`Position Applied: ${occupation}`, { align: "center" });
    doc.moveDown(1);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(1);

    doc
      .fontSize(18)
      .fillColor("#003366")
      .text("Electrician Interview Questionnaire", { align: "center" });
    doc.moveDown(0.5);

    drawTableHeaders(doc, tableX, questionColWidth, answerColWidth, rowPadding);

    electricianInterviewQuestionnaire.forEach((category) => {
      addNewPageIfNeeded(25 + 20, true);

      let currentY = doc.y;
      const categoryTitleHeight = 25;
      doc.rect(tableX, currentY, tableWidth, categoryTitleHeight).stroke();
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
        const effectiveCellHeight = Math.max(cellHeight, 20);

        addNewPageIfNeeded(effectiveCellHeight);

        currentY = doc.y;

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

        doc.font("Helvetica").fontSize(10).fillColor("#000000");
        doc.text(questionText, tableX + rowPadding, currentY + rowPadding, {
          width: questionColWidth - 2 * rowPadding,
          align: "left",
          lineGap: 2,
          stroke: false,
        });

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
          const lineStartX = tableX + questionColWidth + rowPadding;
          const lineEndX = tableX + tableWidth - rowPadding;
          const lineY = currentY + effectiveCellHeight - rowPadding;

          doc
            .moveTo(lineStartX, lineY)
            .lineTo(lineEndX, lineY)
            .strokeColor("#cccccc")
            .stroke();
        }

        doc.y = currentY + effectiveCellHeight;
      });
    });

    doc.end();
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);

const electricianInterviewQuestionnaire = [
  {
    categoryTitle: "Years of Experience",
    questions: [
      {
        question: "How many total years have you worked as an electrician?",
        fieldId: "years_experience_total",
      },
      {
        question: "How many years have you worked in commercial construction?",
        fieldId: "years_experience_commercial",
      },
      {
        question: "How many years have you worked in industrial construction?",
        fieldId: "years_experience_industrial",
      },
      {
        question: "How many years have you worked in residential construction?",
        fieldId: "years_experience_residential",
      },
    ],
  },
  {
    categoryTitle: "Work Preference and Project Experience",
    questions: [
      {
        question:
          "What type of work do you prefer—commercial, industrial, or residential? Why?",
        fieldId: "work_preference_reason",
      },
      {
        question:
          "Have you worked on multi-story commercial buildings, office spaces, retail centers, or large-scale projects?",
        fieldId: "project_experience_commercial",
      },
      {
        question:
          "Have you worked on factories, manufacturing plants, or heavy industrial sites?",
        fieldId: "project_experience_industrial",
      },
    ],
  },
  {
    categoryTitle: "Tools & Licensing",
    questions: [
      {
        question: "Do you have your own hand tools for electrical work?",
        fieldId: "tools_owned",
      },
      {
        question:
          "Do you have a state-issued, non-expired electrical license? (Journeyman, Master, or Apprentice?)",
        fieldId: "license_status",
      },
      {
        question:
          "Do you have the hand tools required to perform electrical work on commercial and industrial projects?",
        fieldId: "tools_required",
      },
      {
        question:
          "Do you have basic (unbranded) PPE? (Work Boots (Reg Steel Composite), Hard Hat, Safety Glasses, Safety Vest, Other)",
        fieldId: "ppe_ownership",
      },
    ],
  },
  {
    categoryTitle: "Commercial vs. Industrial vs. Residential Experience",
    questions: [
      {
        question: "What percentage of your experience is in commercial work?",
        fieldId: "percentage_experience_commercial",
      },
      {
        question: "What percentage of your experience is in industrial work?",
        fieldId: "percentage_experience_industrial",
      },
      {
        question: "What percentage of your experience is in residential work?",
        fieldId: "percentage_experience_residential",
      },
      {
        question:
          "Have you recently done electrical work in commercial buildings (like schools, hospitals, or office spaces)?",
        fieldId: "recent_commercial_experience",
      },
      {
        question:
          "Have you worked in High-Voltage, Medium-Voltage, or Low-Voltage?",
        fieldId: "voltage_experience",
      },
      {
        question:
          "Have you worked in new residential construction or home remodels?",
        fieldId: "residential_construction_type",
      },
      {
        question:
          "Do you know other electricians with 2 years of commercial and/or industrial experience?",
        fieldId: "peer_network_experience",
      },
    ],
  },
  {
    categoryTitle: "Work Requirements & Safety",
    questions: [
      {
        question:
          "How soon could you start if a position were to become available?",
        fieldId: "availability_start",
      },
      {
        question:
          "Do you have any upcoming appointments that may hinder you from starting?",
        fieldId: "availability_hindrance",
      },
      {
        question: "What are your minimum hourly pay requirements?",
        fieldId: "pay_requirements",
      },
      {
        question:
          "Are you currently working? If yes, why are you looking for a new job?",
        fieldId: "current_employment_reason",
      },
      {
        question:
          "Do you have any safety training or certifications? (OSHA, Ariel Lift, etc.)",
        fieldId: "safety_certifications",
      },
      {
        question: "Can you operate scissor lifts or boom lifts?",
        fieldId: "lift_operation_experience",
      },
      {
        question: "Are you available for overtime or weekend work if needed?",
        fieldId: "overtime_availability",
      },
      {
        question: "Do you have the proper identification for employment?",
        fieldId: "employment_identification",
      },
      {
        question: "Are you willing to travel if a per-diem is offered?",
        fieldId: "travel_availability",
      },
    ],
  },

  {
    categoryTitle: "Electrical Skills",
    questions: [
      {
        question:
          "Have you done wire pulling before? (Commercial, Industrial, or Residential?)",
        fieldId: "wire_pulling_experience",
      },
      {
        question:
          "Have you installed electrical conduit in commercial or industrial buildings?",
        fieldId: "conduit_installation_experience",
      },
      {
        question:
          "What types of conduit bending have you done, and on a scale of 1 (entry level) to 5 (advanced) how would you rate yourself?",
        fieldId: "conduit_bending_overview",
      },
      {
        question: "• 90-degree bends (1-5)",
        fieldId: "bend_90_rating",
      },
      {
        question: "• 45-degree bends (1-5)",
        fieldId: "bend_45_rating",
      },
      {
        question: "• 3-point saddles (used to go over obstacles) (1-5)",
        fieldId: "saddle_3_point_rating",
      },
      {
        question: "• 4-point saddles (used for more complex offsets) (1-5)",
        fieldId: "saddle_4_point_rating",
      },
      {
        question:
          "• Offsets and kicks (used for aligning conduit to electrical boxes) (1-5)",
        fieldId: "offsets_kicks_rating",
      },
      {
        question:
          "What tools have you used for bending conduits? And How would you rate yourself on a (1-5) scale?",
        fieldId: "conduit_bending_tools_used",
      },
      {
        question: "• Hand Benders (1-5)",
        fieldId: "hand_benders_rating",
      },
      {
        question: "• Hydraulic Benders (1-5)",
        fieldId: "hydraulic_benders_rating",
      },
      {
        question: "• Mechanical Benders (1-5)",
        fieldId: "mechanical_benders_rating",
      },
      {
        question:
          "Do you have experience with the following types of conduit? (EMT) (GRC) (RMC) (RNC) (PVC)",
        fieldId: "conduit_type_experience",
      },
      {
        question: "Have you installed or worked on:",
        fieldId: "fixture_work_experience",
      },
      {
        question: "• Commercial Light Fixture Installation?",
        fieldId: "light_fixture_installation",
      },
      {
        question: "• Industrial Lighting or Motor Controls?",
        fieldId: "industrial_lighting_controls",
      },
      {
        question: "• Commercial Lighting and Electrical Panels?",
        fieldId: "lighting_electrical_panels",
      },
      {
        question:
          "• Switchgear & transformers (Commercial or Industrial settings)?",
        fieldId: "switchgear_transformers_experience",
      },
      {
        question:
          "How would you rate your NEC | National Electrical Code Knowledge? 1 (entry level) to 5 (advanced)",
        fieldId: "nec_knowledge_rating",
      },
      {
        question: "Are you experienced with Lock Out Tag Out Procedures?",
        fieldId: "lockout_tagout_experience",
      },
    ],
  },
  {
    categoryTitle: "Blueprint Reading & Layouts",
    questions: [
      {
        question: "Have you worked with commercial electrical blueprints?",
        fieldId: "blueprint_experience",
      },
      {
        question:
          "On a scale of 1 (entry level) to 5 (advanced), how would you rate your blueprint reading/interpretation skills?",
        fieldId: "blueprint_skills_rating",
      },
      {
        question: "Have you used blueprints to:",
        fieldId: "blueprint_usage_summary",
      },
      {
        question: "• Identify panel locations and circuit layouts?",
        fieldId: "blueprint_panel_layout",
      },
      {
        question: "• Find conduit runs and wire sizing?",
        fieldId: "blueprint_conduit_wire",
      },
      {
        question: "• Plan power distribution for buildings?",
        fieldId: "blueprint_power_distribution",
      },
      {
        question: "• Layout conduit before installation?",
        fieldId: "blueprint_conduit_layout",
      },
      {
        question:
          "• Review one-line diagrams (showing how power flows in a building)?",
        fieldId: "blueprint_one_line",
      },
      {
        question: "• Understand legend and symbol key in a blueprint?",
        fieldId: "blueprint_legend_symbols",
      },
      {
        question:
          "Have you worked with as-built drawings (blueprints that show final electrical work after installation)?",
        fieldId: "blueprint_as_built",
      },
    ],
  },
  {
    categoryTitle: "New Construction, Remodeling & Demolition",
    questions: [
      {
        question:
          "Have you worked on new commercial buildings from the ground up?",
        fieldId: "new_construction_experience",
      },
      {
        question:
          "Have you done remodeling work, like upgrading electrical systems in existing buildings?",
        fieldId: "remodeling_experience",
      },
      {
        question:
          "Have you worked on demolition projects where you had to safely remove old wiring?",
        fieldId: "demolition_experience",
      },
    ],
  },
  {
    categoryTitle: "Industry Experience",
    questions: [
      {
        question: "Office /High Rise Buildings",
        fieldId: "industry_office_highrise",
      },
      {
        question: "Hospitals Or Medical Centers",
        fieldId: "industry_hospitals",
      },
      {
        question: "Hotels Or Resorts",
        fieldId: "industry_hotels",
      },
      {
        question: "Retail Stores Or Malls",
        fieldId: "industry_retail",
      },
      {
        question: "Stadiums Or Casinos",
        fieldId: "industry_stadiums",
      },
      {
        question: "Airports Or Transportation Hubs",
        fieldId: "industry_airports",
      },
      {
        question: "Apartment Buildings or Condominiums",
        fieldId: "industry_apartments",
      },
    ],
  },
  {
    categoryTitle: "Other Information",
    questions: [
      {
        question: "Applicant Name:",
        fieldId: "applicant_name",
      },
      {
        question: "Contact Date:",
        fieldId: "contact_date",
      },
    ],
  },
];

module.exports = electricianInterviewQuestionnaire;

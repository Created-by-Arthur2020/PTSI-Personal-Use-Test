const APP_STATE_KEY = 'AUTONOMOUS_PM_AGENT_STATE';
const DEFAULT_AGENT_NAME = 'Autonomous Delivery Lead';
const DEFAULT_MODEL = 'heuristic';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Autonomous Delivery Lead')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getInitialState() {
  const state = loadState_();
  return {
    ok: true,
    state,
    capabilities: {
      llmConfigured: Boolean(getSecret_('OPENAI_API_KEY') || getSecret_('GEMINI_API_KEY')),
      supportedIngestion: [
        'Google Docs body text',
        'Plain text, markdown, CSV, JSON blobs',
        'Drive file metadata for other file types'
      ]
    }
  };
}

function saveDirective(input) {
  const state = loadState_();
  const now = new Date().toISOString();
  const directive = {
    id: createId_('directive'),
    title: sanitizeText_(input && input.title, 'New direction'),
    detail: sanitizeText_(input && input.detail, ''),
    source: sanitizeText_(input && input.source, 'manual'),
    impact: sanitizeText_(input && input.impact, 'medium'),
    createdAt: now
  };

  state.directives.unshift(directive);
  state.charter = mergeCharter_(state.charter, directive);
  state.lastUpdated = now;

  const planPackage = buildPlanPackage_(state, directive);
  state.lastPlan = planPackage;
  saveState_(state);

  return {
    ok: true,
    message: 'Direction captured and backlog refreshed.',
    directive,
    planPackage,
    state
  };
}

function ingestArtifact(input) {
  const state = loadState_();
  const now = new Date().toISOString();
  const artifact = normalizeArtifactInput_(input, now);

  if (artifact.driveFileId) {
    enrichArtifactFromDrive_(artifact);
  }

  artifact.summary = summarizeArtifact_(artifact);
  artifact.tags = deriveArtifactTags_(artifact);

  state.artifacts.unshift(artifact);
  state.lastUpdated = now;
  state.lastPlan = buildPlanPackage_(state, {
    title: 'Artifact ingested',
    detail: artifact.summary,
    impact: 'medium'
  });
  saveState_(state);

  return {
    ok: true,
    message: 'Artifact ingested successfully.',
    artifact,
    planPackage: state.lastPlan,
    state
  };
}

function runAutonomousCycle(input) {
  const state = loadState_();
  const now = new Date().toISOString();
  const cycle = buildAutonomousCycle_(state, input || {});
  state.cycles.unshift({
    id: createId_('cycle'),
    createdAt: now,
    focus: cycle.focus,
    summary: cycle.executiveSummary,
    payload: cycle
  });
  state.lastUpdated = now;
  state.lastPlan = cycle;
  saveState_(state);
  return { ok: true, cycle, state };
}

function updateAgentProfile(input) {
  const state = loadState_();
  state.profile = {
    name: sanitizeText_(input && input.name, DEFAULT_AGENT_NAME),
    mission: sanitizeText_(input && input.mission, state.profile.mission),
    operatingModel: sanitizeText_(input && input.operatingModel, state.profile.operatingModel),
    blackBeltFocus: sanitizeText_(input && input.blackBeltFocus, state.profile.blackBeltFocus),
    safeContext: sanitizeText_(input && input.safeContext, state.profile.safeContext),
    constraints: sanitizeText_(input && input.constraints, state.profile.constraints),
    preferredModel: sanitizeText_(input && input.preferredModel, state.profile.preferredModel || DEFAULT_MODEL)
  };
  state.lastUpdated = new Date().toISOString();
  saveState_(state);
  return { ok: true, state };
}

function resetWorkspace() {
  const state = createDefaultState_();
  saveState_(state);
  return { ok: true, state };
}

function loadState_() {
  const raw = PropertiesService.getScriptProperties().getProperty(APP_STATE_KEY);
  if (!raw) {
    return createDefaultState_();
  }

  const defaults = createDefaultState_();
  try {
    const parsed = JSON.parse(raw);
    return Object.assign(defaults, parsed, {
      profile: Object.assign({}, defaults.profile, parsed.profile || {}),
      charter: Object.assign({}, defaults.charter, parsed.charter || {}),
      directives: Array.isArray(parsed.directives) ? parsed.directives : [],
      artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
      cycles: Array.isArray(parsed.cycles) ? parsed.cycles : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : []
    });
  } catch (error) {
    return createDefaultState_();
  }
}

function saveState_(state) {
  PropertiesService.getScriptProperties().setProperty(APP_STATE_KEY, JSON.stringify(state));
}

function createDefaultState_() {
  const now = new Date().toISOString();
  const state = {
    profile: {
      name: DEFAULT_AGENT_NAME,
      mission: 'Act as the product manager and delivery lead for the project, continuously refining direction and next-best actions.',
      operatingModel: 'Continuous discovery + SAFe-aligned planning + Six Sigma process improvement.',
      blackBeltFocus: 'Use DMAIC thinking, VOC capture, CTQ framing, risk reduction, and measurable flow improvements.',
      safeContext: 'Maintain a lightweight SAFe portfolio-to-team flow: vision, features, enablers, risks, dependencies, PI objectives, and inspect-and-adapt learnings.',
      constraints: 'Work from the latest directives and ingested documents. Highlight assumptions before execution.',
      preferredModel: DEFAULT_MODEL
    },
    charter: {
      vision: 'Create an autonomous project lead that accepts evolving priorities and keeps the work organized.',
      successMeasures: [
        'Clear backlog ordered by value and risk',
        'Ability to ingest new documents continuously',
        'Visible SAFe-style planning outputs',
        'Six Sigma improvement opportunities tracked over time'
      ],
      currentPurpose: 'Stand up the first operational version of the delivery lead agent.',
      stakeholders: ['Sponsor', 'Product manager', 'Delivery lead', 'Implementation team']
    },
    directives: [],
    artifacts: [],
    cycles: [],
    decisions: [],
    lastPlan: null,
    lastUpdated: now
  };
  state.lastPlan = buildPlanPackage_(state, null);
  return state;
}

function normalizeArtifactInput_(input, now) {
  const artifact = {
    id: createId_('artifact'),
    createdAt: now,
    title: sanitizeText_(input && input.title, 'Untitled artifact'),
    sourceType: sanitizeText_(input && input.sourceType, 'manual'),
    description: sanitizeText_(input && input.description, ''),
    content: sanitizeText_(input && input.content, ''),
    driveFileId: extractDriveId_(sanitizeText_(input && input.driveUrlOrId, '')),
    mimeType: '',
    fileName: '',
    summary: '',
    tags: []
  };

  return artifact;
}

function enrichArtifactFromDrive_(artifact) {
  const file = DriveApp.getFileById(artifact.driveFileId);
  artifact.fileName = file.getName();
  artifact.mimeType = file.getMimeType();
  artifact.title = artifact.title === 'Untitled artifact' ? file.getName() : artifact.title;
  artifact.description = artifact.description || 'Imported from Google Drive.';

  if (artifact.mimeType === MimeType.GOOGLE_DOCS) {
    const doc = DocumentApp.openById(artifact.driveFileId);
    artifact.content = doc.getBody().getText();
  } else if (
    artifact.mimeType === 'text/plain' ||
    artifact.mimeType === 'text/csv' ||
    artifact.mimeType === 'application/json' ||
    artifact.mimeType === 'text/markdown'
  ) {
    artifact.content = file.getBlob().getDataAsString();
  } else {
    artifact.content = artifact.content || '[Binary or unsupported file body. Metadata captured only.]';
  }
}

function summarizeArtifact_(artifact) {
  const raw = [artifact.title, artifact.description, artifact.content].filter(Boolean).join('\n');
  const condensed = raw.replace(/\s+/g, ' ').trim();
  if (!condensed) {
    return 'Artifact captured with no textual body yet.';
  }

  const bullets = [];
  const sentences = condensed.split(/(?<=[.!?])\s+/).filter(Boolean);
  bullets.push(sentences[0] || condensed.slice(0, 180));

  const keywordHints = deriveArtifactTags_(artifact);
  if (keywordHints.length) {
    bullets.push('Signals: ' + keywordHints.slice(0, 5).join(', ') + '.');
  }

  return bullets.join(' ');
}

function deriveArtifactTags_(artifact) {
  const corpus = [artifact.title, artifact.description, artifact.content].join(' ').toLowerCase();
  const taxonomy = {
    safe: ['safe', 'program increment', 'pi planning', 'feature', 'enabler', 'epic', 'inspect and adapt'],
    six_sigma: ['dmaic', 'sigma', 'ctq', 'voice of customer', 'voc', 'root cause', 'defect'],
    roadmap: ['roadmap', 'milestone', 'release', 'timeline', 'launch'],
    risk: ['risk', 'dependency', 'blocker', 'issue', 'constraint'],
    operations: ['process', 'workflow', 'automation', 'handoff', 'sla']
  };

  return Object.keys(taxonomy).filter(key => taxonomy[key].some(term => corpus.indexOf(term) !== -1));
}

function mergeCharter_(charter, directive) {
  const next = Object.assign({}, charter);
  if (directive && directive.title) {
    next.currentPurpose = directive.title;
  }
  if (directive && directive.detail) {
    const stakeholderMatches = directive.detail.match(/stakeholder[s]?:\s*([^\n]+)/i);
    if (stakeholderMatches) {
      next.stakeholders = stakeholderMatches[1].split(',').map(function(part) {
        return part.trim();
      }).filter(Boolean);
    }
  }
  return next;
}

function buildPlanPackage_(state, trigger) {
  const workingState = state || {
    profile: {
      mission: 'Act as the product manager and delivery lead for the project.',
      safeContext: 'Maintain a lightweight SAFe planning flow.'
    },
    charter: { currentPurpose: 'Stand up the initial workspace.' },
    directives: [],
    artifacts: []
  };
  const directive = trigger || { title: 'Initial workspace', detail: '', impact: 'medium' };
  const artifactSignals = workingState.artifacts.slice(0, 5).map(function(item) {
    return item.summary;
  });

  const plan = {
    focus: directive.title,
    executiveSummary: generateExecutiveSummary_(workingState, directive, artifactSignals),
    safeOutputs: buildSafeOutputs_(workingState, directive, artifactSignals),
    sixSigmaOutputs: buildSixSigmaOutputs_(workingState, directive, artifactSignals),
    backlog: buildBacklog_(workingState, directive, artifactSignals),
    decisionsNeeded: buildDecisionList_(workingState, directive),
    nextReview: suggestReviewCadence_(workingState)
  };

  return plan;
}

function buildAutonomousCycle_(state, input) {
  const directive = {
    title: sanitizeText_(input.focus, state.charter.currentPurpose || 'Autonomous execution cycle'),
    detail: sanitizeText_(input.instructions, 'Run the next-best planning and execution review.'),
    impact: sanitizeText_(input.impact, 'high')
  };

  const basePlan = buildPlanPackage_(state, directive);
  basePlan.executionChecklist = [
    'Review newly ingested artifacts and update assumptions.',
    'Refine the top backlog items into the next sprint or work package.',
    'Escalate decisions and risks that exceed current authority.',
    'Record measurable outcomes for the next inspect-and-adapt checkpoint.'
  ];

  basePlan.autonomyGuardrails = [
    'Do not claim completion for work that has not been validated by a human or system signal.',
    'Treat unclear directives as hypotheses and surface assumptions.',
    'Prefer reversible actions and document why priorities changed.'
  ];

  if (state.profile.preferredModel !== DEFAULT_MODEL) {
    basePlan.llmResponse = generateLlmNarrative_(state, directive, basePlan);
  }

  return basePlan;
}

function generateExecutiveSummary_(state, directive, artifactSignals) {
  const artifactCount = state.artifacts.length;
  const directiveCount = state.directives.length;
  const topSignal = artifactSignals[0] || 'No supporting artifact has been ingested yet.';
  return [
    'Mission: ' + state.profile.mission,
    'Current purpose: ' + (state.charter.currentPurpose || directive.title) + '.',
    'Knowledge base: ' + artifactCount + ' artifact(s) and ' + directiveCount + ' directive(s) captured.',
    'Latest signal: ' + topSignal
  ].join(' ');
}

function buildSafeOutputs_(state, directive, artifactSignals) {
  return {
    strategicTheme: state.profile.safeContext,
    epicHypothesis: directive.title + ' will improve delivery focus by aligning new information with a living backlog.',
    features: [
      'Document ingestion workspace for ongoing context updates',
      'Autonomous planning cycle with prioritized backlog',
      'Decision log and dependency management lane'
    ],
    risks: [
      'Unclear priorities create rework unless directives are normalized.',
      'Binary file ingestion may require manual summary until richer parsing is added.',
      'Autonomous recommendations still need sponsor validation for irreversible commitments.'
    ],
    piObjectives: [
      'Keep the top three backlog items clear, testable, and value-ranked.',
      'Convert new sponsor directions into structured features and risks within one review cycle.',
      'Track inspect-and-adapt actions with measurable operational outcomes.'
    ],
    evidence: artifactSignals.slice(0, 3)
  };
}

function buildSixSigmaOutputs_(state, directive, artifactSignals) {
  return {
    dmaicPhase: state.artifacts.length < 2 ? 'Define / Measure' : 'Analyze / Improve',
    problemStatement: 'Project intent changes over time and important context can be trapped in documents or messages unless systematically ingested.',
    ctqs: [
      'Fast translation of new direction into backlog updates',
      'Visible risks, dependencies, and owner decisions',
      'Reduced rework from missed context or stale assumptions'
    ],
    rootCauseSignals: artifactSignals.length ? artifactSignals.slice(0, 2) : ['Need more evidence from ingested artifacts.'],
    improvementActions: [
      'Standardize intake for directives and documents.',
      'Measure cycle time from new direction to backlog update.',
      'Capture defect escapes where a missed assumption caused rework.'
    ],
    controlPlan: [
      'Review backlog order weekly or whenever a major directive arrives.',
      'Maintain a decision log for scope, dependency, and approval changes.',
      'Use simple KPIs: intake count, backlog freshness, blocked item age.'
    ]
  };
}

function buildBacklog_(state, directive, artifactSignals) {
  const backlog = [
    {
      title: 'Normalize the latest directive into a feature brief',
      type: 'Feature',
      priority: 'Must',
      rationale: 'Ensures the newest purpose is reflected in the operating charter.',
      acceptance: 'Updated problem, outcome, stakeholders, and constraints are visible.'
    },
    {
      title: 'Review recent artifacts for dependencies and risks',
      type: 'Enabler',
      priority: state.artifacts.length ? 'Must' : 'Should',
      rationale: 'Turns ingested knowledge into action instead of passive storage.',
      acceptance: 'At least three risks, assumptions, or dependencies are captured.'
    },
    {
      title: 'Prepare next iteration plan with measurable outcomes',
      type: 'Feature',
      priority: 'Should',
      rationale: 'Connects SAFe planning with Six Sigma control metrics.',
      acceptance: 'Objectives, measures, and review cadence are documented.'
    }
  ];

  if (artifactSignals.length) {
    backlog.push({
      title: 'Investigate top artifact signal',
      type: 'Spike',
      priority: 'Could',
      rationale: artifactSignals[0],
      acceptance: 'Summarize whether the signal changes scope, priority, or process.'
    });
  }

  return backlog;
}

function buildDecisionList_(state, directive) {
  return [
    'Which business outcome matters most for the next review window?',
    'Which items can the agent recommend autonomously versus requiring sponsor approval?',
    'What source of truth should be treated as authoritative when directions conflict?'
  ];
}

function suggestReviewCadence_(state) {
  return state.directives.length > 3
    ? 'Review within 24 hours because direction is changing frequently.'
    : 'Review weekly or whenever a major new directive/document arrives.';
}

function sanitizeText_(value, fallback) {
  const text = String(value == null ? '' : value).trim();
  return text || fallback || '';
}

function createId_(prefix) {
  return prefix + '_' + Utilities.getUuid().slice(0, 8);
}

function extractDriveId_(value) {
  if (!value) return '';
  const match = value.match(/[-\w]{25,}/);
  return match ? match[0] : value;
}

function getSecret_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function generateLlmNarrative_(state, directive, basePlan) {
  if (state.profile.preferredModel === 'openai') {
    return callOpenAi_(state, directive, basePlan);
  }
  if (state.profile.preferredModel === 'gemini') {
    return callGemini_(state, directive, basePlan);
  }
  return 'Heuristic mode active; no external model was called.';
}

function callOpenAi_(state, directive, basePlan) {
  const apiKey = getSecret_('OPENAI_API_KEY');
  if (!apiKey) {
    return 'OPENAI_API_KEY is not configured in Script Properties.';
  }

  const payload = {
    model: getSecret_('OPENAI_MODEL') || 'gpt-4.1-mini',
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'You are an autonomous product manager and delivery lead using SAFe and Six Sigma thinking. Respond concisely.'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify({ profile: state.profile, directive: directive, basePlan: basePlan })
          }
        ]
      }
    ]
  };

  const response = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  });

  const body = JSON.parse(response.getContentText());
  return (((body || {}).output || [])[0] || {}).content?.[0]?.text || 'No model narrative returned.';
}

function callGemini_(state, directive, basePlan) {
  const apiKey = getSecret_('GEMINI_API_KEY');
  if (!apiKey) {
    return 'GEMINI_API_KEY is not configured in Script Properties.';
  }

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(getSecret_('GEMINI_MODEL') || 'gemini-1.5-flash') +
    ':generateContent?key=' + encodeURIComponent(apiKey);
  const payload = {
    contents: [
      {
        parts: [
          {
            text: 'You are an autonomous product manager and delivery lead using SAFe and Six Sigma thinking. Respond concisely.\n' +
              JSON.stringify({ profile: state.profile, directive: directive, basePlan: basePlan })
          }
        ]
      }
    ]
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  });
  const body = JSON.parse(response.getContentText());
  return ((((body || {}).candidates || [])[0] || {}).content || {}).parts?.[0]?.text || 'No Gemini narrative returned.';
}

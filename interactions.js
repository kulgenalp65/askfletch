import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const INTERACTIONS_FILE = path.join(DATA_DIR, 'interactions.json');

// Ensure data directory and interactions file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(INTERACTIONS_FILE)) {
  fs.writeFileSync(INTERACTIONS_FILE, JSON.stringify([], null, 2), 'utf-8');
}

export function loadInteractions() {
  try {
    if (!fs.existsSync(INTERACTIONS_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(INTERACTIONS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading interactions.json:', err);
    return [];
  }
}

export function saveInteractions(interactions) {
  try {
    fs.writeFileSync(INTERACTIONS_FILE, JSON.stringify(interactions, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error saving interactions.json:', err);
    return false;
  }
}

// Topic categorization taxonomy based on David Fletcher & New Home Co-Brokering
export function detectTopicCategory(question = '', answer = '') {
  const combined = (question + ' ' + answer).toLowerCase();

  if (/commission|co-broker fee|compensation|procuring cause|split|broker agreement|paid by builder/i.test(combined)) {
    return 'Commission & Compensation Protection';
  }
  if (/registration|register|client registration|on-site sales|builder rep|sales office|30-day|first visit/i.test(combined)) {
    return 'Builder Relations & Client Registration';
  }
  if (/warranty|pre-drywall|walkthrough|punch list|inspection|builder warranty|blue tape|foundation/i.test(combined)) {
    return 'Warranty & Construction Inspections';
  }
  if (/rate|buydown|interest rate|mortgage|financing|builder incentive|closing cost credit|preferred lender/i.test(combined)) {
    return 'Financing, Rates & Incentives';
  }
  if (/contract|addendum|contingency|earnest money|escalation|purchase agreement|builder contract/i.test(combined)) {
    return 'Contracts & Contingencies';
  }
  if (/objection|script|resale vs new|convince|showing|buyer consultation|pitch|why buy new/i.test(combined)) {
    return 'Buyer Objections & Showing Scripts';
  }
  if (/disclosure|respa|license|licensing|state law|fair housing|agency|dual agency/i.test(combined)) {
    return 'Disclosures & Compliance';
  }
  return 'General Co-Brokering Principles';
}

// Jurisdiction detector
const JURISDICTIONS = [
  { name: 'Florida', regex: /\b(florida|fl)\b/i },
  { name: 'Texas', regex: /\b(texas|tx)\b/i },
  { name: 'California', regex: /\b(california|ca)\b/i },
  { name: 'Arizona', regex: /\b(arizona|az)\b/i },
  { name: 'North Carolina', regex: /\b(north carolina|nc)\b/i },
  { name: 'South Carolina', regex: /\b(south carolina|sc)\b/i },
  { name: 'Georgia', regex: /\b(georgia|ga)\b/i },
  { name: 'Nevada', regex: /\b(nevada|nv)\b/i },
  { name: 'Colorado', regex: /\b(colorado|co)\b/i },
  { name: 'Tennessee', regex: /\b(tennessee|tn)\b/i },
  { name: 'New York', regex: /\b(new york|ny)\b/i },
  { name: 'Washington', regex: /\b(washington|wa)\b/i },
  { name: 'Virginia', regex: /\b(virginia|va)\b/i },
  { name: 'Ohio', regex: /\b(ohio|oh)\b/i },
  { name: 'Illinois', regex: /\b(illinois|il)\b/i }
];

export function detectJurisdiction(text = '') {
  for (const j of JURISDICTIONS) {
    if (j.regex.test(text)) {
      return j.name;
    }
  }
  return 'General / National';
}

// Check for uncertainty, knowledge gaps, or frequently changing topics
export function detectUncertaintyOrGap(question = '', answer = '') {
  const lowerAnswer = answer.toLowerCase();
  const lowerQuestion = question.toLowerCase();

  // 1. Explicit knowledge gap
  const isKnowledgeGap =
    /do not have (verified|specific) (information|documentation|source|guidance)/i.test(lowerAnswer) ||
    /not (covered|found|available) in (the|david fletcher'?s) (knowledge base|course materials|materials)/i.test(lowerAnswer) ||
    /cannot find a confident answer/i.test(lowerAnswer) ||
    /knowledge gap/i.test(lowerAnswer) ||
    /outside (of )?david fletcher'?s/i.test(lowerAnswer);

  if (isKnowledgeGap) {
    return {
      flagged: true,
      reason: 'knowledge_gap',
      label: 'Knowledge Gap: Documentation missing from knowledge base'
    };
  }

  // 2. Frequently changing topic (interest rates, disclosure laws, specific builder terms)
  const isVolatileTopic =
    /interest rates?|mortgage rates?|rate buydown/i.test(lowerQuestion) ||
    /disclosure laws?|statutory disclosure/i.test(lowerQuestion) ||
    /changes frequently|frequently change|rates change daily|subject to change|market conditions fluctuate/i.test(lowerAnswer);

  if (isVolatileTopic) {
    return {
      flagged: true,
      reason: 'frequently_changing_topic',
      label: 'Frequently Changing Topic: Verify current local rates/statutes'
    };
  }

  // 3. General uncertainty
  const isUncertain =
    /consult (your|a) (local|broker|attorney|lender)|check with your (managing broker|real estate attorney)|varies significantly/i.test(lowerAnswer) &&
    /cannot be certain|cannot guarantee|verify before relying/i.test(lowerAnswer);

  if (isUncertain) {
    return {
      flagged: true,
      reason: 'uncertainty',
      label: 'Uncertainty Flag: Jurisdiction/broker verification required'
    };
  }

  return {
    flagged: false,
    reason: null,
    label: null
  };
}

// Log an interaction
export function recordInteraction({
  userId = 'guest',
  userEmail = 'Anonymous Agent',
  question,
  answer,
  sourcesUsed = []
}) {
  const interactions = loadInteractions();

  const topicCategory = detectTopicCategory(question, answer);
  const jurisdiction = detectJurisdiction(question);
  const flagInfo = detectUncertaintyOrGap(question, answer);

  const interaction = {
    id: 'int_' + crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    userId,
    userEmail,
    question: question.trim(),
    answer: answer.trim(),
    sourcesUsed: Array.isArray(sourcesUsed) ? sourcesUsed : [],
    topicCategory,
    jurisdiction,
    rating: null, // 'thumbs_up' | 'thumbs_down' | null
    feedbackReason: null, // 'Incorrect info' | 'Too vague' | 'Not relevant to my market' | 'Outdated' | 'Other'
    feedbackComment: null, // free-text
    ratedAt: null,
    flaggedForReview: flagInfo.flagged,
    flagReason: flagInfo.reason,
    flagLabel: flagInfo.label,
    reviewed: false,
    reviewedAt: null,
    reviewedBy: null,
    adminNotes: ''
  };

  interactions.unshift(interaction);
  saveInteractions(interactions);
  return interaction;
}

// Record feedback for an existing interaction
export function recordFeedback({
  interactionId,
  rating,
  feedbackReason,
  feedbackComment
}) {
  const interactions = loadInteractions();
  const index = interactions.findIndex(i => i.id === interactionId);

  if (index === -1) {
    return null;
  }

  const item = interactions[index];
  item.rating = rating === 'thumbs_down' ? 'thumbs_down' : 'thumbs_up';
  item.ratedAt = new Date().toISOString();

  if (feedbackReason) {
    item.feedbackReason = feedbackReason.trim();
  }
  if (typeof feedbackComment === 'string') {
    item.feedbackComment = feedbackComment.trim();
  }

  // If thumbs down, ensure it's surfaced for review
  if (rating === 'thumbs_down') {
    item.flaggedForReview = true;
    if (!item.flagReason) {
      item.flagReason = 'thumbs_down';
      item.flagLabel = `Agent Flagged: ${item.feedbackReason || 'Needs improvement'}`;
    }
  }

  saveInteractions(interactions);
  return item;
}

// Update review status and notes by admin
export function updateInteractionReview(interactionId, { reviewed, adminNotes, reviewedBy }) {
  const interactions = loadInteractions();
  const index = interactions.findIndex(i => i.id === interactionId);

  if (index === -1) {
    return null;
  }

  const item = interactions[index];
  if (typeof reviewed === 'boolean') {
    item.reviewed = reviewed;
    item.reviewedAt = reviewed ? new Date().toISOString() : null;
    item.reviewedBy = reviewed ? (reviewedBy || 'Administrator') : null;
  }
  if (typeof adminNotes === 'string') {
    item.adminNotes = adminNotes.trim();
  }

  saveInteractions(interactions);
  return item;
}

// Analyze repeated negative feedback patterns
export function analyzeRepeatedIssues(interactions = []) {
  const thumbsDown = interactions.filter(i => i.rating === 'thumbs_down');
  const topicCounts = {};
  const topicSamples = {};
  const questionClusters = {};

  for (const item of thumbsDown) {
    const topic = item.topicCategory || 'General Co-Brokering Principles';
    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    if (!topicSamples[topic]) {
      topicSamples[topic] = [];
    }
    if (topicSamples[topic].length < 3) {
      topicSamples[topic].push({
        id: item.id,
        question: item.question,
        reason: item.feedbackReason || 'Unspecified',
        comment: item.feedbackComment || ''
      });
    }

    // Rough question grouping by key words
    const simplified = item.question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 4)
      .join(' ');
    
    if (simplified) {
      questionClusters[simplified] = (questionClusters[simplified] || 0) + 1;
    }
  }

  const repeatedTopics = [];
  for (const [topic, count] of Object.entries(topicCounts)) {
    if (count >= 2) {
      repeatedTopics.push({
        topic,
        count,
        severity: count >= 3 ? 'high' : 'medium',
        samples: topicSamples[topic] || [],
        recommendation: `Repeated thumbs-down (${count}x) detected in "${topic}". Review existing David Fletcher materials or upload specific documentation to address this recurring gap.`
      });
    }
  }

  // Sort by count descending
  repeatedTopics.sort((a, b) => b.count - a.count);

  return repeatedTopics;
}

// Calculate summary stats
export function getFeedbackStats(interactions = []) {
  const total = interactions.length;
  const rated = interactions.filter(i => i.rating !== null);
  const thumbsUp = interactions.filter(i => i.rating === 'thumbs_up');
  const thumbsDown = interactions.filter(i => i.rating === 'thumbs_down');
  const flagged = interactions.filter(i => i.flaggedForReview);
  const reviewed = interactions.filter(i => i.reviewed);
  const pendingReview = interactions.filter(i => (i.flaggedForReview || i.rating === 'thumbs_down') && !i.reviewed);

  const positiveRate = rated.length > 0 ? Math.round((thumbsUp.length / rated.length) * 100) : null;

  // Breakdown of negative reasons
  const reasonBreakdown = {};
  for (const item of thumbsDown) {
    const reason = item.feedbackReason || 'Not specified';
    reasonBreakdown[reason] = (reasonBreakdown[reason] || 0) + 1;
  }

  return {
    totalInteractions: total,
    ratedCount: rated.length,
    thumbsUpCount: thumbsUp.length,
    thumbsDownCount: thumbsDown.length,
    flaggedCount: flagged.length,
    reviewedCount: reviewed.length,
    pendingReviewCount: pendingReview.length,
    positiveRate: positiveRate !== null ? `${positiveRate}%` : 'N/A',
    reasonBreakdown,
    repeatedIssues: analyzeRepeatedIssues(interactions)
  };
}

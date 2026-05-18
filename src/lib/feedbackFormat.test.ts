import { describe, expect, it } from 'vitest'
import { buildFeedbackSections } from './feedbackFormat'

describe('buildFeedbackSections', () => {
  it('parses structured MCQ feedback', () => {
    const sections = buildFeedbackSections({
      isCorrect: false,
      score: 0,
      feedback: [
        'RESULT: wrong',
        'YOUR_ANSWER: C. Alcohol use',
        'CORRECT_ANSWER: B. H. pylori chronic infection',
        'WHY: Alcohol use is not the note-backed answer here.',
      ].join('\n\n'),
      sourceReminder: 'Quote',
      missingKeyPoints: [],
    })

    expect(sections.resultLabel).toBe('Wrong')
    expect(sections.yourAnswer).toBe('C. Alcohol use')
    expect(sections.correctAnswer).toBe('B. H. pylori chronic infection')
    expect(sections.why).toContain('Alcohol use')
  })

  it('parses old dense why feedback for saved attempts', () => {
    const sections = buildFeedbackSections({
      isCorrect: false,
      feedback: 'Why it is wrong: You selected C. Alcohol use, but the note-backed answer is B. H. pylori chronic infection. Why the correct answer is correct: H. pylori chronic infection is listed as a cause of Chronic Gastritis.',
    })

    expect(sections.resultLabel).toBe('Wrong')
    expect(sections.yourAnswer).toBe('C. Alcohol use')
    expect(sections.correctAnswer).toContain('B. H. pylori chronic infection')
    expect(sections.why).toContain('Chronic Gastritis')
  })

  it('uses the saved essay answer when model feedback omits YOUR_ANSWER', () => {
    const sections = buildFeedbackSections({
      isCorrect: false,
      userAnswer: 'I wrote about fatty liver and cirrhosis only.',
      feedback: [
        'RESULT: Wrong',
        'CORRECT_ANSWER: Fatty liver, alcoholic hepatitis, and cirrhosis.',
        "WHY: The answer misses alcoholic hepatitis.",
      ].join('\n'),
    })

    expect(sections.resultLabel).toBe('Wrong')
    expect(sections.yourAnswer).toBe('I wrote about fatty liver and cirrhosis only.')
    expect(sections.whyLabel).toBe("Why it's wrong")
    expect(sections.why).toContain('misses alcoholic hepatitis')
  })

  it('labels correct essay reasoning as improvement guidance', () => {
    const sections = buildFeedbackSections({
      isCorrect: true,
      userAnswer: 'Fatty liver, hepatitis and cirrhosis are the forms.',
      feedback: [
        'RESULT: Correct',
        'CORRECT_ANSWER: Fatty liver, alcoholic hepatitis, and cirrhosis.',
        'WHY: Good meaning. Add morphology details to improve.',
      ].join('\n'),
    })

    expect(sections.resultLabel).toBe('Correct')
    expect(sections.yourAnswer).toContain('Fatty liver')
    expect(sections.whyLabel).toBe('How can you improve that answer?')
  })

  it('uses normalized correctness over model RESULT text and keeps exact saved answer', () => {
    const sections = buildFeedbackSections({
      isCorrect: false,
      userAnswer: 'Exact saved answer from the student.',
      feedback: [
        'RESULT: Correct',
        'YOUR_ANSWER: Model paraphrased the answer.',
        'CORRECT_ANSWER: Source answer.',
        'WHY: Missing a source detail.',
      ].join('\n\n'),
    })

    expect(sections.resultLabel).toBe('Wrong')
    expect(sections.yourAnswer).toBe('Exact saved answer from the student.')
    expect(sections.whyLabel).toBe("Why it's wrong")
  })

  it('falls back to useful essay reasoning when model WHY is empty', () => {
    const sections = buildFeedbackSections({
      isCorrect: false,
      userAnswer: 'vghjbknl',
      feedback: [
        'RESULT: Wrong',
        'YOUR_ANSWER: vghjbknl',
        'CORRECT_ANSWER: Barrett Oesophagus is metaplastic columnar epithelium with goblet cells.',
        'WHY:',
      ].join('\n\n'),
    }, {
      id: 'q1',
      sessionId: 'session-1',
      resourceId: 'resource-1',
      type: 'short_essay',
      topic: 'Barrett',
      prompt: 'Define Barrett Oesophagus.',
      expectedAnswer: 'Barrett Oesophagus is metaplastic columnar epithelium with goblet cells.',
      keyPoints: ['metaplastic columnar epithelium', 'goblet cells'],
      explanation: 'Explanation',
      evidenceQuote: 'Replacement of distal squamous mucosa by metaplastic columnar epithelium containing goblet cells.',
      groundingConfidence: 'strong',
      verificationStatus: 'accepted',
    })

    expect(sections.whyLabel).toBe("Why it's wrong")
    expect(sections.why).toContain('does not include the note-backed answer')
    expect(sections.why).toContain('metaplastic columnar epithelium')
  })
})

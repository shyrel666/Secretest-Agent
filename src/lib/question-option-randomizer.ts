export interface QuestionOptionShape {
  options: string[];
  correctAnswer: number;
  lastUserAnswer?: number | null;
}

export function shuffleQuestionOptions<T extends QuestionOptionShape>(
  question: T,
  random: () => number = Math.random,
): T {
  if (!Array.isArray(question.options) || question.options.length <= 1) {
    return question;
  }

  if (!isValidAnswerIndex(question.correctAnswer, question.options.length)) {
    return question;
  }

  const entries = question.options.map((option, index) => ({
    option,
    index,
  }));

  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }

  const shuffledQuestion = {
    ...question,
    options: entries.map((entry) => entry.option),
    correctAnswer: entries.findIndex((entry) => entry.index === question.correctAnswer),
    lastUserAnswer: isValidAnswerIndex(question.lastUserAnswer, question.options.length)
      ? entries.findIndex((entry) => entry.index === question.lastUserAnswer)
      : question.lastUserAnswer ?? null,
  };

  assertQuestionOptionIntegrity(question, shuffledQuestion);
  return shuffledQuestion;
}

export function assertQuestionOptionIntegrity(
  original: QuestionOptionShape,
  randomized: QuestionOptionShape,
): void {
  if (original.options.length !== randomized.options.length) {
    throw new Error('Randomized question changed option count');
  }

  const originalSignature = buildOptionSignature(original.options);
  const randomizedSignature = buildOptionSignature(randomized.options);

  if (originalSignature !== randomizedSignature) {
    throw new Error('Randomized question changed option content');
  }

  if (!isValidAnswerIndex(randomized.correctAnswer, randomized.options.length)) {
    throw new Error('Randomized question produced an invalid correctAnswer index');
  }

  const originalCorrectOption = original.options[original.correctAnswer];
  const randomizedCorrectOption = randomized.options[randomized.correctAnswer];
  if (originalCorrectOption !== randomizedCorrectOption) {
    throw new Error('Randomized question remapped the correct answer to a different option');
  }

  if (isValidAnswerIndex(original.lastUserAnswer, original.options.length)) {
    if (!isValidAnswerIndex(randomized.lastUserAnswer, randomized.options.length)) {
      throw new Error('Randomized question lost the lastUserAnswer index');
    }

    const originalUserOption = original.options[original.lastUserAnswer];
    const randomizedUserOption = randomized.options[randomized.lastUserAnswer];
    if (originalUserOption !== randomizedUserOption) {
      throw new Error('Randomized question remapped the lastUserAnswer to a different option');
    }
  }
}

function isValidAnswerIndex(index: number | null | undefined, optionCount: number): index is number {
  return typeof index === 'number' && index >= 0 && index < optionCount;
}

function buildOptionSignature(options: string[]): string {
  return [...options].sort().join('\u0001');
}

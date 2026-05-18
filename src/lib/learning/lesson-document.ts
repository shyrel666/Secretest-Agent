export const LESSON_DOCUMENT_FORMAT_VERSION = 2;

export interface LessonPracticeQuestion {
  questionMarkdown: string;
  answerMarkdown: string;
}

export interface LessonDocument {
  contentMarkdown: string;
  practiceQuestions: LessonPracticeQuestion[];
}

export function cloneLessonDocument(document: LessonDocument): LessonDocument {
  return {
    contentMarkdown: document.contentMarkdown,
    practiceQuestions: document.practiceQuestions.map((question) => ({
      questionMarkdown: question.questionMarkdown,
      answerMarkdown: question.answerMarkdown,
    })),
  };
}

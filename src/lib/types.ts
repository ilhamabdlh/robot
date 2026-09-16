export type MeetingLanguage = "id" | "en";
export type AnswerModel = "gpt-4o-mini" | "gpt-4o";

export type KnowledgePack = {
  userBackground: string;
  interviewer: string;
  agenda: string;
  extra: string;
};

export type MeetingSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  language: MeetingLanguage;
  model: AnswerModel;
  autoAnswer: boolean;
  knowledge: KnowledgePack;
};

export type CueKind = "question" | "statement";
export type ResponseSource = "speech" | "screen";
export type Speaker = "self" | "other";

export type TranscriptLine = {
  id: string;
  at: number;
  speaker: Speaker;
  text: string;
  isQuestion: boolean;
  isStatement: boolean;
};

export type ResponseEntry = {
  id: string;
  at: number;
  cueKind: CueKind;
  cue: string;
  answer: string;
  source?: ResponseSource;
};

export type LivePayload = {
  sessionId: string;
  listening: boolean;
  lastQuestion: string;
  lastCueKind: CueKind | "";
  answer: string;
  answering: boolean;
  history: ResponseEntry[];
  updatedAt: number;
};

export const EMPTY_KNOWLEDGE: KnowledgePack = {
  userBackground: "",
  interviewer: "",
  agenda: "",
  extra: "",
};
